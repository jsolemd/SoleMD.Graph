# Audit: worker-ingest

Scope: `apps/worker/app/ingest/**`, `apps/worker/app/actors/**`, `app/ingest_worker.py`,
`app/broker.py`, `app/main.py`, `app/config.py`, `app/db.py`, plus `tests/test_ingest_*`.

## Slice inventory

| Group | Files | LOC |
|---|---:|---:|
| `ingest/` (top) | 6 | 1 113 (`runtime.py` 783, `manifest_registry.py` 163, `models.py` 77, `cli.py` 61, `errors.py` 25, `__init__.py` 1) |
| `ingest/writers/` | 4 | 1 817 (`s2.py` 998, `pubtator.py` 603, `base.py` 213, `__init__.py` 3) |
| `ingest/sources/` | 3 | 1 247 (`pubtator.py` 650, `semantic_scholar.py` 596, `__init__.py` 1) |
| `actors/` | 4 | 154 (`corpus.py` 77, `ingest.py` 37, `evidence.py` 27, `__init__.py` 13) |
| Worker entry | 5 | 1 068 (`main.py` 388, `db.py` 312, `config.py` 263, `broker.py` 92, `ingest_worker.py` 13) |
| Tests in scope | 3 | 2 373 (`test_ingest_runtime.py` 2 241, `test_ingest_writer_base.py` 82, `test_ingest_cli.py` 50) |

Files over the **600-LOC modularization limit**:

- `ingest/writers/s2.py` — **998 LOC** (worst offender; 7 family loaders inlined)
- `ingest/runtime.py` — **783 LOC** (single function `run_release_ingest` spans
  `runtime.py:99-502`, ~400 LOC including 6 nested closures and 4 except branches)
- `ingest/sources/pubtator.py` — **650 LOC**
- `ingest/writers/pubtator.py` — **603 LOC** (right at the line)

Production tests are over budget too: `test_ingest_runtime.py` is **2 241 LOC** in
one module. Even ignoring helpers, the 19 test cases mix S2/PT3/cancellation/resume
in one file — splitting per-source would help maintenance.

---

## Critical issues

### C1. Abort-cleanup writes against a connection whose transaction may be poisoned (`runtime.py:415-502`)

The whole `try` block runs inside `async with control_connection.acquire()` with no
local transaction wrapper around the bookkeeping calls themselves — but
`adapter.promote_family` (`runtime.py:307-314`) and any of the
`_set_phase`/`_assert_not_aborted` calls execute statements directly on
`control_connection`. If `promote_family` raises mid-transaction, the connection's
implicit asyncpg "transaction" is aborted; the `except Exception` branch at
`runtime.py:468-500` then issues `_set_terminal_status(...)` *on the same
connection*, which will fail with `InFailedSQLTransactionError` and the actual
business failure gets shadowed by an internal asyncpg error before the `finally`
unlocks.

The `IngestAborted` and `CancelledError` branches share the same hazard
(`runtime.py:417-466`). Notice that the `CancelledError` path already wraps the
status update in `try/except Exception … LOGGER.exception` (`runtime.py:448-466`)
*because the author already saw this fail*; the fix is half-applied. The lock
release in `finally` (`runtime.py:501-502`) will succeed only because asyncpg
auto-rolls-back implicit transactions on connection release, but the terminal
status will silently never be persisted in the failure path. Recommendation: open
a **fresh connection** from the pool for `_set_terminal_status` and the lock
release in every `except` branch (or use `pool.acquire()` per cleanup step).

### C2. `_assert_not_aborted` polled inside `on_batch_processed` reuses the *control connection* across worker tasks (`runtime.py:174-193`)

The comment correctly identifies the prior deadlock. The current solution serializes
abort polling on a single shared connection across N concurrent file workers via a
plain `asyncio.Lock`. Two consequences:

- Every batch boundary in every worker fights for one lock and one connection. With
  `pool_ingest_max=64` (`config.py:78`) and high `INGEST_COPY_BATCH_ROWS`, the lock
  is uncontended, but at small batch sizes the abort poll throttles throughput.
- More importantly, the control connection is the **same connection currently used
  by the orchestrator's `await control_connection.transaction()` block**
  (`runtime.py:307`) when `promote_family` is in flight. Because `on_batch_processed`
  callbacks fire from worker tasks, you can race a `SELECT requested_status` poll
  into the middle of a `promote_family` transaction on the same connection and get
  garbled state. The `abort_check_lock` does not prevent this — it only excludes
  callbacks from each other.

