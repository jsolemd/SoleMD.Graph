# Plan: Worker Hardening

Scope: `apps/worker/app/ingest/**`, `apps/worker/app/corpus/**`, `apps/worker/app/evidence/**`, `apps/worker/app/telemetry/**`, plus `actors/`, `broker.py`, `db.py`, `config.py`, `main.py`. Inputs: `tmp/audit/worker-ingest.md`, `tmp/audit/worker-corpus-evidence.md`, `tmp/audit/_codex_cross_review.md`.

---

## 1. Headline summary

Two independent audits converged on the same structural bug class: **DB connections and advisory locks are held across work they have no business bracketing** — NCBI HTTP in evidence, the orchestrator control connection aliased across N worker tasks, cleanup paths writing to poisoned transactions. These are pool-starvation, lock-held-across-cancellation, and `InFailedSQLTransactionError` failure modes; the half-applied `try/except Exception: LOGGER.exception` at `runtime.py:448-466` is already evidence the failure has fired in production.

Layered on top:
- **Non-transactional Dramatiq enqueue** (`wave_runtime._enqueue_wave_members`) that double-dispatches on crash, with blocking Redis sends inside an async loop.
- **Latent SQL-identifier injection** via f-string `UPDATE … SET {patch_column}` and unvalidated `copy_records` column lists.
- **Principle-9 violations**: the `release_scope` CTE duplicated 10+ times, 5-stage sequential DELETEs, unsorted UPDATE batches guaranteeing deadlock, PubTator bioconcepts using line numbers as fake `start_offset/end_offset` (silent data corruption), and PubTator relation subject/object inversion across TSV vs BioCXML paths.
- **No resilience** in the NCBI client (no retry for 429/503, urllib-through-threads, no circuit breaker, no batching of id_converter / esummary).
- **Zero self-observability on telemetry**, plus eight Python files over the 600-LOC ceiling.

Ordering: **Phase A kills correctness bugs** (silent corruption, double-dispatch, poisoned-txn cleanup). **Phase B kills scale blockers** (NCBI fanout, async correctness). **Phase C consolidates lifecycle helpers, splits oversized files, closes the observability gap**. Phase A carries regression tests that currently fail on `main`.

Top three priorities (§6): **A1** connection/lock bracketing, **A2** wave enqueue outbox, **A3** SQL identifier boundary.

---

## 2. Phase order

### Phase A — data-correctness blockers (weeks 1–2)

- **A1.** Evidence + ingest connection lifecycle bracketing.
- **A2.** Wave enqueue idempotency (outbox pattern).
- **A3.** SQL identifier allow-list at the writer boundary.
- **A4.** PubTator bioconcepts fake-offset corruption (worker-ingest M5).
- **A5.** PubTator relation subject/object canonicalization (worker-ingest M6).
- **A6.** Per-resource DELETE-before-reload resume corruption (worker-ingest M7).

### Phase B — scale + concurrency (weeks 3–4)

- **B1.** Dedicated abort-poll connection, then `LISTEN/NOTIFY` migration.
- **B2.** NCBI hardening: retry, httpx async, circuit breaker, id_converter batching.
- **B3.** Async-safe Dramatiq send (absorbed into A2).
- **B4.** UPDATE-batch sort order to eliminate deadlock class.
- **B5.** Citation-metrics double aggregation (worker-ingest M3).
- **B6.** `iter_file_batches` producer busy-wait elimination (worker-ingest M9).

### Phase C — modularization + observability (weeks 5–7)

- **C1.** Extract `corpus/run_lifecycle.py` — shared selection + wave (worker-corpus-evidence R1).
- **C2.** Extract `ingest/phases.py` — decompose `run_release_ingest` into phase controllers + `_record_terminal` bookkeeper (worker-ingest M1).
- **C3.** Collapse seven S2 / PubTator loader variants onto one `copy_files_concurrently` helper (worker-ingest R1, R2, R3).
- **C4.** Materialize `release_scope` CTE as a single SQL function (worker-corpus-evidence M1, M2, D1).
- **C5.** Telemetry self-observability.
- **C6.** Split the eight files over the 600-LOC ceiling.

Cross-phase dependencies: C2 depends on A1 (cannot reshape the abort-cleanup block before the fix lands). C1 depends on C6's runtime-file split. B1 `LISTEN/NOTIFY` depends on db-infra-ci agreeing to add a channel and session-mode pool routing.

