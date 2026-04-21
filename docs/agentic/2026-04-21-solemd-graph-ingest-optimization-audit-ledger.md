# SoleMD.Graph Ingest Optimization Audit Ledger
Date: 2026-04-21
Scope: `apps/worker/app/ingest/*`, `apps/worker/app/actors/ingest.py`, `apps/worker/app/db.py`, `apps/worker/app/telemetry/*`
Posture: analysis-first. No code changes in this ledger.

Non-negotiable constraints honored throughout:
- Legacy `engine/` not used as a template.
- Modern worker-owned package shape preserved.
- PG18 set-based semantics preferred over Python orchestration.
- Async-only orchestration; no sync-fallback recommendations.
- Ingest kept separate from corpus selection / evidence.

---

## 0. Method

7 parallel subagent tracks + direct spot-verification of high-impact claims:

| Track | Focus |
|---|---|
| A | Docs-only contract extraction (docs/rag/README, 14, 05, 06, 02, 09, 10, 15). |
| B | As-implemented execution map + DB touchpoint inventory. |
| C | asyncpg pool discipline, transactions, concurrency. |
| D | SQL set-based vs row-at-a-time writer audit. |
| E | Manifest registry, resume semantics, advisory-lock scope. |
| F | Observability alignment vs docs/rag/10. |
| G | Test coverage map + gap analysis + duplicate writer-base test verdict. |
| H | Test run results (pytest). |

Spot-verification performed against db.py, telemetry/metrics.py, runtime.py, writers/s2.py to confirm or downgrade the most load-bearing findings before committing them to this ledger.

---

## 1. Test-run result (Track H)

`uv run --project apps/worker pytest <7 ingest-focused files> -q`

- **26 passed, 0 failed, 2 warnings, 60.91s.**
- Warnings are testcontainers `wait_container_is_ready` deprecations — not ingest-related.
- Integration tests exercise a real Postgres via testcontainers (full DDL, COPY, advisory lock, publish). Unit tests for writer base backpressure are async-only, no DB.

Baseline is green; findings below are things the current green build is *not* asserting or is drifting from.

---

## 2. Current-state architecture map (condensed; full trace in §9)

```
cli.main / actors.start_release (Dramatiq async, max_retries=2, time_limit=6h)
  └─ run_release_ingest (runtime.py:99)
     ├─ acquire control connection (ingest_pool)               runtime.py:110
     ├─ pg_try_advisory_lock(hashtextextended("ingest:src:tag"))  runtime.py:476-486  (session-scoped)
     ├─ _ensure_source_release  (INSERT..ON CONFLICT)          runtime.py:489-517
     ├─ _open_or_resume_run     (SELECT, then UPDATE or INSERT) runtime.py:535-622
     ├─ _mark_source_release_ingesting (UPDATE)                runtime.py:521-532
     ├─ track_ingest_lock_age gauge task                       runtime.py:116
     ├─ track_active_worker_run context                        runtime.py:131-137
     │
     ├─ FOR family IN plan.family_names (SEQUENTIAL):          runtime.py:192
     │    ├─ if family in run.families_loaded: continue        runtime.py:194-195
     │    ├─ adapter.build_plan → stream_family (async iter)
     │    ├─ writer.load_family (per-family TaskGroup +
     │    │     Semaphore(ingest_max_concurrent_files))        writers/s2.py, writers/pubtator.py
     │    │     └─ per-file: own connection, per-batch tx,
     │    │         COPY / INSERT..ON CONFLICT / UPDATE..FROM
     │    │         / temp-buffer + INSERT..SELECT DISTINCT ON
     │    ├─ async with control_conn.transaction():            runtime.py:304
     │    │     adapter.promote_family (UPDATE..FROM for
     │    │       corpus_id backfill), then _mark_family_loaded
     │    └─ record_ingest_family_load metrics
     │
     ├─ _set_phase(indexing) / _set_phase(analyzing)
     ├─ _finalize_published  (UPDATE ingest_runs + source_releases)
     └─ finally: pg_advisory_unlock + record_ingest_run + lock-age task cancel
```