Recommendation: the abort poll should use a dedicated short-lived connection
(`async with ingest_pool.acquire() as poll_conn`) — the deadlock the comment
references was specific to per-batch acquisition under a small pool, not abort
polling per se. A single long-lived `poll_conn` opened once at run start and closed
in `finally` is safe.

### C3. SQL injection vector via `pg_temp` schema and unvalidated table names in writers (`writers/pubtator.py:392-405, 414-420, 497-503` and `writers/base.py:74-138`)

`_ENTITY_STAGE_BUFFER_TABLE` and `_RELATION_STAGE_BUFFER_TABLE` are module
constants, so the f-strings in `CREATE TEMP TABLE` and the subsequent `SELECT FROM
pg_temp.{table}` are safe today. **However**, `copy_records` and
`copy_files_concurrently` accept arbitrary `table_name`/`schema_name`/`columns`
strings that flow into `asyncpg.copy_records_to_table(table_name,
schema_name=…, columns=…)`. asyncpg will quote-identifiers internally for
`table_name` and `schema_name`, but not for the `columns` sequence — column names
are validated against the table's catalog row. Caller-supplied column lists are
the only attack surface. They are all hard-coded module constants today. Mark this
as a **latent** risk: any future API surface that accepts column names from
network input (admin tools, dynamic family configs) must validate them against the
column catalog. Add a regex/allowlist guard in `copy_records`.

### C4. `_apply_text_patch` uses an f-string-built UPDATE (`writers/s2.py:645-662`)

```python
await connection.execute(
    f"""
    UPDATE solemd.s2_papers_raw raw
    SET {patch_column} = patch.value
    FROM unnest($1::text[], $2::text[]) AS patch(paper_id, value)
    WHERE raw.paper_id = patch.paper_id
    """,
    paper_ids, values,
)
```

Today `patch_column` is one of two literal strings (`"abstract"` / `"tldr"`,
`writers/s2.py:142, 155`). It is not exposed to network input. But it is an
unvalidated identifier interpolated into SQL — exactly the pattern that becomes a
problem the day someone wires a config value into the call chain. Hard-validate
`patch_column in {"abstract", "tldr"}` at the function boundary (or take an enum).

---

## Major issues

### M1. `run_release_ingest` is a 400-LOC function with six nested closures (`runtime.py:99-502`)

The function manually interleaves: lock acquisition, run resume, phase transitions,
6 different progress callbacks, family loop, promotion transaction, and 4 distinct
exception branches that duplicate `_observe_active_phase` + `_set_terminal_status`
+ `record_ingest_run` + `_emit_event`. Cyclomatic complexity is high and the
duplicated except blocks (`runtime.py:415-500`) are exactly the kind of
copy-paste bug surface where C1 lives. Decompose:

- Extract `FamilyProgressTracker` (the 4 `set_progress`/`set_state` callbacks plus
  the `update_family_progress` closure).
- Extract `_run_loading_phase`, `_run_indexing_phase`, `_run_analyzing_phase`
  helpers.
- Centralize cleanup into `_record_terminal(status_code, reason, *, source_code,
  release_tag, …)` — the 4 except blocks become 4 lines.

### M2. `_load_text_patch` does N round-trip UPDATEs without indexes guarantees (`writers/s2.py:380-431, 645-662`)

The `UPDATE … FROM unnest(...) WHERE raw.paper_id = patch.paper_id` is set-based
and respects principle 9, but the per-batch transaction commits N=`ingest_copy_batch_rows`
(default 10 000) rows at a time per file, with up to `ingest_max_concurrent_files`
concurrent UPDATE writers contending for the same `s2_papers_raw` rows. Without a
deterministic ordering (sort by `paper_id` before sending), this guarantees
deadlocks on overlapping batches across the abstracts/tldrs streams. The DELETE +
COPY path in `_copy_paper_file` (`writers/s2.py:610-621`) has the same hazard. Add
`ORDER BY paper_id` in the `unnest` source or sort `paper_ids` Python-side before
calling.

### M3. Rebuilding citation metrics aggregates in app memory before push (`writers/s2.py:885-949`)