---

## 3. Detailed work items

Each item: severity · sources · approach · files · open questions · effort · dependencies.

---

### A1. Connection + advisory-lock bracketing across HTTP work

**Severity**: CRITICAL (codex #3, #4; worker-corpus-evidence C1/C2; worker-ingest C1).

**Sources**:
- `apps/worker/app/evidence/runtime.py:53-260` — single `async with ingest_pool.acquire() as connection` wraps `resolve_locators` (NCBI) + `fetch_pmc_biocxml` (PMC) + the publish transaction.
- `apps/worker/app/evidence/runtime.py:54 / :260` — `pg_try_advisory_lock` held across the same span.
- `apps/worker/app/ingest/runtime.py:415-502` — four `except` branches write `_set_terminal_status` / `_emit_event` / `record_ingest_run` on a `control_connection` that `promote_family` may have poisoned with `InFailedSQLTransactionError`.
- `apps/worker/app/ingest/runtime.py:174-193` — abort poll reuses `control_connection`; `asyncio.Lock` prevents peer races but not collision with an in-flight `promote_family` on the same connection.

**Approach — evidence runtime**:

1. Split `acquire_paper_text` into three scopes, each opening its own `async with ingest_pool.acquire()`:
   - **Pre-flight (DB-only)**: load paper metadata, load existing current run, insert `started` run, take advisory lock. Commit.
   - **Fetch (HTTP-only, no connection)**: `resolve_locators` + `_fetch_first_available_payload`. No pool seat, no lock.
   - **Publish (DB-only)**: reacquire connection + advisory lock; open `connection.transaction()`; write spine + finalize run; release lock under `asyncio.shield` in `finally`.
2. Centralize lock key: add `apps/worker/app/evidence/lock.py::evidence_lock_key(corpus_id) -> tuple[str, int]` used by both acquire sites. Eliminates C5 drift (`:266` vs `:337`).

**Approach — ingest runtime**:

1. Drop the outer `async with control_connection.acquire()`; acquire per bookkeeping window.
2. Every `except` branch at `:415-500` calls a new `_record_terminal(pool, ingest_run_id, status, reason, …)` that opens a fresh `pool.acquire()` for each DB write; never reuse `control_connection`.
3. Abort polling uses a **dedicated long-lived read-only** connection opened once at run start, closed in `finally`. Prereq to B1.

**Files**: `apps/worker/app/evidence/runtime.py`, `apps/worker/app/evidence/lock.py` (new), `apps/worker/app/ingest/runtime.py`, `apps/worker/tests/test_ingest_runtime.py` (+`test_terminal_status_survives_poisoned_control_connection`), `apps/worker/tests/test_evidence_runtime.py` (+`test_http_does_not_hold_pool_connection`, `test_advisory_lock_released_before_http`, `test_evidence_lock_key_is_stable`).

**Open questions**: (Q-A1-1) `asyncio.shield` every terminal write? **Proposed**: yes. (Q-A1-2) Cache fetched payload on publish failure? **Proposed**: accept re-fetch. (Q-A1-3) Advisory lock release under shield? **Proposed**: yes.

**Effort**: 4–5 days. **Dependencies**: none; blocks B1, C2.

---

### A2. Wave enqueue idempotency — outbox pattern

**Severity**: CRITICAL (worker-corpus-evidence C3, C4).

**Sources**: `apps/worker/app/corpus/wave_runtime.py:534-578` — paginated `SELECT`, blocking `acquire_for_paper.send(...)` in async loop, `UPDATE … SET enqueued_at = now()` after each batch outside any transaction.

**Approach**:

1. Migration (handoff to db-infra-ci): add `corpus_wave_members.enqueue_dispatch_id UUID`, plus `solemd.dispatch_log(dispatch_id UUID PRIMARY KEY, acquired_at TIMESTAMPTZ DEFAULT now())`.
2. Rewrite `_enqueue_wave_members` around send-once:
   - `BEGIN`; `SELECT … FOR UPDATE SKIP LOCKED` batch where `enqueue_dispatch_id IS NULL`.
   - Assign `dispatch_id = uuid4()` per row; `UPDATE` `enqueue_dispatch_id` + `enqueued_at = now()`; `COMMIT`.
   - Post-commit, dispatch batch via `await asyncio.to_thread(_dispatch_batch, messages)` carrying `dispatch_id` in payload.
3. Actor-side dedupe: `INSERT INTO solemd.dispatch_log (dispatch_id) ON CONFLICT DO NOTHING RETURNING 1`; zero rows → drop as duplicate.
4. Reconciler: periodic actor finds `enqueued_at NOT NULL AND started_at IS NULL AND now() - enqueued_at > threshold`, resets `enqueue_dispatch_id = NULL, enqueued_at = NULL`.

Absorbs B3 (the `asyncio.to_thread` wrap) and the batch-size cap (D2).

**Files**: `apps/worker/app/corpus/wave_runtime.py`, `apps/worker/app/corpus/models.py`, `apps/worker/app/actors/corpus.py`, `db/migrations/warehouse/…_wave_dispatch_outbox.sql` (handoff), `apps/worker/tests/test_wave_runtime.py` (+`test_crash_between_send_and_mark_does_not_double_dispatch`, `test_commit_without_send_is_recovered_by_reconciler`, `test_dramatiq_send_does_not_block_event_loop`).

**Open questions**: (Q-A2-1) DB dispatch_log vs Redis-set dedup? **Proposed**: DB. (Q-A2-2) Reconciler cadence? **Proposed**: 60s periodic actor.

**Effort**: 3–4 days + migration cycle. **Dependencies**: db-infra-ci schema.

---

### A3. SQL identifier allow-list at writer boundary

**Severity**: CRITICAL (latent) (worker-ingest C3, C4).

**Sources**:
- `apps/worker/app/ingest/writers/s2.py:142, 155, 645-662` — `_apply_text_patch` interpolates `patch_column` as f-string; callers pass literal `"abstract"`/`"tldr"` today.
- `apps/worker/app/ingest/writers/base.py:74-138` — `copy_records` / `copy_files_concurrently` take arbitrary `columns` strings; asyncpg quotes table/schema but not columns.

**Approach**:

1. Add `apps/worker/app/ingest/writers/identifiers.py::assert_safe_identifier(name, *, context)` — regex `^[a-z_][a-z0-9_]*$`; raises `ValueError` otherwise.
2. Convert `_apply_text_patch` to take `TextPatchColumn(str, Enum)` with members `ABSTRACT = "abstract"`, `TLDR = "tldr"`; interpolate `.value`.
3. In `copy_records` and `copy_files_concurrently`, iterate `columns` and assert each. Assert `table_name` / `schema_name` too for defense-in-depth.
4. Grep every other f-string identifier in the writer layer; fold them in. Share the module with corpus/evidence writers (M11 worker-corpus-evidence centralizes lock-key strings analogously).

**Files**: `apps/worker/app/ingest/writers/identifiers.py` (new), `apps/worker/app/ingest/writers/s2.py`, `apps/worker/app/ingest/writers/base.py`, `apps/worker/tests/test_ingest_writer_base.py` (+`test_copy_records_rejects_unsafe_identifiers`, `test_text_patch_rejects_unknown_column`).

**Open questions**: (Q-A3-1) Centralize into `apps/worker/app/db_identifiers.py` across domains? **Proposed**: yes.

**Effort**: 1–2 days. **Dependencies**: none.

---

### A4. PubTator bioconcepts fake-offset corruption

**Severity**: CRITICAL (silent data corruption) (worker-ingest M5).

**Sources**: `apps/worker/app/ingest/sources/pubtator.py:351-353` synthesizes `start_offset = index, end_offset = index + 1`; unique key at `apps/worker/app/ingest/writers/pubtator.py:435-462` is `(source_release_id, pmid, start_offset, end_offset, concept_id_raw, resource)`.

**Approach**:

1. Parse real offsets from bioconcepts TSV columns 4–5; fall back to NULL when absent.
2. Migration (handoff to db-infra-ci): partial unique `(source_release_id, pmid, concept_id_raw, resource) WHERE start_offset IS NULL` + full key when offsets present. Validate against existing data.
3. Regression: duplicate-concept fixture collapses to one stage row.

**Files**: `apps/worker/app/ingest/sources/pubtator.py`, `apps/worker/app/ingest/writers/pubtator.py`, `db/migrations/pubtator/…_bioconcepts_unique_fix.sql` (handoff), `apps/worker/tests/test_ingest_runtime.py` (+`test_pubtator_bioconcepts_deduplicates_by_real_offsets`).

**Open questions**: (Q-A4-1) Are real offsets always present in PubTator3 bioconcepts TSV? **Proposed**: verify on 3 releases before committing unique-key shape.

**Effort**: 2 days. **Dependencies**: db-infra-ci migration.

---

### A5. PubTator relation subject/object canonicalization

**Severity**: CRITICAL (silent data corruption) (worker-ingest M6).

**Sources**:
- `apps/worker/app/ingest/sources/pubtator.py:363-393` — TSV path takes `parts[2]`/`parts[3]` verbatim.
- `apps/worker/app/ingest/sources/pubtator.py:526-543` — BioCXML path uses `_select_relation_node` role heuristics.

**Approach**: Extract `canonicalize_relation(predicate, entity1, entity2) → (subject, object)` encoding the asymmetric-predicate table from PubTator3 docs; use in both paths. Regression asserts identical `(subject_entity_id, object_entity_id)` across TSV + BioCXML for the same triple.

**Files**: `apps/worker/app/ingest/sources/pubtator.py`, `apps/worker/app/ingest/sources/pubtator_predicates.py` (new), `apps/worker/tests/test_ingest_runtime.py` (+`test_pubtator_relation_canonicalization_matches_across_paths`).

**Open questions**: (Q-A5-1) Canonical source for predicate asymmetry table? **Proposed**: mirror PubTator3 docs.

**Effort**: 1–2 days. **Dependencies**: none.

---

### A6. Per-resource DELETE-before-reload resume corruption

**Severity**: MAJOR (worker-ingest M7).

**Sources**: `apps/worker/app/ingest/writers/pubtator.py:120-133, 236-242, 295-301` — `_reset_release_resource` / `_reset_release_relation_source` fire unconditionally.

**Approach**: Gate DELETE to `WHERE last_seen_run_id <> $current_run_id` so current-run rows survive; move DELETE inside the transaction that performs the first COPY. Confirm `last_seen_run_id` exists; if missing, handoff to db-infra-ci.

**Files**: `apps/worker/app/ingest/writers/pubtator.py`, `apps/worker/tests/test_ingest_runtime.py` (+`test_pubtator_biocxml_resume_after_reset_does_not_lose_rows`).

**Open questions**: (Q-A6-1) `last_seen_run_id` column present on all PT stage tables? Check schema.

**Effort**: 1–2 days. **Dependencies**: possible column add.

---

### B1. Dedicated abort-poll connection → `LISTEN/NOTIFY`

**Severity**: MAJOR (worker-ingest C2, D6).

**Sources**: `apps/worker/app/ingest/runtime.py:174-193, 703-709`.

**Approach**:

Step 1 — ships with A1: abort poll on a dedicated long-lived read-only connection; released in outer `finally`.

Step 2 — `LISTEN/NOTIFY`: Postgres trigger `NOTIFY ingest_run_abort, run_id::text` in the status-change transaction; runtime opens `LISTEN ingest_run_abort` on its dedicated connection, maintains an `asyncio.Event` per run. `_assert_not_aborted` becomes `event.is_set()`. Fallback poll every 30 s to recover from missed notifications.

**Files**: `apps/worker/app/ingest/runtime.py`, `apps/worker/app/db.py`, `db/migrations/warehouse/…_ingest_abort_notify.sql` (handoff), `apps/worker/tests/test_ingest_runtime.py` (+`test_abort_via_notify_preempts_next_batch_within_1s`).

**Open questions**: (Q-B1-1) pgbouncer transaction-mode drops `LISTEN` — requires session-mode pool or direct connection routing. Handoff to db-infra-ci.

**Effort**: Step 1 folded into A1. Step 2 = 2–3 days + migration. **Dependencies**: A1, db-infra-ci pool routing.

---

### B2. NCBI client hardening

**Severity**: MAJOR (worker-corpus-evidence M9, M10, D8).

**Sources**: `apps/worker/app/evidence/ncbi.py:28-110, 113-142, 172-200, 204-242`.

**Approach**:

1. Replace `urllib.request.urlopen` + `asyncio.to_thread` with a shared `httpx.AsyncClient`; native AbortSignal forwarding.
2. Retry decorator with exponential backoff (`0.5, 1, 2, 4, 8s`, capped at `ncbi_max_retry_seconds`); honor `Retry-After` on 429/503.
3. Per-endpoint circuit breaker: open for 120 s after 5 failures in 60 s; fail fast with `PaperTextFetchFailed` while open.
4. Batch `id_converter` + `esummary` per wave (200-id chunks). Add `batch_resolve_locators(corpus_ids: list[int]) -> dict[int, Locator]`; wave runtime materializes a locator cache before fanout.

**Files**: `apps/worker/app/evidence/ncbi.py`, `apps/worker/app/evidence/runtime.py`, `apps/worker/app/config.py`, `apps/worker/tests/test_evidence_ncbi.py` (new, using `respx`/`pytest-httpx`).

**Open questions**: (Q-B2-1) API key per-process or per-client? **Proposed**: per-client. (Q-B2-2) Batch at wave or actor layer? **Proposed**: wave — materialize cache before fanout.

**Effort**: 3–4 days. **Dependencies**: A1.

---

### B3. Async-safe Dramatiq send

Absorbed into A2 (per-batch `asyncio.to_thread` around the dispatch step). If throughput demands, follow up with a single Redis `LPUSH` Lua script.

---

### B4. UPDATE-batch sort order

**Severity**: MAJOR (worker-ingest M2).

**Sources**: `apps/worker/app/ingest/writers/s2.py:380-431, 610-621, 645-662`.

**Approach**: Sort `(paper_ids, values)` Python-side before the `unnest` send; `ORDER BY paper_id` in the inner `unnest` subquery; sort before DELETE + COPY too (rowlock order).

**Files**: `apps/worker/app/ingest/writers/s2.py`, `apps/worker/tests/test_ingest_runtime.py` (+`test_concurrent_text_patch_updates_no_deadlock`).

**Effort**: 1 day. **Dependencies**: none.

---

### B5. Citation-metrics double aggregation

**Severity**: MAJOR (worker-ingest M3).

**Sources**: `apps/worker/app/ingest/writers/s2.py:885-949` (Python `GROUP BY`) + `:962-993` (server `SUM GROUP BY`).

**Approach**: Pick one. Preferred: keep Python per-batch aggregation, write to a `_per_batch` stage, promote via `INSERT ON CONFLICT`; drop the server re-aggregation. Benchmark on a 10M-row fixture.

**Files**: `apps/worker/app/ingest/writers/s2.py`.

**Open questions**: (Q-B5-1) Which variant benchmarks better? Measure before committing.

**Effort**: 2 days. **Dependencies**: none.

---

### B6. `iter_file_batches` producer busy-wait

**Severity**: MINOR (worker-ingest M9).

**Sources**: `apps/worker/app/ingest/writers/base.py:160-175` (100 ms poll).

**Approach**: Replace polling with a `loop.call_soon_threadsafe` done-callback on the future; producer waits on a `threading.Event`; consumer stops via `queue.put_nowait(_SENTINEL)`.

**Files**: `apps/worker/app/ingest/writers/base.py`, `apps/worker/tests/test_ingest_writer_base.py` (augment).

**Effort**: 1 day. **Dependencies**: none.

---

### C1. Extract `corpus/run_lifecycle.py`

**Severity**: MAJOR (worker-corpus-evidence R1).

**Sources**: `apps/worker/app/corpus/selection_runtime.py:307-361` and `apps/worker/app/corpus/wave_runtime.py:213-272` — `_set_*_phase`, `_mark_*_phase_completed`, `_finalize_*_published`, `_set_*_terminal_status`, `_open_or_resume_*_run`, `track_*_lock_age` are ~90% duplicated.

**Approach**: Parameterized `RunLifecycle` class taking `table`, `phase_sequence`, `lock_key_fn`, `terminal_status_codes`; exposes `set_phase`, `mark_phase_completed`, `finalize_published`, `set_terminal_status` (takes pool, opens own connection — A1 contract), `open_or_resume`, `track_lock_age`. Selection and wave shrink ~200 LOC each.

**Files**: `apps/worker/app/corpus/run_lifecycle.py` (new), `apps/worker/app/corpus/selection_runtime.py`, `apps/worker/app/corpus/wave_runtime.py`, `apps/worker/tests/test_corpus_run_lifecycle.py` (new).

**Effort**: 4 days. **Dependencies**: A1.

---

### C2. Extract `ingest/phases.py`

**Severity**: MAJOR (worker-ingest M1).

**Sources**: `apps/worker/app/ingest/runtime.py:99-502`.

**Approach**: Extract `FamilyProgressTracker` (4 callbacks + `update_family_progress`); `LoadingPhase`, `IndexingPhase`, `AnalyzingPhase` controllers; `IngestRunBookkeeper` owning `_record_terminal` with fresh-pool semantics. `run_release_ingest` collapses to ~120 LOC.

**Files**: `apps/worker/app/ingest/phases.py` (new), `apps/worker/app/ingest/bookkeeping.py` (new), `apps/worker/app/ingest/runtime.py`.

**Open questions**: (Q-C2-1) Share base class with `RunLifecycle`? **Proposed**: no — different tables, different vocabulary. Revisit if a third runtime lands.

**Effort**: 3 days. **Dependencies**: A1, A3.

---

### C3. Collapse duplicate loader helpers

**Severity**: MAJOR (worker-ingest R1, R2, R3).

**Sources**: orphaned `apps/worker/app/ingest/writers/base.py:74-138` (`copy_files_concurrently`) plus six near-identical workers at `apps/worker/app/ingest/writers/s2.py:249-287, 290-336, 339-377, 391-430, 456-495, 510-536` and two at `apps/worker/app/ingest/writers/pubtator.py:135-216, 341-388`.

**Approach**: Rewrite `copy_files_concurrently` to accept per-batch handler + optional setup/teardown hooks; return per-file metrics. Migrate eight loaders onto it (~30 LOC each). Delete locals.

**Files**: `apps/worker/app/ingest/writers/base.py`, `apps/worker/app/ingest/writers/s2.py`, `apps/worker/app/ingest/writers/pubtator.py`, `apps/worker/tests/test_ingest_writer_base.py`.

**Effort**: 3–4 days. **Dependencies**: A3.

---

### C4. `release_scope` as SQL function

**Severity**: MAJOR (worker-corpus-evidence M1, M2, D1).

**Sources**: 10+ copies of the scope CTE in `apps/worker/app/corpus/materialize.py` (`:62-141, 208-215, 284-292, 332-340, 352-363, 426-438, 453-461, 496-508, 524-531, 572-579`).

**Approach**: Ship `solemd.release_scope(release_id, status) RETURNS TABLE (corpus_id BIGINT)` SQL function (handoff to db-infra-ci). Rewrite all five surface upserts to `JOIN solemd.release_scope($1,$2) scope USING (corpus_id)`. Collapse `_clear_release_materialized_surfaces` into a single chained-CTE statement.

**Files**: `db/migrations/warehouse/…_release_scope_function.sql` (handoff), `apps/worker/app/corpus/materialize.py`, `apps/worker/tests/test_corpus_materialize.py`.

**Open questions**: (Q-C4-1) `STABLE` or `IMMUTABLE`? **Proposed**: `STABLE` (reads `s2_papers_raw`).

**Effort**: 3 days. **Dependencies**: db-infra-ci migration; index coverage audit on `s2_papers_raw(source_release_id, corpus_id)`.

---

### C5. Telemetry self-observability

**Severity**: MAJOR (worker-corpus-evidence M4, M5, M6).

**Sources**: `apps/worker/app/corpus/runtime_support.py:34-47`, `apps/worker/app/telemetry/metrics.py:617-636`, `apps/worker/app/telemetry/dramatiq_prometheus.py:96-97`, `apps/worker/app/evidence/runtime.py:383-392`.

**Approach**:

1. Add `TELEMETRY_EVENT_EMITTED = Counter("telemetry_events_emitted_total", ["event_name"])` and `TELEMETRY_EMIT_FAILURES = Counter("telemetry_emit_failures_total", ["reason"])`.
2. Wrap `json.dumps` in `emit_event` with `try/except Exception`; log + increment failure counter; never propagate.
3. Log exceptions returned from `_track_elapsed_gauge`'s swallowed gather.
4. `dramatiq_prometheus.__getattr__`: `if name.startswith("_"): raise AttributeError(name)`.
5. Delete `evidence/runtime.py:383-392`; import shared `emit_event`.
6. Fix `worker_active_run_info` label default to `"unknown"` not `""` (m11).

**Files**: `apps/worker/app/corpus/runtime_support.py`, `apps/worker/app/telemetry/metrics.py`, `apps/worker/app/telemetry/dramatiq_prometheus.py`, `apps/worker/app/evidence/runtime.py`, `apps/worker/tests/test_telemetry_metrics.py` (+`test_emit_event_never_raises`, `test_dramatiq_prometheus_getattr_rejects_private`).

**Effort**: 1–2 days. **Dependencies**: none.

---

### C6. 600-LOC ceiling — file splits

**Severity**: MAJOR (both audits' slice inventories).

Split plan:

| File | LOC | Split |
|---|---|---|
| `writers/s2.py` | 998 | Split per family: `writers/s2/papers.py`, `citations.py`, `authors.py`, `venues.py`, `patches.py`, `_shared.py`. After C3 each loader is ~150 LOC. |
| `runtime.py` | 783 | After C2: `ingest/phases.py`, `ingest/bookkeeping.py`, `ingest/constants.py`; orchestrator <500 LOC. |
| `selection_runtime.py` | 773 | After C1: SQL count helpers → `corpus/counters.py`; <400 LOC. |
| `wave_runtime.py` | 758 | After C1 + A2: `_enqueue_wave_members` outbox → `corpus/dispatch.py`; <400 LOC. |
| `sources/pubtator.py` | 650 | Per stream: `sources/pubtator/tsv.py`, `biocxml.py`, `predicates.py` (A5). |
| `telemetry/metrics.py` | 643 | Per domain: `telemetry/ingest_metrics.py`, `corpus_metrics.py`, `evidence_metrics.py` + shared `_increment`/`_observe` (C5). |
| `corpus/materialize.py` | 608 | After C4: `materialize/papers.py`, `documents.py`, `annotations.py`, `relations.py`. |
| `writers/pubtator.py` | 603 | Per resource: `writers/pubtator/entities.py`, `relations.py`, `biocxml.py`. |

**Open questions**: (Q-C6-1) Enforce 600-LOC via ruff/pre-commit? **Proposed**: yes once split lands.

**Effort**: 2–3 days, coordinated with C1–C4. **Dependencies**: C1, C2, C3, C4.

---

## 4. Cross-team handoffs

### To db-infra-ci-planner

1. **A2 outbox**: add `corpus_wave_members.enqueue_dispatch_id UUID`; add `solemd.dispatch_log(dispatch_id UUID PRIMARY KEY, acquired_at TIMESTAMPTZ DEFAULT now())`.
2. **A4 bioconcepts key**: replace unique index with partial `(source_release_id, pmid, concept_id_raw, resource) WHERE start_offset IS NULL` + full key with offsets; validate against prod data.
3. **A6 `last_seen_run_id`**: confirm column on PubTator stage tables; add if missing.
4. **B1 LISTEN/NOTIFY**: trigger on `ingest_runs` calling `pg_notify('ingest_run_abort', run_id::text)` when `requested_status` flips to ABORT; route LISTEN through session-mode pool (transaction-mode pgbouncer drops LISTEN).
5. **C4 `release_scope` function**: `CREATE OR REPLACE FUNCTION solemd.release_scope(release_id BIGINT, status SMALLINT) RETURNS TABLE (corpus_id BIGINT) LANGUAGE sql STABLE AS $$ SELECT corpus_id FROM solemd.s2_papers_raw WHERE source_release_id = $1 AND admission_status = $2 $$;`.
6. **Index coverage**: confirm `s2_papers_raw(source_release_id)`, `s2_papers_raw(source_release_id, corpus_id)`; add `s2_paper_reference_metrics_stage(source_release_id, ingest_run_id)` if missing (worker-ingest D5).
7. **CI**: merge `pytest` + `npm test` into `quality.yml` (codex Gap 2) — worker criticals have no regression gate otherwise.

### To api-packages-planner

1. **Shared exception types** — `IngestAborted`, `PaperTextUnavailable`, `PaperTextFetchFailed`, `SelectorPlanDrift`. If api surfaces these to clients, define one shared envelope shape `{code, message, request_id, run_id?}` and agree on the value set.
2. **Request-id propagation** — if C5 adds `request_id` to structured telemetry, api routes must mirror (addresses codex Gap 4 distributed-trace gap).
3. **Locator/resolver contract** — evidence runtime exposes `locator_kind`/`locator_value`. Coordinate value set (pmc/pmid/doi/none) + null semantics (M7 worker-corpus-evidence).
4. **`enqueue_dispatch_id` visibility** — if api exposes wave status, surface `enqueue_dispatch_id` alongside `enqueued_at` for operator-side tracing of a specific enqueue attempt.

---

## 5. Performance regression test list

**Phase A gates** (must fail on `main`, pass after fix):

1. `test_terminal_status_survives_poisoned_control_connection` — force `promote_family` to raise `InFailedSQLTransactionError`, assert terminal status persists.
2. `test_http_does_not_hold_pool_connection` — patch `resolve_locators` to block on an event; assert pool utilization stays at 0 during the block.
3. `test_advisory_lock_released_before_http` — `pg_advisory_unlock` fires before the NCBI call.
4. `test_evidence_lock_key_is_stable_across_acquire_and_insert` — one helper owns the key (C5 bug).
5. `test_wave_enqueue_crash_between_send_and_mark_does_not_double_dispatch`.
6. `test_wave_enqueue_commit_without_send_is_recovered_by_reconciler`.
7. `test_copy_records_rejects_unsafe_identifiers`.
8. `test_text_patch_rejects_unknown_column`.
9. `test_pubtator_bioconcepts_deduplicates_by_real_offsets`.
10. `test_pubtator_relation_canonicalization_matches_across_paths`.
11. `test_pubtator_biocxml_resume_after_reset_does_not_lose_rows`.

**Phase B gates**:

12. `test_abort_via_notify_preempts_next_batch_within_1s`.
13. `test_ncbi_retries_429_with_backoff`.
14. `test_ncbi_circuit_breaker_opens_after_5_failures`.
15. `test_resolve_locators_batches_200_ids` — 500 ids → 3 HTTP requests, not 500.
16. `test_dramatiq_send_does_not_block_event_loop`.
17. `test_concurrent_text_patch_updates_no_deadlock`.
18. `test_citation_metrics_aggregates_once` (query-plan EXPLAIN assertion).
19. `test_iter_file_batches_producer_cpu_idle` — producer CPU < 1% during backpressure.

**Phase C gates**:

20. `test_run_lifecycle_shared_between_selection_and_wave` — single parameterized suite covers both via `RunLifecycle`.
21. `test_release_scope_function_matches_inlined_cte` — result equivalence against a fixture release.
22. `test_emit_event_never_raises` — non-serializable object does not propagate.
23. `test_dramatiq_prometheus_getattr_rejects_private` — private-attr typos surface real `AttributeError`.
24. `test_file_loc_budget` — CI meta-check: no `apps/worker/app/**/*.py` file > 600 LOC.

**Observability gates** (before Phase C is "done"):

25. `telemetry_events_emitted_total{event_name}` on `/metrics`.
26. `telemetry_emit_failures_total{reason}` on `/metrics`.
27. `worker_active_run_info{locator}` uses `"unknown"`, not `""`.

---

## 6. Top 3 priorities summary

1. **A1 — connection + advisory-lock bracketing**. Both audits marked CRITICAL; codex confirmed. Pool-starvation + poisoned-transaction + silent-terminal-status-failure, all in one pattern. The `try/except Exception: LOGGER.exception` at `runtime.py:448-466` already proves this bug has fired in production. Ships with regression tests that currently fail on `main`.

2. **A2 — wave enqueue outbox**. Send-then-mark guarantees double-dispatch on crash. At wave fanout (thousands of `acquire_for_paper` per run) this becomes daily-frequency the moment the worker crash-loops. Outbox + per-batch `asyncio.to_thread` fixes idempotency and event-loop-blocking in one landing.

3. **A3 — SQL identifier allow-list**. Latent today (f-string column interpolated from literals) but trivial and closes the worst class of future footgun. Ships with C3 so one identifier boundary covers all writers.

Open questions: **12** (Q-A1-1..3, Q-A2-1..2, Q-A3-1, Q-A4-1, Q-A5-1, Q-B1-1, Q-B2-1..2, Q-B5-1, Q-C2-1, Q-C4-1, Q-C6-1).