- **Control connection held for the ENTIRE run** (hours under real ingest). One permit of the ingest_write pool is dedicated to advisory-lock + status UPDATEs + family promotions.
- **Families are sequential; files within a family are concurrent** (semaphore-bounded TaskGroup).
- **Rows are streamed** (background thread → asyncio.Queue → async consumer → per-batch writer call). Backpressure is real via `queue_depth` (default 2).
- **Writers are per-family**, not per-row. Each family chooses its own on-disk shape: COPY, COPY-then-UPDATE..FROM patch, INSERT..ON CONFLICT via unnest, or temp-buffer + INSERT..SELECT DISTINCT ON.

---

## 3. DB touchpoint inventory (35 sites, condensed)

Full table in §10 references; summary here.

| Category | Sites | Notes |
|---|---|---|
| Control plane (ingest_runs, source_releases) | 12 | All set-based, none in row loops. |
| Advisory lock | 3 | session-scoped; release in `finally`. |
| Bulk ingest — `COPY` (`copy_records_to_table`) | 8 | papers_raw, paper_authors_raw, paper_assets_raw, s2orc_documents_raw, temp entity/relation buffers. |
| `INSERT..ON CONFLICT` via unnest arrays | 4 | venues, authors_raw, citation_metrics_raw, temp→stage merges. |
| `UPDATE..FROM` via unnest arrays | 3 | abstracts/tldrs patch, and pubtator/s2 corpus_id backfills. |
| DELETE pre-COPY (by paper_id array / release key) | 4 | idempotence mechanism for batch re-ingest; not a data purge. |
| Temp tables | 2 | `pg_temp.pt3_*_stage_buffer` with `ON COMMIT DELETE ROWS`. |

**Verdict on DB-shape contract (§A.2):** broadly aligned. All hot paths are set-based. No N+1, no per-row SELECTs. Three exceptions are in-memory preprocessing loops flagged in §5 (D-series).

---

## 4. Contract-vs-implementation mismatch table

| # | Contract (docs/rag) | Implementation | Severity | Anchor |
|---|---|---|---|---|
| M1 | `ingest_write` pool `statement_cache_size=128` (06 §2.1) | `statement_cache_size=0` | HIGH | db.py:72 |
| M2 | Advisory-lock key: `hashtext('ingest:'||source||':'||tag)::int8` (05 §10.1) | Uses `hashtextextended(..., 0)::bigint` — 64-bit variant. Collision space is wider (safer) but doesn't match the written contract literally. | LOW (behavior-safe, doc-drift) | runtime.py:477 |
| M3 | One entry actor per release; family loaders are async funcs, NOT messages-per-shard (05 §14.2). | ✓ Implemented. | OK | actors/ingest.py:31 |
| M4 | Resume keyed to `families_loaded TEXT[]`; no shard-level checkpoint (05 §14.5). | ✓ Implemented; family-level only. | OK | runtime.py:194-195, 651-663 |
| M5 | UNLOGGED → CREATE INDEX → SET LOGGED → VACUUM phase order (05 §4). | Partial: runtime sets `indexing`/`analyzing` phases via status enum and emits metrics, but there is NO code here that flips UNLOGGED→LOGGED, creates indexes, or runs VACUUM. Indexes are expected to live in DDL, and SET LOGGED is not exercised in the ingest path at all. | HIGH (contract drift — docs describe flow that code does not execute) | runtime.py:358-398 |
| M6 | Publish = single UPDATE on `ingest_runs.status = published` (05 §4.6). | ✓ Single UPDATE, plus a paired UPDATE on `source_releases.release_status='loaded'`. Latter is part of the same logical step; not multi-statement swap. | OK | runtime.py:680-704 |
| M7 | `record_ingest_run` outcome labels {published, aborted, failed} + per-phase histogram (05 §12.2). | ✓ Metric names match. | OK | telemetry/metrics.py:25-49 |
| M8 | Low-cardinality label set on metrics (10 §cardinality rules). | `WORKER_ACTIVE_RUN_INFO.run_label` embeds `ingest_run_id` UUID → unbounded cardinality every run. | CRITICAL | metrics.py:57-73, runtime.py:134 |
| M9 | `ingest_write` pool only; no admin/warehouse_read in ingest actor path (05 §14.4). | ✓ ingest_worker.py binds only `("ingest_write",)`. | OK | ingest_worker.py:9 |
| M10 | Structured logging w/ ingest_run_id, manifest, phase propagation (05 §12.3). | Pseudo-structured: `LOGGER.info("%s %s", event, json.dumps(fields))`. Aggregators see a single message string, not parsed fields. | MEDIUM | runtime.py:734 |
| M11 | Per-writer / per-source failure isolation in metrics. | `INGEST_FAILURES_TOTAL` labels are `(source_code, phase, failure_class)`; no `writer` / `family` label. | MEDIUM | metrics.py:46, runtime.py:452-457 |
| M12 | No row-level INSERT loops (05 §14.4). | ✓ Enforced. Only batched COPY / unnest-based INSERT. | OK | writers/s2.py, writers/pubtator.py |
| M13 | Family-load throughput counters by family (05 §12.2). | ✓ `INGEST_FAMILY_ROWS_TOTAL`, `INGEST_FAMILY_FILES_TOTAL`. | OK | metrics.py:36-45 |