`_stage_citation_metrics_for_file` reads the citations stream, **groups by
`citing_paper_id` in a Python dict** (`writers/s2.py:910-919`), then COPYs the
stage row. Then `_replace_citation_metrics_from_stage` re-aggregates with
`SUM(...) GROUP BY` server-side (`writers/s2.py:962-993`). The per-batch
aggregation in Python is wasted work — the server SUM is the source of truth.
Either:

- skip the Python aggregation entirely and stage one row per citation tuple, then
  let the server `GROUP BY` collapse them; or
- keep the Python aggregation but record `(citing_paper_id, file_name,
  batch_ordinal)` granularity and skip the second SQL aggregation.

Right now you pay both costs.

### M4. `_load_citations` cleanup-on-error reopens the pool and runs DELETE during teardown (`writers/s2.py:475-484`)

```python
try:
    async with asyncio.TaskGroup() as group: …
except Exception:
    async with pool.acquire() as control_connection, control_connection.transaction():
        await control_connection.execute(
            "DELETE FROM solemd.s2_paper_reference_metrics_stage WHERE ingest_run_id = $1",
            ingest_run_id,
        )
    raise
```

The bare `except Exception` swallows nothing (it re-raises) but it does not
distinguish `CancelledError` from worker errors — and on `CancelledError`,
re-acquiring a pool connection and opening a transaction during cancellation
unwinding is what produced the original cancellation hardening bug. Use
`except BaseException` and gate cleanup with `asyncio.shield(...)` if you actually
want it to run during cancellation, or skip the DELETE on cancel and let the
caller's resume path clean up.

### M5. PubTator `_stream_bioconcepts` synthesizes `start_offset = index, end_offset = index + 1` (`sources/pubtator.py:351-353`)

These offsets are not real document offsets — they are line numbers used as a
fake key. They're then COPYed into `pubtator.entity_annotations_stage` whose
unique key is `(source_release_id, pmid, start_offset, end_offset, concept_id_raw,
resource)` (`writers/pubtator.py:435-462`). Because every line gets a unique fake
offset, two true duplicates in the same file produce two rows; two identical
entries in different files produce conflicts where the unique key happens to
collide on line numbers. This is silent data corruption: the resource code is
shared with biocxml input, but the offsets aren't comparable. Either drop
`start_offset/end_offset` from the unique key for the bioconcepts resource, or
parse the real offsets from the source TSV (PubTator BioConcepts has them at
columns 4–5 in the standard schema).

### M6. PubTator `_stream_relations` ignores subject/object position semantics (`sources/pubtator.py:363-393`)

The TSV stream takes `parts[2]` as subject and `parts[3]` as object directly —
but the BioCXML path goes through `_select_relation_node` which uses role
heuristics (`sources/pubtator.py:526-543`). Same data, two rules. PubTator3
relation TSV does not actually canonicalize subject/object order; the source
stores `entity1`/`entity2` and you must use the relation type to decide direction
for asymmetric predicates (e.g. `treat`, `cause`, `inhibit`). Today
`subject_entity_id` and `object_entity_id` may be inverted for the same triple
across the two ingestion paths. Risk: downstream graph builds get duplicate edges
with reversed direction.

### M7. Per-resource DELETE before reload short-circuits resume (`writers/pubtator.py:120-133, 236-242, 295-301`)

`_load_biocxml_family` calls `_reset_release_resource` and
`_reset_release_relation_source` *unconditionally* at the start of a family load.
If the run is resuming after a partial family that already loaded (e.g. crashed
during indexing), these DELETEs nuke the previously-loaded rows and you redo all
the work. The runtime's `families_loaded` check (`runtime.py:197-198`) skips
already-completed families, so this only fires on un-promoted families — but
`promote_family` only marks completion *after* the DELETE has wiped the stage
table. A crash between `_reset_release_resource` and the first batch leaves you
with an empty stage table and a non-resumable run for that resource. Keep the
DELETE inside the same transaction as the first COPY, or only DELETE rows whose
`last_seen_run_id` is not the current run id.

### M8. Citation stage cleanup race with concurrent re-runs (`writers/s2.py:446-455, 478-484, 994-997`)

