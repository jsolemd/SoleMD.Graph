# Intra-family file-level checkpointing for ingest

Status: superseded / partially implemented
Author: Jon (drafted during 2026-04-21 s2:2026-03-10 recovery)

Implementation update, 2026-04-25: S2 `citations` now uses the durable
file-task pattern described here, but with the actual table
`solemd.ingest_file_tasks` instead of the proposed `solemd.ingest_run_files`.
The release actor owns `families_loaded` and finalization; file actors consume
`ingest_file` queue messages keyed to DB task rows. Citation-specific
`s2_paper_reference_metrics_file_checkpoints` validate completed file stage
rows because the aggregate stage table is `UNLOGGED`.

## Why this exists

On 2026-04-20 the s2:2026-03-10 ingest run stranded mid-`papers` after
`publication_venues` and `authors` had been committed to `families_loaded`.
The worker process died ungracefully (root cause: `asyncio.CancelledError`
bypassing `except Exception` in `run_release_ingest` — now patched).

What the post-mortem surfaced is a bigger durability problem: **resume
granularity is one family wide**. The plan says 358 files in `citations` and
60 files in `papers`. If a loader dies or the actor times out anywhere inside
a family, every file in that family is re-processed on the next attempt.
Families that take > 6h (or now > 24h) never complete, because each retry
starts from file 0.

The CancelledError patch plus the `time_limit` bump to 24h buy breathing room.
They don't solve this. A single bad file, a transient PG hiccup, or a broker
restart still costs the whole family.

## Contract today

- `solemd.ingest_runs.families_loaded text[]` — committed inside
  `_mark_family_loaded` only after every file in the family succeeds and
  `promote_family` runs inside the control transaction
  (`apps/worker/app/ingest/runtime.py:307-315`).
- `run_release_ingest` loop check:
  `if family_name in run.families_loaded: continue`
  (`apps/worker/app/ingest/runtime.py:195-198`).
- Writers (`apps/worker/app/ingest/writers/s2.py`,
  `.../pubtator.py`) fan out per-file in a `TaskGroup` bounded by
  `ingest_max_concurrent_files`. Per-batch transactions inside each file are
  idempotent on replay (COPY after DELETE-by-key, `INSERT..ON CONFLICT`, or
  `UPDATE..FROM`). A given file's loader either succeeds as a whole or aborts
  the whole family via the TaskGroup.

So files are idempotent on replay but we don't *know* which files succeeded,
so we replay them all.

## Proposed change

Track per-file completion in a task table, consulted at family start, and
updated as each file's loader finishes. The landed S2 citation implementation
uses `solemd.ingest_file_tasks` with status codes
`1=pending, 2=running, 3=completed, 4=failed`, attempt counts, heartbeat
progress, and a per-claim `claim_token`.

### Schema (new migration)

```sql
CREATE TABLE solemd.ingest_file_tasks (
    ingest_run_id     uuid        NOT NULL REFERENCES solemd.ingest_runs(ingest_run_id) ON DELETE CASCADE,
    source_release_id integer     NOT NULL REFERENCES solemd.source_releases(source_release_id) ON DELETE RESTRICT,
    family_name       text        NOT NULL,
    file_name         text        NOT NULL,
    file_path         text        NOT NULL,
    file_byte_count   bigint      NOT NULL DEFAULT 0,
    status            smallint    NOT NULL DEFAULT 1,
    attempt_count     integer     NOT NULL DEFAULT 0,
    input_bytes_read  bigint      NOT NULL DEFAULT 0,
    rows_written      bigint      NOT NULL DEFAULT 0,
    stage_row_count   integer     NOT NULL DEFAULT 0,
    claim_token       uuid,
    enqueued_at       timestamptz,
    started_at        timestamptz,
    completed_at      timestamptz,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    last_error        text,
    PRIMARY KEY (ingest_run_id, family_name, file_name)
);
CREATE INDEX idx_ingest_file_tasks_release_family_status
    ON solemd.ingest_file_tasks (source_release_id, ingest_run_id, family_name, status, updated_at);
```

- `(ingest_run_id, family_name, file_name)` PK is idempotent-safe. A retry
  that tries to re-insert a completed file row hits ON CONFLICT DO NOTHING.
- `status` and `claim_token` make file attempts recoverable: stale
  `running` rows return to `pending`, old workers cannot heartbeat/complete
  after their claim token is superseded, and stale `pending` rows with lost
  Redis sends are redispatched after the stale window.

### Runtime integration

Two injection points in `run_release_ingest`:

1. **At family start** (after the `if family_name in run.families_loaded:
   continue` check). Insert or refresh one `ingest_file_tasks` row per planned
   file. For S2 citations, load completed files from
   `s2_paper_reference_metrics_file_checkpoints` only when matching stage rows
   still exist; reset every other file task to `pending`.

2. **Inside each per-file worker** (`ingest.s2_citation_file`). Claim the DB
   row, receive a `claim_token`, reset that file's stage rows, stream and
   merge batches while presenting the token, then checkpoint and complete the
   task. Stale pending rows can be redispatched, and stale running rows can be
   returned to pending without allowing the old worker to complete over the new
   claim.

