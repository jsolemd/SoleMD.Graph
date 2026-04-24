# Audit: worker-corpus-evidence

## Slice inventory

| File | LOC | Role |
|------|-----|------|
| `apps/worker/app/corpus/__init__.py` | 17 | Public surface for corpus runtime / models |
| `apps/worker/app/corpus/assets.py` | 410 | Curated asset loading + temp-table prep + COPY into vocab |
| `apps/worker/app/corpus/cli.py` | 59 | Pydantic request builders + Dramatiq enqueue |
| `apps/worker/app/corpus/errors.py` | 46 | Domain-error hierarchy |
| `apps/worker/app/corpus/materialize.py` | 608 | Canonical-surface upserts (papers/text/authors/annotations/relations) |
| `apps/worker/app/corpus/models.py` | 154 | Pydantic models (request, plan, run record) + phase tuples |
| `apps/worker/app/corpus/policies.py` | 262 | Hard-coded ENTITY/RELATION/VENUE rule tables + policy builders |
| `apps/worker/app/corpus/runtime.py` | 8 | Re-export wrapper for selection + wave runtimes |
| `apps/worker/app/corpus/runtime_support.py` | 48 | Status code constants + `digest_payload` + `emit_event` + `utc_now_iso` |
| `apps/worker/app/corpus/selection_runtime.py` | 773 | Selection orchestration (lock, plan, phases, telemetry) |
| `apps/worker/app/corpus/wave_runtime.py` | 758 | Wave dispatch (member selection + enqueue) |
| `apps/worker/app/corpus/selectors/__init__.py` | 4 | Re-export |
| `apps/worker/app/corpus/selectors/corpus.py` | 397 | Corpus admission SQL (4 phases) |
| `apps/worker/app/corpus/selectors/mapped.py` | 466 | Mapped promotion SQL (5 phases) |
| `apps/worker/app/corpus/selectors/provenance.py` | 334 | Selection-summary upsert |
| `apps/worker/app/evidence/__init__.py` | 2 | Empty namespace |
| `apps/worker/app/evidence/cli.py` | 24 | Request builder + enqueue |
| `apps/worker/app/evidence/errors.py` | 35 | Domain errors with optional `locator` payload |
| `apps/worker/app/evidence/models.py` | 54 | Pydantic models for paper/locator/manifest |
| `apps/worker/app/evidence/ncbi.py` | 296 | NCBI E-utilities + PMC BioC fetch (urllib via `asyncio.to_thread`) |
| `apps/worker/app/evidence/parser.py` | 292 | PMC BioC XML → spine document |
| `apps/worker/app/evidence/runtime.py` | 415 | Per-paper acquisition orchestration + DB writes |
| `apps/worker/app/telemetry/__init__.py` | 9 | Intentionally empty namespace |
| `apps/worker/app/telemetry/bootstrap.py` | 78 | Prometheus multiproc env preparation |
| `apps/worker/app/telemetry/dramatiq_prometheus.py` | 98 | Scoped Prometheus middleware adapter |
| `apps/worker/app/telemetry/metrics.py` | 643 | All worker counters/gauges/histograms + trackers |
| `apps/worker/app/corpus_worker.py` | 14 | Corpus dramatiq worker entry |
| `apps/worker/app/evidence_worker.py` | 14 | Evidence dramatiq worker entry |
| `apps/worker/app/document_schema.py` | 38 | Hard-coded smallint enums for document spine |
| `apps/worker/app/document_spine.py` | 196 | `replace_document_spines` + sentence fallback |

Total slice LOC: ~6,510. Two files at the 600-LOC threshold (`materialize.py` 608, `metrics.py` 643). `selection_runtime.py` and `wave_runtime.py` exceed 700 each.

---

## Critical issues