`_load_citations` opens the family by `DELETE FROM
s2_paper_reference_metrics_stage WHERE source_release_id = $1 OR ingest_run_id =
$2`. Two simultaneous runs for the same source_release_id — which the advisory
lock (`runtime.py:505-518`) is supposed to prevent, but only at release_tag
granularity, not source_release_id — would race their DELETEs. Today this is
narrowly safe because `(source_code, release_tag) → source_release_id` is 1:1,
but the join goes through `_open_or_resume_run` which can rebind the same
`source_release_id` to a new run (`runtime.py:633-654`). Add `WHERE
ingest_run_id = $2` only, drop the `OR source_release_id = $1` clause to scope
strictly to the current run.

### M9. `iter_file_batches` busy-waits the producer thread (`writers/base.py:160-175`)

```python
def push(item: object) -> bool:
    future = asyncio.run_coroutine_threadsafe(queue.put(item), loop)
    while True:
        if stop_event.is_set():
            future.cancel()
            return False
        try:
            future.result(timeout=0.1)
            …
```

The 100 ms poll is bounded but burns CPU on every batch boundary even when the
queue has space. Use a `threading.Event` set from a `loop.call_soon_threadsafe`
done-callback on `future`, or rely on `future.result()` without timeout and
short-circuit `stop_event` from the consumer side via `queue.put_nowait` of a
sentinel.

### M10. JSON envelopes built per row (`sources/semantic_scholar.py:260-272, 324-336`)

Each paper and each citation row builds a `json.dumps(...).encode("utf-8")`,
then SHA-256 over it. For 200 M S2 papers that's 200 M short-lived bytes objects
and SHA contexts. Switch to a pre-allocated `hashlib.sha256()` reset per row, or
batch the checksum out of the streaming hot path entirely if downstream is
content with paper_id-keyed dedup. Cheaper still: skip checksums for rows whose
unchanged-detection happens via `payload_checksum = NULL` and let the database
column be opportunistic.

---

## Minor issues

- **N1.** `runtime.py:46-53` — magic numbers for `INGEST_STATUS_*` and
  `INGEST_REQUESTED_STATUS_ABORT`. Use an `IntEnum`; the module already imports
  enough machinery.
- **N2.** `runtime.py:765-766` — `_emit_event` builds a JSON string with
  `default=str` and concatenates into a single log line. Production observability
  expects structured logging (`extra={...}` with `logging.JsonFormatter`); the
  current scheme is grep-friendly but not parseable in Loki/Datadog without
  splitting.
- **N3.** `runtime.py:469` — `failure_phase = active_phase_name or ("loading" if
  family_name is not None else "start")`. The string `"start"` is not in the same
  vocabulary as the four `INGEST_STATUS_*` phase names. Pick one set and stick
  with it.
- **N4.** `manifest_registry.py:67-72` — reads every manifest file fully into
  memory and parses JSON twice (once via `read_text` + `json.loads`, once via the
  same path during `read_manifest_file_plans`). Cache the parsed payload.
- **N5.** `manifest_registry.py:105-126` — the `direct_path` fallback walks
  `direct_path.iterdir()` and `path.stat().st_size` per file. Sufficient today but
  for large releases you'll want a single `os.scandir` pass that gets size +
  inode in one syscall.
- **N6.** `sources/semantic_scholar.py:165-184` — `_stream_jsonl` reports
  progress every `_PROGRESS_REPORT_LINE_INTERVAL = 1_000` lines. With 100 K-line
  files that's only 100 progress samples — fine. With 10 M-line files it's still
  10 K samples; consider also throttling by elapsed wall-clock to avoid hammering
  the active_run state machine.
- **N7.** `sources/pubtator.py:295` — `_stream_biocxml` builds
  `seen_relations` keyed by entity ids without including the (start, end) of the
  relation; if PubTator emits the same predicate twice in one document with
  different argument spans, they collapse. Likely intended; document the choice.
- **N8.** `writers/s2.py:711-731` — payload built with `sort_keys=True,
  separators=(",", ":")` then COPYed as a JSON column. asyncpg's `init_connection`
  registers a json codec that does `json.dumps`, so you're double-encoding (the
  string is treated as a literal value, but the `set_type_codec` hook in
  `db.py:124-137` triggers another `json.loads`/`json.dumps` round if column type
  is `json`/`jsonb`). Verify the column is `text` or `bytea`, otherwise switch to
  passing the dict directly.