The two rows most worth emphasizing: **M5 (the UNLOGGED/indexing/SET LOGGED flow is a doc that describes an unimplemented sequence)** and **M8 (ingest_run_id in a Prometheus label)**. M1 is a simple value-drift fix.

---

## 5. Findings ordered by severity

### 5.1 CRITICAL

**C1 — Cardinality bomb: `ingest_run_id` UUID embedded in `run_label` Prometheus label.**
`runtime.py:134` builds `run_label = f"{source_code}:{release_tag}:{ingest_run_id}"` and passes it as a Prometheus label value on `WORKER_ACTIVE_RUN_INFO` (and three sibling gauges, `metrics.py:57-92`). Every ingest run creates a new label-set tuple. Prometheus retains time series for the configured retention window, so under normal cadence (15-min poll, many releases) time-series count grows unbounded. Under multi-tenant failure-retry storms, series creation rate is the failure mode.
Anchor: `runtime.py:134`, `telemetry/metrics.py:57-92`.
Fix: drop `ingest_run_id` from `run_label`; use `(source_code, release_tag, run_kind)` as the metric key. `ingest_run_id` belongs in logs/traces.

**C2 — Advisory-lock hold is session-scoped but Dramatiq `time_limit` kill path is not trivially safe.**
Track E flagged a "hard deadlock" scenario. Verification: `runtime.py:23` sets Dramatiq `time_limit=6h`. PG's session-scoped advisory lock is released on connection close, so a hard kill that drops the connection *does* release the lock. BUT: if the worker process is killed while the asyncpg connection is idle-in-transaction, the backend may linger until `idle_in_transaction_session_timeout` / `tcp_keepalives_*` fire. Neither is set in `server_settings` (none passed — see db.py:91-99). Under a Dramatiq kill during a long COPY, the next retry can observe a stale lock for seconds-to-minutes.
Anchor: `actors/ingest.py:23` (time_limit), `db.py:91-99` (no server_settings).
Fix: (a) set `idle_in_transaction_session_timeout` and `tcp_keepalives_idle` on the pool's `server_settings`, (b) consider emitting a "force-release" admin operation path documented in runbook for pathological cases.

### 5.2 HIGH

**H1 — `statement_cache_size=0` on `ingest_write` contradicts `docs/rag/06 §2.1`.**
Anchor: `db.py:67-73` (value 0) vs contract value 128.
Impact: every control-plane query (`_set_phase`, `_mark_family_loaded`, `_assert_not_aborted`, `_open_or_resume_run`) re-parses and re-plans on every execute. On large ingests this is hundreds of thousands of avoidable parse cycles. The setting was likely set to 0 defensively (asyncpg + PgBouncer + transaction-mode), but per `docs/rag/00 §1` **there is no PgBouncer on the warehouse day one**. Align with contract: 128.
Fix: `db.py:72` → `statement_cache_size=settings.ingest_write_statement_cache_size` with default 128.