### C1. `evidence/runtime.py` holds one DB connection across remote HTTP fetches
`apps/worker/app/evidence/runtime.py:53–260`: the entire `acquire_paper_text` body runs inside `async with ingest_pool.acquire() as connection:` — including `resolve_locators` (multiple NCBI HTTP calls) and `fetch_pmc_biocxml` (PMC BioC download). NCBI timeouts are governed by `settings.ncbi_api_timeout_seconds`; with E-utilities backoff and PMC BioC payload size, a single paper can hold a pool connection for 30–60s+ while doing zero DB work. Under the corpus-wave fanout (`wave_runtime._enqueue_wave_members` enqueues thousands of `acquire_for_paper`), this will exhaust `ingest_write` pool capacity and stall everything else, including the wave runtime that lives on the same pool. The HTTP and parse work belongs outside the connection scope; only `_load_paper_metadata`, `_load_existing_current_run`, `_insert_started_run`, and the publish transaction need the connection.

### C2. PG advisory lock is held while NCBI is being contacted (and while blocking-thread urllib runs)
Same span as C1 — `pg_try_advisory_lock` is acquired at line 54 and released only in the outer `finally` at line 260, *after* all HTTP fetching, parsing, and the publish transaction. If the worker process is killed mid-fetch (SIGKILL/OOM), the advisory lock is implicitly released by Postgres on connection close, but if the connection is leased forever (pool starvation), the lock effectively pins the row pair indefinitely. The advisory lock should bracket only the DB-mutating section (and the metadata + existing-run check), not the network round trips.

### C3. `wave_runtime._enqueue_wave_members` performs blocking Dramatiq `.send` while inside an `await` loop
`apps/worker/app/corpus/wave_runtime.py:543–572` paginates through `corpus_wave_members` (good — batched), then calls the synchronous `acquire_for_paper.send(...)` (line 578) inside an async function for each row. `acquire_for_paper.send` performs a blocking Redis network round-trip per message. With the default batch size (`runtime_settings.corpus_wave_enqueue_batch_size`) potentially in the thousands, the event loop is blocked for the duration of all sends, starving the lock-age heartbeat task (`_update_elapsed_gauge`) and any other awaitables. Use `asyncio.to_thread` per batch, or use Dramatiq's `group`/pipeline primitives, or push the entire batch via a `LPUSH` script.

### C4. `_enqueue_wave_members` enqueues without transactional boundary across the whole batch
`wave_runtime.py:534–572` enqueues into Dramatiq, then updates `enqueued_at` after every batch — but *not* inside a transaction. If the worker crashes between `_send_evidence_enqueue` and the `UPDATE … SET enqueued_at = now()`, the messages are in Redis but the DB thinks they're un-enqueued, so the next run will double-enqueue. The whole "send-then-mark" pattern needs an outbox-style guarantee: either mark `enqueued_at = now()` first inside a transaction (accepting "may not have actually delivered" risk) or keep a per-message id-stamp in `corpus_wave_members` and dedupe on the actor side.

### C5. SQL parameter ordering bug risk in `selection_runtime._insert_started_run`
`apps/worker/app/evidence/runtime.py:317–341`: the indentation on `f"evidence:{request.corpus_id}",` (line 337) is off by 4 spaces relative to the surrounding parameters — clearly a manual edit slipped indentation. The actual call still works (asyncpg ignores indentation), but it's a smell that this section was hand-edited and not exercised. Worse: `_insert_started_run` re-derives the lock key string via `hashtextextended($1, 0)::bigint` from `f"evidence:{corpus_id}"` instead of taking the lock_key parameter that `_acquire_paper_lock` already computed. The two sites must agree byte-for-byte forever; centralize via a single `_evidence_lock_key(corpus_id)` helper that returns the bigint.

---

## Major issues

### M1. `materialize.py` repeats the "release_scope" CTE pattern 6+ times verbatim
`apps/worker/app/corpus/materialize.py:62–141` (`_clear_release_materialized_surfaces`), `:208–215` (`_upsert_papers` admitted_scope), `:284–292` (`_upsert_paper_text`), `:332–340` and `:352–363` (`_upsert_paper_authors`), `:426–438` and `:453–461` (`_replace_entity_annotations`), `:496–508` and `:524–531` and `:572–579` (`_replace_relations`) all rebuild "join `s2_papers_raw` to `solemd.corpus` filtering by `source_release_id` and domain status." This is a database-principle-9 violation: 10+ copies of the same scope expression. The right shape is a single materialized view or a `solemd.release_scope(release_id, status)` SQL function returning corpus_ids, joined once. As is, any change to admission semantics (e.g., adding a `mapped_pending` status) must be made in 10 places.