- **N9.** `actors/ingest.py:17-30` — `time_limit=24*60*60*1000` (24 h) is large
  enough that Dramatiq's `TimeLimit` middleware will issue a `CancelledError` mid-
  family; the cancellation path (C1) must succeed in that scenario. The test
  `test_cancellation_marks_run_aborted_and_releases_lock` covers it but only with
  a 1-row file — a long-running path is not exercised.
- **N10.** `actors/ingest.py:32-37` — re-validates `payload` via
  `StartReleaseRequest.model_validate` inside the actor; the CLI already validated
  on enqueue (`ingest/cli.py:19`). Defensible (queue could carry stale messages)
  but worth documenting.
- **N11.** `db.py:124-137` — `init_connection` runs on every connection
  acquisition (asyncpg `init=` is per-connection on pool creation actually — fine).
  But the codec is registered without `format="binary"` for `json` (only for
  `jsonb`). Inconsistent.
- **N12.** `config.py:113` — `ingest_copy_batch_rows: int = 10_000` is fine for
  COPY but the same constant gates the `unnest($1::text[], $2::text[], …)` UPDATE
  paths in `writers/s2.py:861-882`. asyncpg has a 32 K parameter limit per
  statement, but each unnest array counts as a single parameter — so we're well
  under. Document the dual usage so future tuning doesn't break either path.
- **N13.** `ingest/cli.py:55-61` — `enqueue_release_request` and
  `dispatch_manifest_requests` both immediately serialize the model with
  `model_dump(mode="json")` and `start_release.send(**...)`. Dramatiq's `send`
  arguments are JSON-encoded again by the broker. Two encodes; pass the
  pydantic model dict once.
- **N14.** `broker.py:14-19` — `ensure_middleware` checks `type(existing) is
  type(middleware)`, which is correct for instance dedupe but won't catch
  subclasses. Fine today.
- **N15.** `main.py:97-99` — `startup_probe` actor exists but is not exported
  via `__all__` in `actors/__init__.py`; it's defined in `main.py`. Mixing
  actor declarations across `actors/` and `main.py` makes broker-bind ordering
  fragile.

---

## Database / scale concerns (principle 9)

**Strong points:**

- COPY is used for every bulk write path (`writers/base.py:32-48`).
- Concurrent file workers via `asyncio.TaskGroup` + per-pool semaphore
  (`writers/s2.py:281-282, 330-331, 371-372, 424-425, 530-531`;
  `writers/pubtator.py:210-211, 386-387`).
- Set-based UPDATE/MERGE via `unnest($1::T[], $2::T[])` rather than per-row
  loops (`writers/s2.py:778-851, 853-882`; the venue upsert is an exemplary
  multi-CTE write).
- Citation finalization aggregates server-side with `GROUP BY`
  (`writers/s2.py:962-993`).
- DELETE-by-`source_release_id` to invalidate prior data is a single set
  operation, not a loop.

**Concerns and missed wins:**

| # | Issue | Cite |
|---|---|---|
| D1 | Per-batch transaction overhead: every COPY batch opens its own transaction. With 10 K rows/batch on the citations stage that's ~100 transactions per file × N files. Coalesce into per-file transactions. | `writers/s2.py:935-942`, `writers/pubtator.py:188-205, 375-377` |
| D2 | `_copy_paper_file` issues `DELETE … WHERE paper_id = ANY($1::text[])` then COPY. This triggers per-paper index churn on 4 tables. Use `INSERT ... ON CONFLICT DO UPDATE` against `s2_papers_raw` directly via stage temp table (mirror the PubTator pattern). | `writers/s2.py:610-639` |
| D3 | `s2_papers_raw` updates from abstracts/tldrs are 2 separate full-table UPDATEs. Could be a single combined UPDATE if both files are present in the same release. | `writers/s2.py:380-431` |
| D4 | `_backfill_selected_corpus_ids` and `_backfill_*_corpus_ids` join through `solemd.papers` per family promotion (`runtime.py:307-314` calls promote_family inside a transaction). They each run a single set-based UPDATE — good — but they all touch the same `solemd.papers` JOIN. If they share the same plan, batch them with one `WITH` CTE. | `sources/pubtator.py:406-451`, `sources/semantic_scholar.py:486-504` |
| D5 | No bulk index on `s2_paper_reference_metrics_stage(source_release_id, ingest_run_id)` is verified in the slice; the DELETE + GROUP BY + DELETE pattern depends on it (`writers/s2.py:446-454, 962-997`). Verify schema. | — |
| D6 | `_assert_not_aborted` runs one `SELECT requested_status` per N batches across all workers, all on one connection (C2). Convert to a `LISTEN/NOTIFY` channel: operator marks abort via `NOTIFY ingest_abort, ingest_run_id`, runtime listens once. Eliminates the poll loop entirely. | `runtime.py:703-709` |
| D7 | `iter_file_batches` runs the producer in `asyncio.to_thread` (`writers/base.py:198`). For PubTator's BioCXML we are CPU-bound on lxml; consider `ProcessPoolExecutor` for tar.gz parsing — Python GIL caps single-process throughput. | `sources/pubtator.py:188-322` |
| D8 | All four cleanup paths in `runtime.py:415-500` issue 1–3 sequential `await connection.execute(...)`. They're independent and could run via `asyncio.gather(...)`, but more importantly they should run on a fresh connection (see C1). | `runtime.py:415-500` |