**H2 — `docs/rag/05 §4` UNLOGGED/CREATE INDEX/SET LOGGED/VACUUM sequence is not implemented in the runtime.**
`runtime.py:358-398` only sets `status=indexing` and `status=analyzing` and emits phase timing — no DDL, no VACUUM. There is no code path that:
- Creates the bulk tables as UNLOGGED,
- Builds indexes post-load,
- Flips SET LOGGED,
- Runs VACUUM (FREEZE, ANALYZE).
Either the contract is aspirational and the doc should call that out explicitly, OR the runtime must own this work. Today the indexing/analyzing status is a telemetry decoration over a no-op.
Anchor: `runtime.py:355-398`.
Fix options (pick one, don't do both): (a) implement the DDL phase sequence as an explicit post-loading step owned by runtime; (b) mark the §4 sequence as "DDL-managed externally (migrations + autovacuum)" in 05-ingest-pipeline.md and remove the aspirational phase names from the runtime.

**H3 — Control connection held for the entire ingest cycle.**
`runtime.py:110` acquires one `ingest_pool` connection and holds it through every family, every `_set_phase`, and finalize. On a release ingest that runs hours, this permanently consumes one pool slot. With `max_size` set per-host (`min=8, max=64` on 68 GB host per contract), that's a 1.5%–13% pool-capacity tax sustained for the full run, per concurrent release.
Anchor: `runtime.py:110-411`.
Fix: Use short-lived acquires per control-plane write (status updates, lock probes are cheap). Keep only the advisory-lock connection alive for the duration (it holds the session lock and can't be released early without dropping the lock). Split: one persistent lock-holder connection (tiny, idle), all mutations acquire briefly. Net: pool capacity regained, lock semantics unchanged.

**H4 — Per-writer / per-family failure isolation is absent in metrics.**
`INGEST_FAILURES_TOTAL` labels `(source_code, phase, failure_class)` but no `family` / `writer`. On a multi-family loading failure the only way to determine which family broke is logs.
Anchor: `telemetry/metrics.py:46`, `runtime.py:437-460`.
Fix: add `family` label (bounded by plan; ~10-50 values per source → safe cardinality). Emit from writer exception paths, not only the runtime-level exception handler.

**H5 — Pseudo-structured logging; no contextvars propagation.**
`runtime.py:734` `_emit_event` json-encodes fields inside the log message string. Log aggregators (Loki, etc.) must regex-extract to filter by `ingest_run_id`. Writers and sources use module `LOGGER` without context propagation — any warning emitted deep in s2.py loses run id.
Anchor: `runtime.py:734`.
Fix: wire `contextvars.ContextVar` for `ingest_run_id` / `source_code` / `release_tag`, and either use `structlog` or Python's `logging.LoggerAdapter` with extras to emit real structured JSON lines.

### 5.3 MEDIUM

**M1 — Pool has no `max_inactive_connection_lifetime`, no `server_settings`.**
`db.py:91-99`. Ingest runs can be hours; idle connections never recycle. Combine with C2: no `idle_in_transaction_session_timeout`. Low perf impact but meaningful reliability risk.

**M2 — Python-side aggregation for citation metrics (`s2.py:889-902`).**
Dict-based aggregation of `(reference_out_count, influential_count, linked_count, orphan_count)` per `citing_paper_id`, then exploded to parallel arrays. Replaceable with a single `INSERT..SELECT ... GROUP BY ... ON CONFLICT` using unnest + `COUNT(*) FILTER (WHERE …)`. Expected gain: material on large shards (approx 10–30× on the aggregation fragment; claims of 100× by Track D are not substantiated without a bench, so treat "material" as the honest answer here).

**M3 — Python-side dedup for publication venues (`s2.py:739-756`).**
Four `seen_*` sets in Python before the unnest payload is built. Replaceable with `SELECT DISTINCT ON (source_venue_id)` in the INSERT..SELECT or a `GROUP BY`. Same "material not 100×" caveat.

**M4 — Missing `WHERE` guard on citation metrics `ON CONFLICT DO UPDATE`.**
`s2.py:924-943`. Every conflict update rewrites the row even when every field is unchanged → WAL churn and autovacuum pressure at scale. Add `WHERE excluded.<col> IS DISTINCT FROM sr.<col>` (pattern already present in `pubtator.py:479-485`). Small gain, trivial to fix.

**M5 — DELETE-by-paper_id before COPY is not wrong but is a *per-batch* not *per-file* idempotence.**
`s2.py:590-592, 712-717`. The delete scope is the paper_ids of the *current batch*. A mid-file crash leaves prior batches' rows untouched. Resume re-streams the file — the same paper_ids get emitted and DELETE-then-COPY replays correctly. This is **fine** for crash-resume but **not** self-healing if a source release later drops a paper_id; that stale row lingers until an explicit cleanup runs. Not a regression; worth noting in the runbook.

**M6 — No readiness/liveness probe for the :9464 metrics endpoint.**
`bootstrap.py` forks the metrics exposition server. No explicit health endpoint; scrape liveness is the de facto check. Document the expected `curl http://127.0.0.1:9464/metrics` 200 as the probe and ensure compose/systemd unit reflects it.

**M7 — No retry vs terminal failure distinction in metrics.**
Dramatiq retries are transparent to the worker. Application has no counter for "retry attempted" vs "run terminal failed." Under a retry storm you see only terminal outcomes. Either add a `failure_type` label (transient|terminal) to `INGEST_FAILURES_TOTAL`, or expose Dramatiq's native retry counter explicitly.

### 5.4 LOW

- **L1:** Track G duplicate test file names (`test_ingest_writer_base.py` vs `test_ingest_writers_base.py`). No overlapping cases; pick one name and consolidate. Singular (`..._writer_base.py`) matches the module.
- **L2:** `IngestRunRecord.status` typed as `int`; PG CHECK enforces 1..7, but Pydantic accepts any int. Use `Literal[1,2,3,4,5,6,7]` or IntEnum.
- **L3:** `IngestPlan.plan_manifest` is untyped `dict`; resume accepts any shape.
- **L4:** `JSON/JSONB` codec init happens on every new connection (`db.py:103-115`). Cheap but can be moved into pool init once.
- **L5:** M2 doc-drift on advisory-lock hash function (`hashtext` in docs vs `hashtextextended` in code); prefer the code (safer 64-bit key), update the doc.

---

## 6. Test-gap section

High-ROI additions (each <1h unless noted):

| # | Test | Scope | Proves | Effort |
|---|---|---|---|---|
| T1 | `test_advisory_lock_cleanup_on_raise` | unit (integration) | Lock released on every exception path in `run_release_ingest` (loading/indexing/analyzing/finalize). Verify via `pg_locks` view or second `pg_try_advisory_lock` call. | S |
| T2 | `test_ingest_failures_counter_increments_per_family` | integration | Inject writer failure, assert `INGEST_FAILURES_TOTAL` increments with `(source_code, phase, failure_class)` and (after H4 fix) `family`. | S |
| T3 | `test_worker_active_run_gauge_decrements_on_exception` | integration | Force mid-phase exception, assert `WORKER_ACTIVE_RUN_INFO` series for that `run_label` ends at 0. | S |
| T4 | `test_statement_cache_applied_to_ingest_write_pool` | unit | After H1 fix, assert `asyncpg.Pool._statement_cache.get_max_size() == 128`. | S |
| T5 | `test_release_tag_min_length` + `test_max_files_per_family_bounds` | unit | Pydantic validation gates reject invalid StartReleaseRequest before dispatch. | S |
| T6 | `test_force_new_run_rejected_when_prior_run_started` | unit (integration already present for the reverse); invert. | Guard against silent double-run. | S |
| T7 | `test_control_connection_not_exclusively_held` (blocks on H3) | integration | After refactor, verify max-1 pool slot held during long idle periods. | M |
| T8 | `test_active_run_info_labels_exclude_ingest_run_id` | unit | After C1 fix, assert metric tuple does not include a UUID. | S |
| T9 | `test_dramatiq_fork_pool_initialization` | integration | Start a Dramatiq worker in-test and enqueue `start_release`; assert pool opened in post-fork event loop thread. | M |
| T10 | `test_orphan_release_row_on_source_paper_id_drop` (codifies M5) | integration | Document current behavior: dropping a paper_id in the next release does NOT clean up the prior row. Either assert the gap, or add a cleanup path and assert it. | M |

Consolidation: merge `test_ingest_writers_base.py` (3 cases) into `test_ingest_writer_base.py`.

---

## 7. Ranked backlog (ROI × risk)

Legend: Impact (H/M/L) · Effort (S/M/L) · Risk (Low/Med/High)

**Do now (no downside, small effort, real upside):**
1. Remove `ingest_run_id` from `run_label` (C1). Impact H · Effort S · Risk Low.
2. Set `statement_cache_size=128` for `ingest_write` (H1). Impact H · Effort S · Risk Low (revert trivial).
3. Add `idle_in_transaction_session_timeout` + `tcp_keepalives_idle` to pool `server_settings` (C2). Impact H · Effort S · Risk Low.
4. Add `family` label to `INGEST_FAILURES_TOTAL` + emit from writer exception paths (H4). Impact H · Effort S · Risk Low.
5. Add `WHERE excluded.X IS DISTINCT FROM sr.X` guard to citation metrics upsert (M4). Impact M · Effort S · Risk Low.
6. Consolidate `test_ingest_writers_base.py` into `test_ingest_writer_base.py` (L1). Impact L · Effort S · Risk Low.
7. Add T1, T2, T3, T4 (ledger §6). Catches regressions for items 1–4. Effort S each.

**Next (has a design call attached):**
8. Resolve M5/H2: either (a) implement UNLOGGED/CREATE INDEX/SET LOGGED/VACUUM in `runtime.py` as real phases, or (b) delete those phase names from code and edit `docs/rag/05-ingest-pipeline.md §4` to say DDL is migration-owned and SET LOGGED is manual/external. Do not ship a third telemetry-only pass that pretends those phases happen.
9. Shorten control-connection hold (H3) — refactor to per-write acquires + a dedicated idle lock-holder connection. This is the single biggest pool-capacity improvement under multi-release concurrency. Effort M.
10. Structured logging w/ contextvars (H5). Effort M.

**Later (optimization, bench first):**
11. SQL-side citation metrics aggregation (M2). **Bench before committing** — claim of 100× is not substantiated; measure with a realistic shard. Effort M.
12. SQL-side dedup for publication venues (M3). Bench first. Effort M.
13. Pydantic strictness (L2, L3). Effort S.
14. Readiness probe documentation and liveness unit (M6). Effort S.

**Do not:**
- Do not add per-shard Dramatiq messages to parallelize families (violates §14.2).
- Do not add row-level checkpoint tables (violates §14.5).
- Do not weaken idempotence by removing DELETE-pre-COPY in s2 writers (the pattern is load-bearing for crash-resume).
- Do not chase 100× claims from the D-series without a before/after bench.

---

## 8. Recommended implementation plan

**Slice A — "Correctness + metrics hygiene" (1–2 days).**
Scope: C1, H1, H4, M4, T1/T2/T3/T4/T8, L1.
Outcome: safe cardinality, contract-aligned pool, isolated failure counters, self-verifying tests. Zero behavioral risk.

**Slice B — "Pool capacity" (2–3 days).**
Scope: C2, M1, H3 (control-connection split), T7, T9.
Outcome: pool not starved by long ingest; stale-lock timeline bounded; Dramatiq fork-safety codified in test.

**Slice C — "Contract resolution on phases" (design + 1 day after sign-off).**
Scope: H2 (decision: implement or document), T10.
Outcome: 05-ingest-pipeline.md and runtime.py agree on what happens between "loading done" and "published".

**Slice D — "Logging + observability polish" (1 day).**
Scope: H5, M6, M7.

**Slice E — "Throughput optimizations (benched)" (1–2 days + bench harness).**
Scope: M2, M3. Requires a bench fixture; don't ship blind.

Keep slices ordered. A, B, D are independent and can interleave. C needs a written decision first.

---

## 9. Execution trace (reference detail)

Condensed call tree retained from Track B. Full tree, including per-family branches for publication_venues / authors / papers / abstracts / tldrs / citations / s2orc_v2 / biocxml / bioconcepts / relations, is reproduced verbatim in the subagent reports. Key anchors:

- CLI → actor → runtime: `cli.py:9-61`, `actors/ingest.py:17-37`, `runtime.py:99-411`.
- Lock: `runtime.py:473-486` acquire, `runtime.py:470` release.
- Plan/resume: `runtime.py:535-622`.
- Per-family loop: `runtime.py:192-333`.
- Writer entry table: `writers/s2.py:83` (dispatch) + per-family `_load_*`; `writers/pubtator.py:50` (dispatch) + `_load_biocxml_family`/`_load_entity_family`/`_load_relations_family`.
- Promote/backfill: `sources/semantic_scholar.py:486-504`, `sources/pubtator.py:376-421`.
- Control plane writes: `runtime.py:625-643` (_set_phase), `runtime.py:648-663` (_mark_family_loaded), `runtime.py:680-704` (_finalize_published).

---

## 9a. Slice A implementation record — 2026-04-21

Applied (code-only, no worker rotation; the rotation is owned by the
separate live-ingest cutover pass managed at the next family boundary):

| Fix | Change | Files |
|---|---|---|
| C1 | `run_label = f"{source_code}:{release_tag}"` — `ingest_run_id` removed from the Prometheus label; still present in log events and DB. | `apps/worker/app/ingest/runtime.py` |
| H1 | `ingest_write.statement_cache_size` 0 → 128 via new `INGEST_WRITE_STATEMENT_CACHE_SIZE`. | `apps/worker/app/config.py`, `apps/worker/app/db.py` |
| C2 | `server_settings` added to `ingest_write` pool: `idle_in_transaction_session_timeout=900000` (15 min), `tcp_keepalives_idle=60`, `_interval=10`, `_count=6`. New env vars `INGEST_WRITE_IDLE_IN_TRANSACTION_TIMEOUT_MS`, `INGEST_WRITE_TCP_KEEPALIVES_*`. | `apps/worker/app/config.py`, `apps/worker/app/db.py` |
| H4 | `INGEST_FAILURES_TOTAL` label set → `(source_code, phase, family, failure_class)`. `record_ingest_failure(..., family=)` wired at `runtime.py` exception handler. Pre-family failures emit `family=""`. | `apps/worker/app/telemetry/metrics.py`, `apps/worker/app/ingest/runtime.py` |
| L1 | `tests/test_ingest_writers_base.py` (plural) merged into `tests/test_ingest_writer_base.py` (singular matches `app.ingest.writers.base`). | `apps/worker/tests/test_ingest_writer_base.py`, removed `…_writers_base.py` |

Regression tests added:

- `test_ingest_runtime.py::test_writer_failure_releases_lock_and_records_family_failure` — forces writer to raise; asserts advisory lock released, `ingest_failures_total{family="citations"}` +1, no UUID-shaped segment in any `worker_active_run_info.run_label`.
- `test_telemetry_metrics.py::test_active_run_tracker_clears_labels_when_body_raises` — gauge falls to 0 when context body raises.
- `test_db.py::test_ingest_write_pool_spec_uses_contract_defaults` — asserts `statement_cache_size=128` and the four `server_settings` keys.

Suite: 29 passed, 60.8s.

**Downgraded during verification** (was CLAIMED by subagent Track D, failed
review):

- M4 — `WHERE IS DISTINCT FROM` guard on `s2_paper_reference_metrics_raw`
  upsert. Incoming `reference_out_count` is always ≥1 per row, so no-op
  update is unreachable and the guard never fires. Task deleted, not a
  real finding.

**Conflict resolution — 2026-04-21**: the live-ingest cutover pass
expected `run_label` to embed `ingest_run_id` in the new image. Resolved
in favor of C1 (bounded label); the observability campaign ledger
(`2026-04-19-solemd-graph-ingest-observability-campaign-ledger.md`) now
carries an amendment documenting the new verification shape.

**Held for later slices (unchanged from §7):** H2 (indexing/analyzing
contract), H3 (control connection hold), H5 (structured logging), M2 /
M3 (SQL aggregation optimizations — bench first), plus the remaining
ranked items.

---

## 10. DB touchpoint inventory (full table)

| file:line | op | target | in loop? | in tx? | set-based? |
|---|---|---|---|---|---|
| runtime.py:477 | SELECT (hashtextextended) | (compute) | N | N | Y |
| runtime.py:481 | SELECT pg_try_advisory_lock | (session) | N | N | N (by design) |
| runtime.py:496-517 | INSERT..ON CONFLICT | solemd.source_releases | N | N | Y |
| runtime.py:525-532 | UPDATE | solemd.source_releases | N | N | Y |
| runtime.py:543-552 | SELECT | solemd.ingest_runs | N | N | Y |
| runtime.py:575-590 | UPDATE | solemd.ingest_runs | N | N | Y |
| runtime.py:601-621 | INSERT | solemd.ingest_runs | N | N | Y |
| runtime.py:632-643 | UPDATE (phase) | solemd.ingest_runs | Y (phase loop) | N | Y |
| runtime.py:651-663 | UPDATE (families_loaded) | solemd.ingest_runs | Y (family loop) | Y | Y |
| runtime.py:673-677 | SELECT (requested_status) | solemd.ingest_runs | Y (poll) | N | Y |
| runtime.py:685-695 | UPDATE (publish) | solemd.ingest_runs | N | N | Y |
| runtime.py:696-704 | UPDATE (release loaded) | solemd.source_releases | N | N | Y |
| s2.py:446 | DELETE by source_release_id | solemd.s2_paper_reference_metrics_raw | N | Y | Y |
| s2.py:590-592 | DELETE paper_id = ANY($1) | solemd.s2_papers_raw | Y (file/batch) | Y | Y |
| s2.py:594-600 | COPY | solemd.s2_papers_raw | Y | Y | Y |
| s2.py:604-610 | COPY | solemd.s2_paper_authors_raw | Y | Y | Y |
| s2.py:612-618 | COPY | solemd.s2_paper_assets_raw | Y | Y | Y |
| s2.py:632-641 | UPDATE..FROM unnest | solemd.s2_papers_raw | Y | Y | Y |
| s2.py:712-717 | DELETE paper_id = ANY($1) | solemd.s2orc_documents_raw | Y | Y | Y |
| s2.py:719-725 | COPY | solemd.s2orc_documents_raw | Y | Y | Y |
| s2.py:757-830 | UPDATE + INSERT..ON CONFLICT | solemd.venues | Y | Y | Y |
| s2.py:841-861 | INSERT..ON CONFLICT unnest | solemd.s2_authors_raw | Y | Y | Y |
| s2.py:904-943 | INSERT..ON CONFLICT unnest (aggregate) | solemd.s2_paper_reference_metrics_raw | Y | Y | Y |
| sources/semantic_scholar.py:492-504 | UPDATE..FROM | solemd.s2_papers_raw | N | N | Y |
| sources/pubtator.py:383-397 | UPDATE..FROM | pubtator.entity_annotations_stage | N | N | Y |
| sources/pubtator.py:407-421 | UPDATE..FROM | pubtator.relations_stage | N | N | Y |
| writers/pubtator.py:392-405 | CREATE TEMP TABLE IF NOT EXISTS | pg_temp.pt3_*_buffer | per-conn | N | Y |
| writers/pubtator.py:414-420 | COPY | pg_temp.pt3_entity_..._buffer | Y | Y | Y |
| writers/pubtator.py:421-487 | INSERT..SELECT DISTINCT ON ... ON CONFLICT | pubtator.entity_annotations_stage | Y | Y | Y |
| writers/pubtator.py:497-503 | COPY | pg_temp.pt3_relations_..._buffer | Y | Y | Y |
| writers/pubtator.py:504-571 | INSERT..SELECT DISTINCT ON ... ON CONFLICT | pubtator.relations_stage | Y | Y | Y |
| writers/pubtator.py:583-587 | DELETE by resource | pubtator.entity_annotations_stage | N | Y | Y |
| writers/pubtator.py:599-603 | DELETE by relation_source | pubtator.relations_stage | N | Y | Y |