### M2. `_clear_release_materialized_surfaces` uses 5 sequential `DELETE`s instead of one statement
`apps/worker/app/corpus/materialize.py:62–141` issues 5 separate `DELETE`s with the same release_scope subquery — each plans its own scan over `s2_papers_raw`. A single statement using `WITH ... DELETE` chained via CTEs (similar to `document_spine.replace_document_spines:84–104`) would replan the scope once. As-is, on a 10M-row release this is 5 sequential sequential scans of `s2_papers_raw` filtered by `source_release_id`.

### M3. `selection_runtime.py` and `wave_runtime.py` both > 700 LOC and mix six concerns
Both files mix: lock acquisition, plan building, run-row state machine, phase orchestration, telemetry emission, and SQL upsert/select for counts. The state-machine helpers (`_set_*_phase`, `_mark_*_phase_completed`, `_finalize_*_published`, `_set_*_terminal_status`, `_open_or_resume_*_run`) are nearly identical between the two files. Extract a `_run_lifecycle.py` adapter that both selection and wave use; the orchestration loops should drop to ~300 LOC each.

### M4. Telemetry emit_event has zero observability of itself
`apps/worker/app/corpus/runtime_support.py:34–35` emits via `LOGGER.info("%s %s", event_name, json.dumps(...))`. There is no:
- Counter for `events_emitted_total{event_name}` (so you can never see *what* events the system actually emits in production without log scraping)
- Failure-mode protection: if `_json_default` raises (e.g., a non-serializable object slipped into fields), the `emit_event` call propagates the exception out of `selection_runtime`, taking down the worker mid-phase. Wrap the json.dumps in a try/except that logs and emits a `telemetry_emit_failures_total` counter.

### M5. Telemetry `metrics.py` heartbeat task swallows exceptions silently
`apps/worker/app/telemetry/metrics.py:617–636`: `_track_elapsed_gauge` calls `await asyncio.gather(task, return_exceptions=True)` and discards the returned exception. If the heartbeat task raises (e.g., gauge mutation race in multiprocess mode), the exception is swallowed, the gauge gets stuck at its last value, and there is no observable signal that monitoring is broken. Log the exception when present.

### M6. Telemetry `dramatiq_prometheus.py` `__getattr__` shadows real attribute errors
`apps/worker/app/telemetry/dramatiq_prometheus.py:96–97`: `def __getattr__(self, name): return getattr(self._delegate, name)`. With `slots`-less classes this is fine, but typos like `middleware.aftr_process_message` will silently dispatch to the delegate's `__getattr__` and raise an `AttributeError` from a misleading frame. Add `if name.startswith("_"): raise AttributeError(name)` to make internal access surface real failures.

### M7. `evidence/runtime.py` `_finalize_run` uses `COALESCE` to keep prior values — can mask drift
`apps/worker/app/evidence/runtime.py:357–380`: `locator_kind = COALESCE($3, locator_kind)` etc. If a retry resolves a *different* PMCID than the original attempt, the new value is written. But on the *unavailable* / *failed* paths, the old locator is preserved when the new attempt didn't carry one. This is silently lossy: an admin reading the row cannot tell which attempt set which field. Either always write the most recent attempt's full state (NULLs included) or maintain an attempts-history table.

### M8. `evidence/parser.py` `_block_shape` returns `is_retrieval_default=True` for `"abstract"` passages
`apps/worker/app/evidence/parser.py:282–291`: `paragraph` and `abstract` both map to `(BLOCK_KIND_PARAGRAPH, True)`. But the abstract is already stored separately in `solemd.paper_text.abstract` (`materialize.py:269–320`). Now full-text retrieval will double-count abstract passages. Confirm by reviewing `paper_blocks` semantics — likely abstract should still be in the spine but not flagged retrieval-default for full-text RAG.