---

## Reuse / consolidation opportunities

### R1. Dead helper: `writers/base.copy_files_concurrently` (`writers/base.py:74-138`)

This function is **never imported anywhere** in the slice. Both writers reimplement
the same pattern locally:

- `writers/s2.py:249-287, 290-336, 339-377, 391-430, 456-495, 510-536` (six
  variants of `semaphore + TaskGroup + worker(file_path)`),
- `writers/pubtator.py:341-388` (`_copy_stage_files_concurrently`),
- `writers/pubtator.py:135-216` (the BioCXML loader inlines its own copy).

Either delete `copy_files_concurrently` or migrate every loader onto it. The
current state is the worst of both worlds: a "centralized" helper that nobody
uses plus 600 lines of copy-paste workers.

### R2. The four S2 family loaders that are pure "stream → COPY → done" are identical (`writers/s2.py:236-336, 380-430`)

`_load_authors`, `_load_publication_venues` (via `_load_small_upsert_family`),
`_load_text_patch` (×2 callers via `patch_column`) all share the same skeleton:
acquire connection, stream batches, transaction-wrap a single `await
batch_handler(connection, batch)`, fire callbacks. Collapse into one helper that
takes the per-batch handler as a callable. This would also let `_load_papers` and
`_load_citations` (which need extra teardown/setup) inherit cleanly via composition.

### R3. PubTator `_load_*` family loaders share a `_reset_release_*` + `_copy_stage_files_concurrently` skeleton (`writers/pubtator.py:107-338`)

Same pattern as R2 — `_load_biocxml_family` is the only outlier (it inlines
because it produces two row kinds). After R2, it can use a tagged-union row
handler and collapse.

### R4. Source-stream JSONL parsing is duplicated for S2 (`sources/semantic_scholar.py:165-184`) and partially for PubTator (`sources/pubtator.py:330-345, 363-378`)

Both open a `.gz` with the same `gzip → TextIOWrapper → enumerate(lines)` pattern,
both report progress via `raw_handle.tell() % _PROGRESS_REPORT_LINE_INTERVAL`. One
shared `iter_jsonl_gz_lines(path, *, on_progress=...)` helper would absorb both.

### R5. `_emit_event` (`runtime.py:765-766`) is invented in this slice

If there's a structured-logging helper anywhere else in `apps/worker/app/` (the
slice rules forbid checking) it's likely duplicated. If not, this is a candidate
to lift out into `app.telemetry`.

### R6. `SOURCE_ADAPTERS` and `SOURCE_WRITERS` are parallel registries (`runtime.py:82-96`)

Two dicts indexed by the same key with two parallel dataclass shapes
(`SourceAdapter`, `SourceWriter`). Merge into one `SourceBackend` dataclass with
`build_plan`, `promote_family`, and `load_family` fields. Also enables compile-
time enforcement that all three are wired for every `SourceCode`.

### R7. `runtime.py` resume bookkeeping vs corpus/evidence runtimes (out-of-scope but worth noting)

`actors/corpus.py` and `actors/evidence.py` follow the same shape:
`@dramatiq.actor(...)` + `await ensure_worker_pools_open(...)` + `await runtime(...)`.
A small decorator factory `@worker_actor(name, queue, ...)` wrapping the
`StartReleaseRequest` → `pools` → `runtime` chain would deduplicate three actors.
This crosses `corpus/` and `evidence/` boundaries — out of scope to read, but
note for the parent caller.