### Why "inside the last batch's transaction" matters

If we mark the file completed in a separate transaction from its last data
write, a crash between those commits leaves a file marked complete whose last
batch didn't land. The file is idempotent on replay, so re-running is safe —
but skipping it is not. The simplest safe order is: commit all file data
first, then in a *separate* short transaction write the completion row. If
we crash between: on replay we re-run the file (correct). If we crash
before the data commit: on replay the file starts over (correct).

The only write-amplification is one extra INSERT per file. 358 files in
`citations` → 358 extra INSERTs per full run. Negligible.

### Writer signature change

```python
async def load_family(
    ...,
    completed_files: frozenset[str] = frozenset(),
    on_file_completed_persist: Callable[[Path], Awaitable[None]] | None = None,
    ...
) -> CopyStats:
```

Each per-file `async def worker(file_path)` gets:

```python
if file_path.name in completed_files:
    return 0  # already durably persisted on a prior attempt
...
# after the file's natural completion:
if on_file_completed_persist is not None:
    await on_file_completed_persist(file_path)
```

The landed S2 citation path does not use this exact callback shape. The same
principle is implemented with `ingest_file_tasks` ownership and
`s2_paper_reference_metrics_file_checkpoints`.

### Telemetry

Add a gauge:

- `ingest_family_files_remaining{source_code, family}` = total - completed
  at family start. Drains to 0 as files finish. Makes "how close to done is
  this family" observable without scraping broad stage tables. Current S2
  citation progress is visible from `solemd.ingest_file_tasks`.

### Backwards compatibility

- Existing runs without `ingest_file_tasks` rows resume exactly as they do
  today: `completed_files` is empty → every file runs again. The
  per-file COPY/INSERT paths are already idempotent, so this is safe.
- Once the migration lands, new runs start writing rows. On next
  retry/resume, already-completed files are skipped.

## Alternatives considered

1. **Shrink the unit of commit.** E.g., commit `families_loaded` after every
   batch. Rejected — batches are smaller than files, and the
   family→promote_family state machine depends on a family being fully
   loaded before promotion. Splitting that would require redesigning
   promote_family per writer.

2. **Track file completion in a JSONB column on `ingest_runs`.** Rejected —
   atomicity under concurrent TaskGroup workers requires a row-level lock
   on the ingest_run row for every file completion, serializing writes that
   don't need to be serialized.

3. **Rely on COPY-onto-staging tables and idempotent DELETE-by-release.**
   This is what the current writers do at the batch level. It handles
   correctness (replays don't corrupt), but does nothing for wasted time on
   replay. Doesn't substitute for checkpointing.

## Work breakdown

1. Migration file adds `solemd.ingest_file_tasks`.
2. `apps/worker/app/ingest/runtime.py` routes sources with a
   `load_family_distributed` implementation to the distributed loader.
3. S2 citations own the first implementation:
   `s2_citations.py`, `s2_citation_tasks.py`, and
   `s2_citation_stage.py`.
4. Tests:
   - Unit: `_load_completed_files` returns the partial-index set it should.
   - Integration: run an ingest, kill it mid-family, resume; assert the
     second run does not re-open already-completed files (spy on
     `_iter_s2_row_batches` call count).
   - Integration: crash between last data commit and completion INSERT;
     assert the file re-runs and the row count ends up correct (no
     double-insert thanks to idempotent writer paths).
5. Telemetry: `ingest_family_files_remaining` gauge, emitted at family start
   and after every file completion.

## Non-goals

- Not changing the `families_loaded` contract or the family→promote_family
  ordering.
- Not parallelizing across families (families stay sequential — each
  family's promote_family is a control-plane transaction).
- Not adding resume-across-workers-within-a-file. Files remain atomic from
  the runtime's perspective.

## Open questions

- **Row-level retry on a single file.** Right now, a TaskGroup aborts the
  whole family on first file exception. With per-file checkpointing we
  could be more tolerant: log the failing file, continue the other files,
  retry only the failed ones on the next attempt. Worth scoping separately.
- **Cleanup.** `ingest_file_tasks` will grow. Either a periodic delete for
  rows whose `ingest_run_id` is PUBLISHED > N days, or rely on `ON DELETE
  CASCADE` when a historical run is pruned.
- **Corpus/evidence parallel.** `corpus/selection_runtime.py` and
  `corpus/wave_runtime.py` have the same shape but their phase units are
  coarser than files. Decide if analogous checkpointing is useful there
  before generalizing the pattern.

## Related

- `docs/agentic/2026-04-21-solemd-graph-ingest-optimization-audit-ledger.md`
  — audit that caught the cancellation-stranding and advisory-lock hazards.
- `apps/worker/app/ingest/runtime.py:99-475` — the runtime this modifies.
- `apps/worker/app/ingest/writers/s2.py`,
  `apps/worker/app/ingest/writers/pubtator.py` — writer-side changes.