### M9. `evidence/ncbi.py` retries are absent for transient 5xx
`apps/worker/app/evidence/ncbi.py:127–142`: only `400` and `404` are mapped to `PaperTextUnavailable`; everything else is `PaperTextFetchFailed`. There is no retry for `429` (NCBI rate limit, which they emit liberally) or `503`. Each transient blip becomes a permanent `failed` run. Wrap `_fetch_bytes` in a small retry-with-backoff that honours `Retry-After`.

### M10. `evidence/ncbi.py` blocks on urllib via `asyncio.to_thread` when `aiohttp` would be cheaper
`apps/worker/app/evidence/ncbi.py:113–142, 172–200, 204–242`: every NCBI call uses `urllib.request.urlopen` via `asyncio.to_thread`. The slice already uses async DB I/O; switching to `httpx.AsyncClient` (or `aiohttp`) gives connection pooling, native async, and HTTP/2 — and removes the thread-per-request overhead. The current pattern also can't honor the cancel-on-timeout from the orchestrator cleanly: the underlying urllib socket call is uninterruptible.

### M11. `evidence/runtime.py` rebuilds advisory-lock string twice (C5 cited above is the bug; this is the design smell)
The `f"evidence:{corpus_id}"` literal appears at `_acquire_paper_lock:266` and `_insert_started_run:337`. Same applies to the corpus-side: `f"corpus:{...}"` literal in `selection_runtime._acquire_selection_lock:432` and the wave key in `wave_runtime._acquire_wave_lock:303`. Centralize all advisory-lock-key derivation in `runtime_support.py`.

---

## Minor issues

### m1. `_load_paper_metadata` requires `paper_text` row to exist
`apps/worker/app/evidence/runtime.py:276–289` joins `solemd.papers` → `solemd.paper_text`. If a paper exists but `paper_text` was never populated, `_load_paper_metadata` raises `PaperNotFound` with a misleading message (`paper N does not exist in the warehouse`). Detect the missing-text case explicitly.

### m2. `_finalize_selection_published` and `_finalize_wave_published` clear `error_message`
`selection_runtime.py:594–608, wave_runtime.py:629–643` set `error_message = NULL` on success. This silently erases prior failure history when a phase resumes successfully. Keep the prior message in a separate `prior_error_message` column or in `phase_started_at` JSONB.

### m3. `wave_runtime._build_wave_plan` builds `evidence_policy` from the request only
`apps/worker/app/corpus/wave_runtime.py:282`: `build_evidence_policy(wave_policy_key=...)` ignores `wave_policy_key` (line 254 of `policies.py`: `del wave_policy_key`). The function exists for a future signature where policy varies, but right now this is a no-op that obscures intent. Add a `# TODO: dispatch by wave_policy_key` or remove the parameter.

### m4. `corpus/policies.py` ENTITY_RULES / RELATION_RULES are hard-coded constants, ~200 LOC of literals
`apps/worker/app/corpus/policies.py:68–240` is a hand-maintained tuple of 16 entity rules and 7 relation rules. The asset-checksum machinery in `assets.py` digests them as `embedded://corpus/...`, so changes are versioned — but the data itself belongs in `db/seeds/` or `assets/corpus/curated_rules.json`, treated identically to `vocab_terms_path`. As-is, code reviews of curated knowledge are mixed with code reviews of orchestration.

### m5. `assets.py` reads/checksum vocab files on every selection run
`apps/worker/app/corpus/assets.py:404–409` re-streams 1 MB chunks of vocab files for SHA-256 on every plan build. Cache by `(path, mtime, size)` keyed in module-level dict, or compute once at worker boot.

### m6. `policies.py` `del selector_version` and `del wave_policy_key` are anti-patterns
`policies.py:244, 254`: `del unused_kwarg` is a Python idiom, but the variable was already unused — `del` adds nothing semantic. Mark with `_ = selector_version` if intent is to keep the kwarg.