---

## What's solid

- **Cancellation hardening** is real and tested: the new
  `test_cancellation_marks_run_aborted_and_releases_lock`
  (`tests/test_ingest_runtime.py:2134-2241`) covers the exact path that asserts
  ABORTED status, `completed_at`, `error_message`, and lock release. It catches
  the visible regression. (It does **not** cover C1's secondary failure where
  `_set_terminal_status` itself raises on a poisoned connection — the
  `try/except Exception … LOGGER.exception` in `runtime.py:448-466` is what
  silently saves the test today.)
- **Advisory lock contract** at the release-tag level is clean and tested
  (`runtime.py:505-518` + `test_writer_failure_releases_lock_and_records_family_failure`
  at `tests/test_ingest_runtime.py:1965-2068`).
- **Plan drift detection** (`runtime.py:602-606` via SHA-256 of
  `model_dump(mode="json")`) is a proper byte-for-byte invariant and short-circuits
  resume against a mutated source.
- **Test coverage of resume semantics** is unusually thorough: deterministic
  resume for both citations and PubTator relations
  (`test_s2_citations_resume_is_deterministic`,
  `test_pubtator_relations_resume_is_deterministic`,
  `test_pubtator_biocxml_relations_prefer_xml_and_resume_cleanly`,
  `test_open_or_resume_run_reopens_terminal_row_for_resume`).
- **PubTator BioCXML resilience to corrupt members** is explicitly tested
  (`test_stream_biocxml_skips_members_with_null_bytes`,
  `tests/test_ingest_runtime.py:2084-2131`) and the streamer correctly logs and
  skips rather than failing the whole run (`sources/pubtator.py:215-237`).
- **Prometheus integration** routes through scoped middleware
  (`broker.py:64-70`) and the runtime emits both `record_ingest_*` and the
  `track_active_worker_run` context manager — observability surface is real, not
  performative.
- **Pool topology** is per-process scoped: `ingest_worker.py` only opens
  `ingest_write` (`ingest_worker.py:9`), so the ingest worker doesn't fight the
  serve/admin pools. The `WorkerPoolBootstrap` middleware
  (`db.py:218-249`) cleanly handles boot/shutdown via Dramatiq's hooks.
- **Batched producer/consumer** via `iter_file_batches` correctly bounds memory
  with `queue_depth=2` and is tested for the early-exit, backpressure, and
  monotonic-progress invariants (`tests/test_ingest_writer_base.py`).
- **`promote_family` runs inside a transaction** with the family-loaded mark
  (`runtime.py:307-315`), so corpus_id backfill and the resume bookmark commit
  atomically.
- **`pg_advisory_unlock` always fires** via `finally` (`runtime.py:501-502`),
  even when terminal-status writes fail.

---

## Recommended priority (top 5)

1. **Fix C1**: cleanup paths must use a fresh pool connection, not the poisoned
   `control_connection`. This is the only way the metrics/event/`error_message`
   audit trail survives a writer failure that aborted the connection's implicit
   transaction. Reference: `runtime.py:415-502`. Today the test passes only
   because of an over-broad `try/except Exception` swallow on the cancellation
   path; the failure path is silently broken.
2. **Decompose `run_release_ingest`** (M1) into a `LoadingPhase` controller, an
   `IngestRunBookkeeper` (the four except branches), and a
   `FamilyProgressTracker` (the six closures). This is prerequisite to safely
   landing #1 — the current 400-LOC body cannot host another correct fix.
3. **Fix C2 and D6**: dedicated abort-poll connection (cheap), and migrate to
   `LISTEN/NOTIFY` for abort signaling (medium). Removes the lock contention and
   the connection-aliasing hazard in one step. Reference: `runtime.py:174-193,
   703-709`.
4. **Resolve the duplicate-loader explosion** (R1, R2, R3): delete
   `writers/base.copy_files_concurrently`, replace seven near-identical workers
   with one parametrized helper. Net delete of ~400 LOC across `writers/s2.py`
   and `writers/pubtator.py`. Brings `s2.py` under 600.
5. **Fix M5 + M6** (PubTator data-correctness): bioconcepts fake offsets and
   relations subject/object inversion. These are silent data corruption bugs
   that will show up downstream as duplicate edges and inverted predicates. Add
   targeted tests for both before fixing.