### m7. `wave_runtime._refresh_wave_members` does not delete + insert in same transaction
Lines 448–531 issue separate `DELETE` and `INSERT INTO solemd.corpus_wave_members` outside an explicit transaction (the surrounding `connection.transaction()` is wrapping the call from line 120). OK in practice, but the function should not depend on the caller's transactional context — assert via a comment or open its own savepoint.

### m8. `evidence/parser.py` produces `text_hash` from joined block text — order-sensitive
`parser.py:154–159`: `document_text = "\n".join(block["text"] for block in blocks)` then sha1[:16]. Block ordering is determined by passage iteration in lxml. If PMC ever returns passages in a different order, the same logical document gets a new hash. Sort by `(start_offset, block_ordinal)` before hashing.

### m9. `corpus/cli.py` enqueues without validating Dramatiq broker is configured
`apps/worker/app/corpus/cli.py:53–58`: calls `start_selection.send(...)` directly. If broker is not yet configured (e.g., used from a script), this raises a confusing `MissingBroker`. Either fail-fast with a clear message or call `configure_broker()` defensively.

### m10. `document_spine.fallback_sentence_spans` regex `[^.!?]+[.!?]?` always matches the trailing chunk
`apps/worker/app/document_spine.py:55–69`: this regex is greedy and can produce empty matches in degenerate input. The `.strip()` filter handles it, but the cleaner pattern is `re.split(r"(?<=[.!?])\s+", text)` with absolute-offset reconstruction.

### m11. Telemetry `_metric_label_value(None)` returns `""`
`apps/worker/app/telemetry/metrics.py:639–642`: empty-string labels in Prometheus produce confusing dashboards (filters like `phase!=""` skip them). Use `"unknown"` or `"none"` consistently — `record_evidence_text_run` already does this for the locator/resolver path (lines 491–501) but `WORKER_ACTIVE_RUN_INFO` does not.

### m12. `evidence/runtime.py:122–148` updates `papers.pmc_id` opportunistically — race with `_upsert_papers`
The evidence runtime writes `papers.pmc_id` if the resolver discovered one. But `materialize._upsert_papers` (`materialize.py:195–264`) overwrites `pmc_id` with `EXCLUDED.pmc_id` from `s2_papers_raw` on every selection re-run. Two writers, no precedence rule. Decide one source of truth.

### m13. `selection_runtime.py:281` uses `set(phase_sequence).issubset(completed_phases)` — should be ordered check
This is correct in practice but obscures intent. Use `completed_phases >= set(phase_sequence)` for readability or, better, explicitly track if every phase ran in this invocation.

---

## Database / scale concerns

### D1. Selection SQL never uses indexes on `s2_papers_raw.source_release_id` directly — relies on filtering
Every "release_scope" CTE filters `WHERE raw.source_release_id = $1`. Confirm `solemd.s2_papers_raw` has a btree on `(source_release_id)` or `(source_release_id, corpus_id)`. The `materialize.py` patterns also depend on `s2_papers_raw(corpus_id)` for the DELETE subqueries — without it, each `DELETE FROM solemd.papers WHERE corpus_id IN (SELECT raw.corpus_id ...)` becomes a hash-anti-join instead of a nested loop. Audit `db/schema/warehouse/40_tables_core.sql` (out of slice) for index coverage.

### D2. `corpus_wave_members` enqueue loop holds a single connection during paginated `fetch` + `UPDATE … SET enqueued_at = now()`
`wave_runtime.py:543–572`: each batch reads `LIMIT $2`, sends, then updates by `corpus_id = ANY(...)`. The send is sync Redis, then the update is async PG — with default batch_size in the thousands this serializes Redis through the event loop (see C3). Beyond C3, the `UPDATE … WHERE corpus_id = ANY($2::BIGINT[])` is fine for batches up to ~10k but degrades past that — the planner switches to seqscan. Cap batch size at ~5k explicitly.

### D3. `_load_evidence_policy_counts` (wave_runtime.py:696–757) recomputes the same `evidence_cohort` CTE four times within one query
The four scalar subqueries (`evidence_cohort_count`, `satisfied_count`, `backlog_count`, `selected_count`) all reference the same `evidence_cohort` CTE. PG should materialize it once but historically inlines small CTEs. Force materialization: `WITH evidence_cohort AS MATERIALIZED (...)`. Otherwise this is 4× the work on every wave run.

### D4. `selection_runtime._load_pipeline_stage_counts` does CROSS JOIN with single-row CTEs
`selection_runtime.py:740–767`: `FROM raw_scope CROSS JOIN summary_scope` works because both yield exactly one row, but it relies on aggregation guarantees not being violated. Safer: `SELECT (SELECT raw_count FROM raw_scope), (SELECT corpus_count FROM summary_scope), …`.

### D5. `provenance.refresh_selection_summary` issues a single 314-line INSERT with five CTEs and joins
`selectors/provenance.py:19–333`: 314 lines of SQL builds priority scores in CASE-arithmetic. This is a single statement (good for transaction efficiency), but it cannot be partially monitored or unit-tested. Consider expressing the scoring polynomial as a SQL function `solemd.compute_evidence_priority(...)`, then the orchestration SQL only joins the rollups.

### D6. `assets.materialize_curated_vocab` `DELETE FROM solemd.vocab_term_aliases` then `DELETE FROM solemd.vocab_terms` — reload pattern
`assets.py:219–272`: full table truncate-and-reload on every selection run. For a 100k-row vocab, this churns the WAL and forces vacuum work for nothing if the curated TSV is unchanged. Gate by checking `solemd.vocab_terms.source_asset_sha256 = $1` first; skip the entire `assets` phase if checksums match.

### D7. `corpus/selectors/corpus.py:_ensure_release_scope_corpus_ids` allocates new `corpus_id` rows via `nextval()` in a CTE
Lines 126–151 use `nextval(pg_get_serial_sequence(...))` inside a CTE, then INSERT, then UPDATE. PG's CTE evaluation order is not guaranteed for side-effectful CTEs with mutual references; the `inserted` CTE is technically a dangling reference. This pattern works because PG treats it as a single statement and the planner orders writes correctly, but it is fragile. Splitting into two statements (ALLOCATE, then UPDATE) makes the contract explicit.

### D8. No batching of NCBI requests in `resolve_locators`
`evidence/ncbi.py:28–110`: each paper does up to 3 sequential HTTP round trips (id_converter, esummary, then the BioC fetch). For 1000-paper waves that's 3000–4000 sequential calls. NCBI E-utilities supports `id=1,2,3,...` batching; group corpus_wave members and resolve in batches of ~100.

---

## Reuse / consolidation opportunities

### R1. `selection_runtime` ↔ `wave_runtime` lifecycle helpers are 90% duplicated
`_set_*_phase`, `_mark_*_phase_completed`, `_finalize_*_published`, `_set_*_terminal_status`, `_open_or_resume_*_run`, the `track_*_lock_age` context, the cancellation/exception cleanup blocks (selection_runtime.py:307–361, wave_runtime.py:213–272). Factor into `corpus/run_lifecycle.py` parameterized by table name + status code map.

### R2. `runtime_support.emit_event` is the only event helper, but `evidence/runtime.py` ships its own `_emit_event` + `_json_default`
`evidence/runtime.py:383–392` reimplements `emit_event` and `_json_default` — identical logic to `runtime_support.py:34–47`. Import the shared one.

### R3. Lock-key derivation pattern is duplicated 3× and re-derived inside `_insert_started_run` (the C5 bug)
Centralize: `def evidence_lock_key(corpus_id) -> tuple[str, int]` returning `(string, hashtextextended)`. Same for corpus selection and wave keys.

### R4. `_PAPER_*_COLUMNS` tuples in `document_spine.py` are the only "spine schema" definition — but `materialize.py` also writes `paper_text` columns inline
`document_spine.py:12–52` tuples define paper_documents/sections/blocks/sentences. `materialize.py:195–264` writes `papers` columns inline, `:268–320` writes `paper_text` columns inline, `:328–415` writes `authors` and `paper_authors`. The "single source of truth for column lists" promise of `document_spine.py` only covers four tables. Either extend it or accept that column lists live in SQL strings.

### R5. `document_schema.py` SMALLINT enums duplicated in DB schema + Python
`document_schema.py:1–38` mirrors values from `db/schema/warehouse/*.sql`. The two are coupled by convention only. Generate the Python file from the SQL (or vice versa) at schema-gen time.

### R6. `_count_phase_signals`, `_count_summary_rows`, `_count_materialized_papers`, `_count_wave_members`, `_count_enqueued_members` are five near-identical scalar fetchval helpers
Generic helper: `async def _scalar_count(connection, table, where_clause, *args) -> int`.

### R7. Telemetry record helpers (`record_corpus_*`, `record_evidence_text_*`) are 12 functions of nearly identical shape
A single helper: `def increment(metric: Counter, **labels)` and `def observe(metric: Histogram, value, **labels)`. The current shape is callsite-friendly but explodes the surface area of `metrics.py`. Compromise: keep counters factored, ditch the per-counter wrapper functions.

---

## What's solid

- Selection / wave runtime cancellation handling: both runtimes catch `asyncio.CancelledError` separately from generic `Exception` and emit the right outcome metric (`selection_runtime.py:307–335`, `wave_runtime.py:213–243`). This is exactly the pattern the ingest worker should also use.
- Plan checksum + `SelectorPlanDrift` detection (`selection_runtime.py:469–474`, `wave_runtime.py:341–346`): forces operators to acknowledge curated-asset drift before re-running.
- Idempotent resume model: `phases_completed` array + `last_completed_phase` lets a partial run resume deterministically.
- `replace_document_spines` (`document_spine.py:84–195`) batches DELETE in a single CTE chain and uses COPY for inserts. This is the pattern the rest of `materialize.py` should adopt (M2).
- Pydantic models give input validation at the actor boundary; the `model_validate` round-trip at `cli.py` is the right place for defense.
- Telemetry test coverage exists (`test_telemetry_metrics.py` 153 LOC, `test_telemetry_bootstrap.py`) and the multiproc-dir contract is exercised.
- Test files for both runtimes are substantial (`test_corpus_runtime.py` 800 LOC, `test_evidence_runtime.py` 571 LOC) — coverage of the orchestrator is taken seriously.

---

## Recommended priority (top 5)

1. **Fix C1 + C2 + C5 (evidence runtime connection/lock scope + lock-key drift).** Move NCBI HTTP outside `connection.acquire()`. Bracket the advisory lock around DB writes only, not around HTTP. Centralize `evidence_lock_key(corpus_id)` so the lock and the run-row insert can never disagree. This unlocks safe wave fanout.
2. **Fix C3 + C4 (wave enqueue blocking + outbox).** Wrap Dramatiq `.send` batches in `asyncio.to_thread`, or batch through a single Redis pipeline. Add an `enqueued_message_id` column and write it transactionally before sending; have the actor dedupe on it.
3. **Consolidate run-lifecycle (R1) and lock-key derivation (R3).** Extract a shared `corpus/run_lifecycle.py` so selection and wave runtimes drop below 400 LOC each. This removes the largest source of drift and lets future work (e.g., adding a third runtime) start clean.
4. **Refactor materialize.py around a single `release_scope` function (M1, M2, D1).** One materialized scope per release pair, joined into all 5 surface upserts; collapse the 5-stage `DELETE` into one CTE chain. Verifies index coverage on `(source_release_id, corpus_id)` is in place.
5. **Harden NCBI client (M9, M10, D8): add retry-with-backoff, switch to `httpx.AsyncClient`, batch id_converter / esummary calls per wave.** This is the wall the wave dispatch will hit at scale; everything else above is necessary but this is the throughput ceiling.
