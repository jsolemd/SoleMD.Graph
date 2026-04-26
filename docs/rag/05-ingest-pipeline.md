# 05 — Ingest Pipeline

> **Status**: locked for pipeline shape — UNLOGGED → indexed → LOGGED phase
> order, manifest-driven trigger, `ingest_runs` lifecycle, advisory-lock
> namespace, `families_loaded` resume tracker, DuckDB / `lxml.iterparse`
> stream contract, asyncpg binary `COPY` write contract, publish-flip as
> projection trigger. Microdesign details (per-source DuckDB SQL, asyncpg
> pool sizes, `corpus_id` lookup-cache strategy, exact `maintenance_work_mem`,
> wall-clock budgets) are **provisional until the first sample ingest** on
> real data.
>
> **Date**: 2026-04-16
>
> **Scope**: parquet / JSONL / BioCXML → warehouse PG ingest end-to-end for the
> bulk release-backed lane. One ingest cycle outputs a published `ingest_runs`
> row plus the broad upstream raw/stage warehouse surfaces the cycle wrote
> (`s2_*_raw`, `pubtator.*_stage`, and source-local raw helpers such as
> `s2_paper_authors_raw` and the current transitional citation helpers). The
> locked next-batch direction for broad raw is: S2 paper/abstract/venue inputs,
> raw authors, paper-level citation aggregates, and `pubtator.*_stage`. The
> **selected canonical corpus** remains owned by `05e-corpus-selection.md`.
> Under the locked stage contract, `corpus` owns `corpus` membership plus
> baseline canonical `papers` / `paper_text`; `mapped` owns heavier canonical
> PT3 / authorship and actual paper-to-paper citation edges in
> `paper_citations`; `evidence` owns full-document payloads, chunking,
> grounding, and in-text citation mentions.
> Current code still includes some broad canonical promotion helpers as
> transitional machinery; that reality does not redefine raw-ingest ownership.
>
> **Schema authority**: `02-warehouse-schema.md` is PG-native authority for
> table shapes. This doc is authority for the ingest worker's runtime
> contract: `ingest_runs` lifecycle, phase order, manifest protocol,
> advisory-lock keys, `families_loaded` resume, publish flip. Engine code
> under `apps/worker/app/ingest/` derives from here; legacy
> `engine/app/ingest/` code is reusable salvage inventory, not the
> runtime root.
>
> **Selection boundary**: this doc governs broad upstream raw/stage ingest.
> `05e-corpus-selection.md` governs two distinct jobs: (1) deciding what enters
> the admitted canonical corpus from raw upstream data; (2) deciding which
> admitted corpus papers are promoted into the mapped paper-level active
> universe and idempotently promoting/backfilling selected-paper facts into the
> canonical warehouse surfaces. Selection is not just labeling rows; it is the
> boundary that determines what reaches the durable canonical paper layer.

## Purpose

Pull one **source release** (Semantic Scholar 2026-03-10 ≈ 638 GB or
PubTator3 2026-03-21 ≈ 210 GB) off the warehouse filesystem,
stream-transform it through DuckDB or `lxml.iterparse`, fan it out into
32 `corpus_id`-hashed UNLOGGED partitions per family via asyncpg binary
`COPY`, build indexes in parallel on empty-of-readers tables, flip each
partition `SET LOGGED`, run `VACUUM (FREEZE, ANALYZE)`, and close with
`ingest_runs.status = published`. The publish flip is `04`'s trigger.

Six load-bearing properties:

1. **Batch only.** No per-paper webhook, no live update path, no warehouse
   → serve write path inside ingest. Per `00 §3` warehouse is cold-by-default
   and runs `wal_level = minimal` so the COPY fast path stays fast.
2. **UNLOGGED → LOGGED phase order.** Bulk COPY skips WAL; `SET LOGGED` pays
   the WAL tax once before publish so post-publish partitions are crash-safe
   (`research-distilled §2`; PG wiki on `SET LOGGED`,
   <https://wiki.postgresql.org/wiki/Improve_the_performance_of_ALTER_TABLE_SET_LOGGED_UNLOGGED_statement>).
3. **Indexes built post-load, parallel, not `CONCURRENTLY`.** Empty-of-readers
   table; CONCURRENTLY would only add overhead (`research-distilled §2`).
4. **Idempotent and resumable.** `ingest_runs` is the resume key.
   `families_loaded text[]` is monotone within one `ingest_run_id`;
   re-running the same release no-ops if `published`, resumes otherwise.
5. **Single writer per release.** Postgres advisory lock on
   `hashtext('ingest:'||source_code||':'||release_tag)::int8`. Cross-release
   ingest can overlap.
6. **Publish is one UPDATE.** No multi-step swap, no atomic rename — there
   are no readers on warehouse during ingest. The single-statement publish
   is what `04`'s pg_cron polling sees.

Out of scope: projection (`04`); serve writes (`00 §3`); OpenSearch bulk
load (`07`, triggered off the same publish flip on a different actor);
concrete tuning numbers (`09-tuning.md`); backup / archive (`11-backup.md`,
raw release dirs are themselves the source-of-truth backup per `01 §3`);
observability dashboards (`10-observability.md`).

## Implementation state

The first production raw-refresh implementation is now landed in
`apps/worker/app`.

- Landed in code: broker bootstrap, four-pool bootstrap, startup probe,
  `ingest.start_release`, source adapters for Semantic Scholar and
  PubTator, validated CLI enqueue/dispatch entrypoints, asyncpg
  `COPY`-driven raw/stage loaders, transitional broad S2 canonical
  promotion helpers, and the worker telemetry slice under
  `app/telemetry/`.
- Landed in tests: request-shape validation, runtime resume behavior, and
  end-to-end sample-ingest coverage against a real warehouse target.
- The next follow-on slice is therefore **canonical corpus selection**
  (`05e`), not another raw-ingest rewrite. Broad upstream releases can now land
  safely on raw/stage surfaces; what remains is to keep the hierarchy explicit:
  raw upstream lands here, `05e` admits the broad canonical corpus and promotes
  the mapped paper-level active universe, and downstream evidence work consumes
  that narrower mapped/evidence scope rather than raw release breadth.

## §0 Conventions delta from `02` / `04`

Inherits every convention from `02 §0`. The `04` `_next` / `_prev`
discipline is **not** inherited — ingest has no live readers, so the
warehouse-side equivalent is "load directly into the live partition while
it's UNLOGGED." Ingest adds:

| Concern | Ingest delta |
|---|---|
| Source-release naming | `(source_code, release_tag)` is the natural key. `source_code ∈ {'s2','pt3','umls'}`; `release_tag` matches `/mnt/solemd-graph/data/<source>/releases/<tag>/` per `01 §3`. Mirrored in `solemd.source_releases.(source_name, source_release_key)` (`02 §4.1`). |
| Manifest-file protocol | Per-dataset `manifests/<dataset>.manifest.json` (existing layout) plus a top-level `MANIFEST` marker file when the release is "complete." pg_cron polls for the marker; appearance triggers ingest (§11). |
| UNLOGGED → LOGGED phase order | Per-family lifecycle: stream-load (UNLOGGED) → CREATE INDEX (parallel) → SET LOGGED → VACUUM (FREEZE, ANALYZE) → mark loaded. No swap. The warehouse table is the live target throughout. |
| Stream-transformer choice | DuckDB for parquet / JSONL / CSV (anything tabular). `lxml.iterparse` with `tag='document'` and `element.clear()` for BioCXML. No general-purpose Python iterators over JSON files. |
| `families_loaded` resume tracker | `ingest_runs.families_loaded text[]`, monotone within one `ingest_run_id`. Mirrors `04 §5` cohort-manifest pattern but is local to one ingest run. |
| Phase status codes | `ingest_runs.status` transitions: `started → loading → indexing → analyzing → published`, or any state → `failed` / `aborted`. SMALLINT-encoded per `02 §0.10` registry. |

## §1 Identity additions

None beyond `02 §2`. Confirmed:

- `ingest_run_id` UUIDv7 on `solemd.ingest_runs` per `02 §2`. Generated at
  run start so partial rows are queryable.
- `source_release_id` INTEGER identity on `solemd.source_releases` per
  `02 §4.1`. The §11 manifest poll is the only writer.
- `corpus_id` BIGINT identity on `solemd.corpus`. Newly admitted papers
  allocated by the identity sequence; ingest never writes a constant
  `corpus_id`. Backfill onto raw rows happens via natural-key join
  (S2 `paper_id` / PMID) per `02 §4.1`, `02 §3.3`.

This doc adds *child rows* only (`ingest_runs`, optionally fresh
`source_releases`). No new identity types.

## §2 Source release inventory

Two surviving releases on disk, plus the long-standing UMLS reference
set. Per-shard sizes from a 2026-04-16 listing of
`/mnt/solemd-graph/data/`; totals pinned by `01 §5`.

### 2.1 Semantic Scholar 2026-03-10

`source_code='s2'`, `release_tag='2026-03-10'`, path
`/mnt/solemd-graph/data/semantic-scholar/releases/2026-03-10/`. ~638 GB.

| Dataset | On-disk shape | Shards | Maps to (`02 §4`) |
|---|---|---:|---|
| `papers` | `papers/papers-NNNN.jsonl.gz` (1 GB shards) | 60 | `s2_papers_raw`; `05e` promotes admitted-corpus rows into canonical `papers` + `paper_text` |
| `paper-ids` | `paper-ids/paper-ids-NNNN.jsonl.gz` | 30 | raw identifier input; `05e` backfills canonical `papers` ids for admitted corpus papers |
| `abstracts` | `abstracts/abstracts-NNNN.jsonl.gz` | 30 | raw text input; `05e` backfills `paper_text.abstract` for admitted corpus papers |
| `authors` | `authors/authors-NNNN.jsonl.gz` | 30 | `s2_authors_raw`; per-paper author fanout still lands in `s2_paper_authors_raw` from `papers`, and `05e` promotes mapped-paper authorship into `authors` + `paper_authors` |
| `citations` | `citations/citations-NNNN.jsonl.gz` (largest) | 358 | raw aggregate metrics by default; actual `paper_citations` edges are mapped-tier enrichment |
| `tldrs` | `tldrs/tldrs-NNNN.jsonl.gz` | 30 | mapped-tier input; `05e` backfills `paper_text.tldr` for mapped papers, not broad raw corpus |
| `publication-venues` | one shard | 1 | raw venue input for selection and later canonical backfill |
| `s2orc_v2` | `s2orc_v2/` when mirrored for the release | deferred | evidence-tier document-spine input only; not broad raw or mapped ownership |
| `embeddings-specter_v2` | `embeddings-specter_v2/` when mirrored for the release | deferred | mapped-tier `paper_embeddings_graph` halfvec(768) input per `02 §4.6` |
| `manifests` | `manifests/<dataset>.manifest.json` | 1 per ds | per-dataset planning input (§4.1) |

`<dataset>.manifest.json` shape (verbatim from disk):

```json
{ "dataset": "papers", "release_id": "2026-03-10",
  "source": "https://api.semanticscholar.org/datasets/v1/release/2026-03-10/dataset/papers",
  "verification_method": "download-time verification (gzip -t)",
  "generated_at": "2026-03-21T23:32:46.578109+00:00",
  "file_count": 60,
  "files": [{"name":"papers-0000.jsonl.gz", "bytes":1073824525, "verified":true}, ...] }
```

Release-level checksum = canonicalized hash of the concatenated
`<dataset>.manifest.json` set (sorted by dataset name); lands on
`solemd.source_releases.manifest_checksum` per `02 §4.1`. **locked**

> **Open item (flagged for reviewer).** The `05` brief refers to "parquet /
> jsonl shards" but on-disk reality on 2026-04-16 is *only* JSONL.gz —
> no parquet shards in `2026-03-10/`. The S2 Datasets API
> (<https://api.semanticscholar.org/api-docs/datasets>) ships gzipped
> JSON. DuckDB handles both natively (`read_json_auto` for JSONL,
> `read_parquet` for parquet); the §5.1 contract is unchanged if S2 ever
> publishes parquet alongside.

### 2.2 PubTator3 2026-03-21

`source_code='pt3'`, `release_tag='2026-03-21'`, path
`/mnt/solemd-graph/data/pubtator/releases/2026-03-21/`. ~210 GB.

| Dataset | On-disk shape | Maps to (`02 §4`) |
|---|---|---|
| `biocxml` | `biocxml/BioCXML.NN.tar.gz` (10 tarballs) | `pubtator.*_stage` payload for later selected-paper canonical promotion; full document spine and grounding families remain downstream child-wave work |
| `bioconcepts2pubtator3.gz` | TSV bio-concept dump | side-channel into `pubtator.entity_annotations_stage` |
| `relation2pubtator3.gz` | TSV BioREx relations | `pubtator.relations_stage`; `05e` backfills canonical `pubtator.relations` for mapped papers |
| `cache` | local download cache | ignored |
| `manifests` | `annotations.manifest.json`, `biocxml.archive_manifest.sqlite`, `biocxml.corpus_locator.sqlite`, `biocxml.manifest.json` | sqlite files are PubTator-side PMID → tarball indexes; ingest may use `corpus_locator.sqlite` for §5.2 dedup but it is not authoritative |

PubTator3 BioCXML follows BioC schema 1.0
(<https://academic.oup.com/nar/article/52/W1/W540/7640526>); each
`<document>` carries `<id>` (PMID), `<passage>` blocks, `<annotation>`
rows, `<relation>` records.

### 2.3 UMLS Metathesaurus

`source_code='umls'`. Slow-changing reference set (quarterly). Path stub
`/mnt/solemd-graph/data/umls/releases/<tag>/` (not on disk on
2026-04-16). Maps directly to `umls.MRCONSO`, `MRREL`, `MRSTY`, `MRHIER`,
`MRDEF` per `02 §4.1` with **no MAXALIGN reordering** so re-loads drop
in cleanly. Concept derivation into `solemd.concepts` runs as a separate
`ingest_runs` row keyed `(source_code='umls_concepts', release_tag='<umls_tag>:<derivation_policy>')`.

### 2.4 Historical bundles

The ~19 GB under `/mnt/solemd-graph/bundles/` are graph-build artifacts
(`02 §4.7`), not an ingest input. Ingest neither reads nor writes them.

## §3 Run-level lineage

### 3.1 `solemd.ingest_runs` — ingest-write contract

Ingest worker is the only writer. Row shape is now aligned directly in
`02 §4.1`, including `families_loaded`, `last_loaded_family`,
`plan_manifest`, `advisory_lock_key`, `phase_started_at`, and
`requested_status`. Lifecycle: `started → loading → indexing → analyzing
→ published` on success; any state → `failed` on uncaught error or
`aborted` on operator kill. Symbolic phase / operator-action names in
this doc map to SMALLINT codes from `db/schema/enum-codes.yaml`; SQL
snippets below use bind parameters for those codes.

### 3.2 One row per `(source_code, release_tag)`

At most one **in-flight** `ingest_runs` row per release-source pair.
Re-runs reuse the same `ingest_run_id` while status is `started` /
`loading` / `indexing` / `analyzing` / `failed` / `aborted`. Published
rows are immutable history. A forced re-ingest of the same release mints
a fresh `ingest_run_id` against the same `source_release_id`.

```python
async def begin_ingest(source_code, release_tag, force_new_run: bool = False):
    existing = await wh.fetchrow(
        "SELECT ingest_run_id, status FROM solemd.ingest_runs ir "
        "  JOIN solemd.source_releases sr USING (source_release_id) "
        " WHERE sr.source_name=$1 AND sr.source_release_key=$2 "
        " ORDER BY ir.started_at DESC LIMIT 1", source_code, release_tag)
    if existing is None: return await _insert_started_row(source_code, release_tag)
    if existing["status"] == IngestRunStatus.PUBLISHED:
        if force_new_run:
            return await _insert_started_row(source_code, release_tag)
        raise IngestAlreadyPublished(existing["ingest_run_id"])
    if existing["status"] in {
        IngestRunStatus.STARTED,
        IngestRunStatus.LOADING,
        IngestRunStatus.INDEXING,
        IngestRunStatus.ANALYZING,
        IngestRunStatus.FAILED,
        IngestRunStatus.ABORTED,
    }:
        return existing["ingest_run_id"]   # resume
    raise UnknownIngestStatus(existing["status"])
```

**locked**

## §4 Pipeline phases

Six phases in strict order per `(source_code, release_tag)`. Phase
boundaries are also `ingest_runs.status` transitions, so a
`pg_stat_activity` + `ingest_runs` join answers "what is the worker
doing right now?" without extra instrumentation.

### 4.1 Plan

Inputs: on-disk release directory; every
`manifests/<dataset>.manifest.json`; the per-source dataset registry
in `apps/worker/app/ingest/manifest_registry.py` (Pydantic v2 schema,
following the registry / generation rules in `02 §0.10`).

Outputs: (1) `ingest_runs.plan_manifest jsonb` — Pydantic-validated
`IngestPlan(schema_version, source_code, release_tag, release_checksum,
families: list[FamilyPlan(family, sources: list[FilePlan(dataset, path,
byte_count, checksum)], target_partitions: list[int] = range(32),
expected_row_count: int | None, depends_on: list[str] = [])])`;
(2) `solemd.source_releases` row INSERTed if not yet present (`02 §4.1`)
with `manifest_checksum = IngestPlan.release_checksum`;
(3) `ingest_runs.status = loading-code`.

Default S2 build order lands the broad raw/source-local inputs:
`s2_papers_raw`, abstract / TLDR / external-id inputs, `s2_authors_raw`,
per-paper author rows in `s2_paper_authors_raw`, citation aggregates in
`s2_paper_reference_metrics_raw`, venue payloads, and
`paper_embeddings_graph` when
SPECTER2 shards are present. Current code still carries transitional broad S2
promotion helpers into canonical paper tables, but the steady-state ownership
of canonical `papers` / `paper_text` / `paper_authors` / `paper_citations`
belongs to `05e`. Default PT3 build order lands
`pubtator.entity_annotations_stage + relations_stage`; canonical
`pubtator.entity_annotations` / `pubtator.relations` backfill for mapped papers
belongs to `05e`, while full document-spine / grounding families remain
downstream child-wave work.

Plan is advisory inside one ingest run — used for resume + audit, not
to constrain the writer. **locked**.

### 4.2 Stream-transform

DuckDB consumes parquet / JSONL (S2, side-channel PT3 TSVs); `lxml.iterparse`
consumes BioCXML for PT3 grounding.

**DuckDB rules** (canonical 2026 ingestion pattern; Beyond Measure on
DuckDB JSON,
<https://www.dumky.net/posts/turn-thousands-of-messy-json-files-into-one-parquet-duckdb-for-fast-data-warehouse-ingestion/>;
DuckDB `read_parquet`, <https://duckdb.org/docs/data/parquet/overview>):
one connection per worker process (`PRAGMA memory_limit='24GB';
threads=16;` — provisional, `09-tuning.md` owns final values); glob
expansion via `read_parquet([...])` / `read_json_auto([...])` so DuckDB
pushes column projection and predicate down before decompression; no
spill onto the warehouse VHDX (`/tmp` tmpfs only, `01 §6`); streaming
via `cursor.fetchmany(N)` so the C++ engine batches without
materializing full results.

**`lxml.iterparse` rules for BioCXML**: `iterparse(stream,
events=('end',), tag='document')` so only `</document>` events fire;
per-event handler clears with `element.clear(keep_tail=False)` and
drops preceding siblings to bound RSS < 2 GiB
(<https://lxml.de/parsing.html#modifying-the-tree>); one worker per
`BioCXML.NN.tar.gz` (pool sized 8 on the 16-core host, leaving room for
asyncpg + PG); records ship to asyncpg at each 5 000-row batch
(or end-of-document, whichever first).

### 4.3 Bulk load

asyncpg's `copy_records_to_table` writes wire-format binary `COPY FROM
STDIN` directly (<https://magic.io/blog/asyncpg-1m-rows-from-postgres-to-python/>;
`research-distilled §2`). Per-partition fan-out — one asyncpg pool
(`min=8, max=64`; 32 partitions × ~2 = 64 slots), session GUCs
`synchronous_commit='off'`, `temp_buffers='256MB'`,
`application_name='ingest-worker'`; one coroutine per partition,
32 coroutines per family. The COPY-write helper:

```python
async def copy_partition(family: str, partition: int, records_iter):
    table = f"{family}_p{partition:02d}"
    async with wh_pool.acquire() as conn:
        await conn.copy_records_to_table(
            table, schema_name="solemd", records=records_iter,
            columns=_FAMILY_COLUMN_ORDER[family],   # MAXALIGN per 02 §0.3
        )
```

Partition routing happens **in the worker**, before COPY:

> **Routing-hash decision (provisional).** Python's `hash(int)` is not
> compatible with PG's hash-partition function. Two options:
>
> 1. Compute via PG: `SELECT (hashint8($1) % 32 + 32) % 32` per batch
>    (cheap, correct parity oracle).
> 2. Re-implement PG's compatible routing hash in Python (zero
>    round-trip). **Locked** as the steady-state path, with parity tests
>    against PostgreSQL on representative `corpus_id` samples before
>    first production use.

### 4.4 Post-load index build

Indexes built **after** all 32 partitions for a family complete COPY.
`CREATE INDEX` parallel, **not** `CONCURRENTLY` (no readers). Per-family
index list owned by `02 §4`; ingest iterates them via a per-session
session-state of:

- 68 GB host: `maintenance_work_mem='8GB'`,
  `max_parallel_maintenance_workers=8`
- 128 GB host: `maintenance_work_mem='16GB'`,
  `max_parallel_maintenance_workers=12`

plus `temp_buffers='512MB'` and a `DO` block that loops `0..31` and
`CREATE INDEX` per partition.

PostgreSQL's parallel utility-command rule matters here: for one
parallel `CREATE INDEX`, `maintenance_work_mem` is the budget for the
whole command, not a per-worker multiplier. So `max_parallel_maintenance_workers`
scales CPU / I/O parallelism more than RAM linearly.

Per-family index order: (1) PK on every partition first (COPY does not
enforce); (2) per-partition btrees (reverse-direction, partial);
(3) GIN — PG 18 added parallel GIN build, ~45 % faster than 17
(`research-distilled §2`); (4) BRIN (cheap; serial after btrees);
(5) HNSW on `paper_embeddings_graph` last when triggered (deferred
per `02 §4.6`; ~3–6 h on `halfvec(768)` × 14 M with
`maintenance_work_mem=32GB`, `max_parallel_maintenance_workers=8` per
`research-distilled §4`).

`ingest_runs.status = indexing-code` set at phase start; held until every
family's index list completes.

### 4.5 SET LOGGED + VACUUM

Per partition, after that partition's indexes are built:

```sql
ALTER TABLE solemd.paper_blocks_p07 SET LOGGED;
VACUUM (FREEZE, ANALYZE, PARALLEL 6) solemd.paper_blocks_p07;
```

`SET LOGGED` writes the entire partition to WAL (PG wiki on SET LOGGED).
~tens of minutes for a 100 GB partition; cost paid exactly once with
no readers.

`VACUUM (FREEZE, ANALYZE, PARALLEL 6)` does three things in one pass:
sets hint bits + freeze map so post-publish FDW index-only scans don't
pay the VM-miss cost on downstream selected-corpus and evidence-serving
round-trip paths (`02 §4.5` / `03 §3`); refreshes planner stats
(mandatory pre-publish so the FDW-side planner sees real stats); runs
6 worker parallelism (<https://www.postgresql.org/docs/current/sql-vacuum.html>).

`ingest_runs.status = analyzing-code` set at phase start.

### 4.6 Publish

One UPDATE inside one transaction:

```sql
UPDATE solemd.ingest_runs
   SET status              = $status_published,
       completed_at        = now(),
       last_loaded_family  = $1,
       families_loaded     = array_append(families_loaded, $1)
 WHERE ingest_run_id       = $2
   AND status              = $status_analyzing;
```

This is the **projection trigger** (§13). No multi-step swap, no atomic
rename — the warehouse table is the live target throughout the cycle,
and there are no concurrent readers. If the publish flip itself crashes
(PG restart between `analyzing` and the UPDATE), the next worker run
sees `status = analyzing-code` and re-attempts. PG rolls back any partial
state. **locked**.

Post-publish, the worker releases the §10 advisory lock and exits.
The next pg_cron poll (§11) will not re-trigger the same release.

### 4.7 Slice 6 follow-on actor topology

The next agent should implement the first warehouse ingest lane by
extending the **current** worker shell in `apps/worker/app`, not by
reviving the archived `engine/app/...` layout used in historical
examples elsewhere in this doc set.

The shape is intentionally narrow:

- queues: `ingest` for release orchestration, `ingest_file` for
  DB-backed file work that has a durable task row
- entry actor: `ingest.start_release(source_code, release_tag, force_new_run=False)`
- trigger: `ingest-poll-manifests` / external dispatcher hands off one
  new `(source_code, release_tag)` pair at a time from the warehouse
  filesystem
- pool: `ingest_write` only
- lock scope: one per-release advisory lock held by the entry actor for
  the full run
- in-actor decomposition: most family loaders are regular async functions
  inside the actor process; S2 `citations` is the first exception because
  every file task is durable in `solemd.ingest_file_tasks` and can be
  retried without losing the family boundary

This keeps one `ingest_runs` owner, one retry boundary, and one
warehouse-local promotion lane. The detailed file split, retry shape,
refresh contract, and acceptance bar for the implementing agent are
owned by §14.

## §5 Per-source pipelines

### 5.1 Semantic Scholar JSONL → warehouse

**`papers` → `s2_papers_raw`; selected-paper canonical promotion is owned by
`05e`.** DuckDB stream-transform with predicate pushdown:

```sql
COPY (
  SELECT
    corpusid                                            AS s2_corpus_id_raw,
    externalids.PubMed                                  AS pmid,
    lower(regexp_replace(externalids.DOI,'\s+','','g')) AS doi_norm,
    externalids.PubMedCentral                           AS pmc_id,
    paperId                                             AS paper_id,
    title, venue AS venue_raw, year,
    publicationdate::date                               AS publication_date,
    md5(to_json(struct_pack(*)))                        AS payload_checksum
  FROM read_json_auto(
    '/mnt/solemd-graph/data/semantic-scholar/releases/2026-03-10/papers/papers-*.jsonl.gz',
    format='newline_delimited', compression='gzip',
    maximum_object_size=10_000_000
  )
  WHERE corpusid IS NOT NULL
) TO STDOUT (FORMAT 'parquet', COMPRESSION 'zstd', ROW_GROUP_SIZE 100_000);
```

Worker pipes the DuckDB cursor to `s2_papers_raw`:

```python
async def load_s2_papers_raw():
    cursor = duck.execute(_S2_PAPERS_RAW_QUERY)
    while batch := cursor.fetchmany(10_000):
        await wh_pool.copy_records_to_table(
            "s2_papers_raw", schema_name="solemd", records=batch,
            columns=_S2_PAPERS_RAW_COLUMNS,
        )
```

A one-shot SQL path currently broad-promotes portions of `s2_papers_raw`
into `papers` + `paper_text`, allocating `corpus_id` via the identity
sequence. Treat that as transitional implementation inventory. The
durable contract is that `05e` promotes/backfills mapped-paper rows into
the canonical paper layer idempotently so those tables reflect the
selected universe rather than the full raw release breadth.

**`citations` should converge on a broad aggregate surface, not broad edge
persistence.** Largest dataset — 358 shards, ~330 GB compressed. Raw ingest
writes paper-level aggregate metrics such as `reference_out_count`,
`influential_reference_count`, and `linked_reference_count` to
`s2_paper_reference_metrics_raw`. The implemented path inserts one
`solemd.ingest_file_tasks` row per citation file, sends file actors on the
`ingest_file` queue, writes into `s2_paper_reference_metrics_stage`, validates
completed files with `s2_paper_reference_metrics_file_checkpoints`, and then
performs one set-based final replacement into the raw aggregate table. Actual
paper-to-paper edges belong to mapped enrichment in `paper_citations`, scoped
to mapped citing papers and resolving `cited_corpus_id` only when the cited
paper is already canonical. Evidence owns only text-anchored citation mentions
in `paper_citation_mentions`.

**`abstracts`** remain raw text input until `05e` backfills
`paper_text.abstract` for mapped papers. Storage remains `EXTERNAL` per
`02 §4.2`.

**`authors` → `s2_authors_raw`, with per-paper author fanout still landing
under `papers` in `s2_paper_authors_raw`.** `05e` promotes mapped-paper
authorship into canonical `authors` + `paper_authors`. Author dedup is still
keyed on `(orcid, normalized_name)` per `02 §4.2`.

**`paper-ids`** remain raw identifier input until `05e` backfills
canonical `papers.pmid`, `doi_norm`, `pmc_id`, and `s2_paper_id` for
mapped papers. Those ids are then used by PT3's `pmid → corpus_id`
lookup (§5.3).

**`publication-venues`** follows the same raw family shape as the other
default S2 files.

**`tldrs`** is deliberately not part of default broad raw ingest. The mapped
rollout consumes it for active mapped papers and backfills `paper_text.tldr`
there; retention must keep the source shards until that mapped wave has either
consumed or explicitly waived them.

`embeddings-specter_v2` is covered in §5.4.

### 5.2 PubTator3 BioCXML → warehouse

`lxml.iterparse` is the streaming entry point; one process per tarball.
Each tarball is decompressed into an in-memory file-like buffer; the
canonical streaming pattern (`tag='document'`, `clear(keep_tail=False)`,
`del doc.getparent()[0]` to drop prior siblings) bounds RSS < 2 GiB
regardless of corpus size:

```python
import tarfile
from lxml import etree

def stream_biocxml(tarball_path: str):
    with tarfile.open(tarball_path, mode='r:gz') as tar:
        for m in tar:
            if not m.isfile() or not m.name.endswith('.xml'): continue
            for _, doc in etree.iterparse(tar.extractfile(m), events=('end',), tag='document'):
                yield _parse_document(doc)
                doc.clear(keep_tail=False)
                while doc.getprevious() is not None:
                    del doc.getparent()[0]
```

`_parse_document(doc)` extracts `<id>` (PMID), iterates `<passage>` for
offsets / text / `infon[@key='section_type']` / nested `<annotation>`
rows, and iterates `<relation>` for BioREx outputs.

Per-`<document>` output mapping in the raw lane:

| BioCXML element | Raw/stage output | Contract note |
|---|---|---|
| `<document><id>` | stage-level PMID / document locator carried through `pubtator.*_stage` rows | broad upstream identity only |
| `<document><passage>` | stage-level passage text / offsets | feeds later selected-paper canonical promotion or downstream hot/full-text work |
| `<annotation>` (entity) | `pubtator.entity_annotations_stage` | broad upstream annotation payload only |
| `<annotation>` (citation) | stage-level citation payload | downstream grounding family still owed |
| `<relation>` | `pubtator.relations_stage` | broad upstream relation payload only |

Canonical `pubtator.entity_annotations` / `pubtator.relations` are
selected-corpus backfill targets for mapped papers under `05e`.
`paper_documents`, `paper_sections`, `paper_blocks`, `paper_sentences`,
`paper_entity_mentions`, `paper_citation_mentions`, `paper_concepts`,
`paper_relations`, and `paper_evidence_units` remain downstream
document-spine / grounding work (`05a`, `05f`); the raw lane must not
present them as already-owned outputs.

**Side-channel TSVs.** `bioconcepts2pubtator3.gz` and
`relation2pubtator3.gz` load via DuckDB `read_csv_auto` (gzip
auto-detected) into the same staging tables as BioCXML rows. Used as
cross-check; disagreements log to §12 but don't abort. If BioCXML and
`relation2pubtator3.gz` emit the same canonical relation key
`(corpus_id, subject_entity_id, relation_type, object_entity_id)`,
the later selected-corpus backfill into canonical `pubtator.relations`
should keep the BioCXML row (`relation_source = biocxml`) and treat the
TSV row as stage-level cross-check lineage rather than the winner.

### 5.3 ID remapping

`solemd.corpus` identity sequence is the only source of new
`corpus_id`s. Downstream tables resolve via lookup tables. Worker
maintains an in-process **lookup cache** keyed on the canonical natural
key: S2 `paper_id` (~14 M → ~700 MB dict); PT3 `pmid` (~14 M → ~250 MB);
UMLS / concepts `(xref_namespace, xref_value)` (~5 M → ~200 MB).

**Cache build options (provisional):**

1. **Python dict.** Built once at family-load start by
   `SELECT paper_id, corpus_id FROM solemd.papers`. ~700 MB × 8 workers
   ≈ 5.6 GB. Acceptable on 68 GB host.
2. **DuckDB hash-join via `duckdb_postgres`.** Attach warehouse via
   `ATTACH 'postgresql://…' AS pg (TYPE POSTGRES, READ_ONLY)` and JOIN
   inside DuckDB. Avoids the Python dict but pays a network roundtrip
   per batch. Slower for bulk; use only when the cache won't fit.

**Locked for first sample build:** Python dict. **Provisional**:
revisit if RAM headroom shrinks once SPECTER2 + PT3 grounding + chunk
derivation all run in one cycle. Cache is read-only after build;
newly admitted `corpus_id`s flush at family-boundary checkpoints.

### 5.4 Graph-embedding ingest / generation

`embeddings-specter_v2` is a mapped-tier graph source, not default raw
ingest. If the local mirror contains S2's release shards for the active
release, the mapped rollout consumes only the active mapped cohort and writes
`paper_embeddings_graph`. If the local mirror is missing those shards, the
graph lane still requires `paper_embeddings_graph`, so the source contract is:

1. **Use upstream S2 embeddings when the release actually carries them.**
2. **Otherwise generate SPECTER2 locally for the active graph rollout wave**
   and write the same `paper_embeddings_graph` rows.

This is a local project policy around our mirror and rollout scope. It keeps
the graph lane buildable without pretending every local release mirror already
contains the embedding shard or that the first mapped wave needs full-upstream
coverage.

DuckDB read:

```sql
SELECT corpusid::text       AS s2_corpus_id_raw,
       'SPECTER2_v2'        AS model_key_text,
       1::smallint          AS embedding_revision,
       1::smallint          AS embedding_source_kind,  -- upstream_release
       vector::FLOAT[768]   AS embedding
  FROM read_parquet('/mnt/solemd-graph/data/semantic-scholar/releases/<tag>/embeddings-specter_v2/*.parquet')
```

When upstream shards exist, worker resolves `s2_corpus_id_raw →
corpus_id` via the §5.3 cache, then COPYs to `paper_embeddings_graph`
(`02 §4.6`):

```python
async def copy_embeddings(records):
    await wh_pool.copy_records_to_table(
        "paper_embeddings_graph", schema_name="solemd",
        records=((r.corpus_id, _model_key('SPECTER2_v2'), r.embedding_revision, r.embedding_source_kind, r.embedding) for r in records),
        columns=("corpus_id","model_key","embedding_revision","embedding_source_kind","embedding"),
    )
```

`halfvec(768)` vs `vector(768)` is provisional per `02 §0.1`. Ingest is
column-type-agnostic — COPY records emit as `array.array('f', …)` and
asyncpg handles the wire format either way. **Locked at the COPY
contract; provisional at the column type.**

When upstream shards do **not** exist, the same target table is fed by a
local SPECTER2 batch-generation stage for the included graph cohort. The
wave-based rule matters here: day one does not require generating
full-corpus graph embeddings before the graph lane becomes usable.
Locally generated rows write `embedding_source_kind = 2` so later rebuilds can
distinguish them from upstream-shipped rows without guesswork. HNSW build
remains deferred per `02 §4.6`.

## §6 Resource budget

Concrete numbers for the first run on the 68 GB host. Updated when the
128 GB upgrade lands.

### 6.1 DuckDB

- `PRAGMA memory_limit='24GB'` per worker. With 8 PT3 + 4 S2 workers
  that exceeds 68 GB; mitigation: PT3 capped at 4 during S2 phase, full
  8 once S2 phase completes.
- `PRAGMA threads=16` matches host logical cores.
- Spill goes to `/tmp` on tmpfs (`01 §6`); never to the warehouse VHDX.

### 6.2 Worker pool sizing

Inside the single active release actor, loader concurrency stays
bounded and source-aware rather than spawning multiple independent
Dramatiq workers for the same release.

S2 loader tasks: 4 at peak (one per heavy dataset; `citations` is the
pacing item). PT3 archive-loader tasks: 4 during S2 overlap, full 8
only when PT3 is the active pacing source and memory headroom is
available. Concept-mapping tasks: 1–2. Index-build coordinator: 1
(spawns parallel `CREATE INDEX` across families; PG controls parallel
maintenance workers per §4.4).

Per-worker peak: ~24 GB DuckDB + ~700 MB lookup cache + ~1 GB Python ≈
26 GB. S2 / PT3 phases don't overlap by default (separate
`ingest_run_id`s). Within S2: 4 × 26 ≈ 104 GB > 68 GB. Mitigation: drop
DuckDB `memory_limit` to 12 GB during 4-worker concurrent S2 (4 × 14 ≈
56 GB resident + ~12 GB for PG + OS = 68 GB exact). **Provisional**;
128 GB upgrade restores headroom.

### 6.3 asyncpg pool

Per `00`'s four-pool topology, raw ingest uses one **ingest_write
pool** — direct, no pooler (warehouse has no PgBouncer day one).
Sizing: `min=8, max=64` (32 partitions × ~2 = 64); `command_timeout=None`;
session GUCs `synchronous_commit='off'`, `temp_buffers='256MB'`,
`application_name='ingest-worker-{family}'`. `wal_level='minimal'` is
asserted (cluster-level, set by `09-tuning.md`).

### 6.4 PG configuration ingest needs

Owned by `09-tuning.md`; ingest only surfaces requirements: `wal_level=minimal`
(bulk COPY skips WAL, `00 §3`); `archive_mode=off` (no PITR on
warehouse); `synchronous_commit=off` during ingest, flip on after
(≤ 3 × `wal_writer_delay` loss on crash, no corruption per
`research-distilled §5`); `maintenance_work_mem` 8 GB per session on
68 GB host / 16 GB on 128 GB host during phase 4.4;
`max_parallel_maintenance_workers=8` on 68 GB host / 12 on 128 GB
host; `effective_io_concurrency=128` (warehouse VHDX is
internal-NVMe-backed); `shared_buffers` 12 GB warehouse default
(scales to 24 GB post-128 GB per `09 §2.1`); `temp_buffers=256MB` per
session;
`autovacuum` **disabled** on UNLOGGED partitions during phase 4.3
(`02 §3.2`), re-enabled per `02 §6.3` after publish.

### 6.5 Estimated wall-clock

Handoff-plan envelope: **5–9 hours** for first full S2 + PT3
sequential ingest.

**S2 (~638 GB, dominated by `citations`):** plan + manifest checksum
~5 min; DuckDB stream-transform ~25 min (4 workers × ~250 MB/s
parquet/JSONL throughput ≈ 1 GB/s aggregate); asyncpg COPY ~4 h
(PG bottleneck ~250–400 k rows/s per partition × 32 = ~10 M rows/s
aggregate; 14 M papers + ~1.5 B citation rows = ~150 s + ~250 min);
parallel CREATE INDEX × 12 workers ~45 min (citations is the costly
one at ~30 min); SET LOGGED + parallel VACUUM ~30 min; publish < 1 s.
**S2 total ~5.5 h.**

**PT3 (~210 GB BioCXML):** plan < 1 min; BioCXML stream + COPY
~1.5–2 h (10 tarballs × 25 GB compressed, 8 workers post-S2 phase at
~50 MB/s each); concept mapping ~30 min; index build ~30 min; SET
LOGGED + VACUUM ~20 min; publish < 1 s. **PT3 total ~3 h.**

**Combined sequential: ~8.5 h**, comfortably inside the 5–9 h envelope.
What pushes it over: SPECTER2 HNSW build (3–6 h on `halfvec(768)` ×
14 M); RAM-induced DuckDB spill; folding inline grounding chunk
derivation into ingest (today owned by a separate post-ingest worker).

**Locked** for the math shape; **provisional** for absolute numbers
until first sample build.

### §6.1 Storage footprint and tiered-retention contract

The ingest design is tiered. Local hot storage is not meant to hold the
entire upstream source archive, every broad raw warehouse surface, every
mapped/canonical projection, and every browser bundle indefinitely.

Retention tiers:

| Tier | Purpose | Local hot-storage rule |
|---|---|---|
| Source archive | Compressed upstream S2 / PubTator release files and manifests. | Required while a family is active or resumable. After `families_loaded` records that family and source checksum/provenance is durable, archive off the hot VHD or delete from hot storage. |
| Warehouse raw / stage | Typed, queryable raw tables used for refresh-safe promotion and audit. | Keep only families that are part of the published raw-release contract. Do not materialize broad edge/text expansions unless a downstream tier requires them. |
| Canonical selected corpus | Mapped `papers`, `paper_text`, citations, concepts, relations, chunks, and evidence units. | Keep selected/mapped subsets and durable provenance. This tier is the product substrate; it is not a second copy of the full upstream release. |
| Serve / graph bundles | Checksum-addressed browser and retrieval artifacts. | First-paint bundles stay slim; large relation/detail assets are lazy or downstream artifacts. |

Default footprint rules:

- S2 citation ingest defaults to aggregate paper-level metrics in
  `solemd.s2_paper_reference_metrics_raw`. Actual `paper_citations` edge
  materialization is a mapped-corpus enrichment, not part of the broad raw
  default.
- `s2orc_v2/` is evidence-tier only. It should not be pulled into default raw
  ingest or mapped rollout just because the files exist.
- `tldrs/` and `embeddings-specter_v2/` are mapped-tier inputs. Load or
  generate them only for the active mapped wave that needs the richer surface.
- PubTator BioCXML is needed for high-fidelity text/entity extraction, but the
  compressed tarballs do not need to remain on local hot storage after the
  corresponding release family is committed and recoverable from an external
  archive.
- `families_loaded` is the deletion boundary for hot raw files, not
  `current_work_item` progress. Never delete raw files for the active family
  or a family not present in `families_loaded`.
- Deleting files inside a WSL-mounted VHD frees ext4 blocks only. Windows does
  not recover host disk space until WSL is stopped and the VHD is compacted
  offline; operator runbooks must account for that before treating deletion as
  recovered host capacity.
- A local workstation ingest must preserve host-volume headroom for Postgres
  table growth, indexes, WAL/checkpoints, and temporary files. Keeping raw
  source archives plus loaded warehouse rows on the same nearly-full host
  volume is an operational failure mode, not the steady-state contract.

Operational guardrail:

```bash
uv run --project apps/worker python -m app.main source-retention s2 2026-03-10
```

This command is the source-retention authority for S2 hot-storage cleanup. It
acquires the same `ingest:{source}:{release}` advisory lock used by the ingest
runtime, compares the current manifest checksum with `source_releases`, reads
the latest `ingest_runs.families_loaded`, and emits a dry-run JSON report. It
never mutates files unless called with `--execute --action archive|delete`.
`delete` additionally requires `--provenance-ok` because raw release files are
recoverable only through upstream re-download or an external archive.
`archive` is intentionally limited to a same-filesystem rename; off-device
copies must be performed and verified outside the worker before using the
guarded delete path.

For `s2:2026-03-10`, the intended policy is:

- Keep `citations/` until the citation aggregate family commits, then remove
  the hot source directory after provenance is durable.
- Keep `papers/` and `abstracts/` until their family appears in
  `families_loaded`; before the full S2 release publishes they are archive
  candidates, not automatic delete candidates.
- Keep `tldrs/` and `embeddings-specter_v2/` until the mapped rollout consumes
  or explicitly waives them.
- Keep `s2orc_v2/` until the evidence tier consumes or explicitly waives it.
- Keep `manifests/` on hot storage for checksum/provenance validation.
- Treat unregistered directories such as `paper-ids/` as manual-review items,
  not automatic deletion targets.

**locked** for tier boundaries; **provisional** for exact per-family
retention timing until the backup/archive lane is repaired.

## §7 Idempotency & resume

`ingest_runs` is the resume key. `families_loaded text[]` (§3.1) is
monotone within one `ingest_run_id`.

| Existing status | Worker action |
|---|---|
| `published` | No-op; raise `IngestAlreadyPublished`. To force re-ingest, run with `--force-new-run` and mint a fresh `ingest_run_id` against the same `source_release_id`. |
| `started` / `loading` / `indexing` / `analyzing` | Resume from `families_loaded`. §3.2 entry guard returns the existing `ingest_run_id`; §4 family loop skips families already in `families_loaded`. |
| `failed` | Same as resume; `families_loaded` may be partial. Plan checksum compared against on-disk manifest (§4.1 `release_checksum`); mismatch raises `PlanDrift`. |
| `aborted` | Same as `failed`; operator must re-trigger. |

Per-family resume in two stages:

Source-retention cleanup must follow the same boundary. A family recorded in
`families_loaded` will be skipped on resume and can leave hot source storage
once manifest provenance is durable. A family missing from `families_loaded`
is still replay material even when live metrics showed partial progress, and
its source files must remain available.

1. **Mid-COPY crash on F.** F is in `loading`; F not in `families_loaded`.
   UNLOGGED partitions of F may be partially populated. §9.1 recovery
   drops + re-loads.
2. **Mid-index crash on F.** F's partitions are fully loaded but indexes
   are partial. §9.2 recovery drops the partial indexes and re-runs
   CREATE INDEX from scratch on F.

A second `families_loaded`-like marker for index completion is
**deferred** — per-family advisory lock (§10) plus the cheap re-run of
`CREATE INDEX` on a fully-indexed family is acceptable overhead.

```python
async def project_ingest(source_code, release_tag, plan):
    run_id = await begin_ingest(source_code, release_tag)
    state = await wh.fetchrow(
        "SELECT status, families_loaded, plan_manifest FROM solemd.ingest_runs WHERE ingest_run_id=$1",
        run_id)
    if state["status"] == IngestRunStatus.PUBLISHED: raise IngestAlreadyPublished(run_id)
    if hash_canonical_json(state["plan_manifest"]) != hash_canonical_json(plan.model_dump()):
        raise PlanDrift(run_id)
    already = set(state["families_loaded"])
    await advance_status(run_id, IngestRunStatus.LOADING)
    for family in topological_order(plan.families):
        if family.family in already: continue
        await stream_load_family(run_id, family)
        await wh.execute(
          "UPDATE solemd.ingest_runs SET families_loaded=array_append(families_loaded,$1), last_loaded_family=$1 WHERE ingest_run_id=$2",
          family.family, run_id)
    await advance_status(run_id, IngestRunStatus.INDEXING);  await build_all_indexes(plan)
    await advance_status(run_id, IngestRunStatus.ANALYZING); await set_logged_and_vacuum_all(plan)
    await advance_status(run_id, IngestRunStatus.PUBLISHED)
```

**locked**

## §8 Data quality gates

| Condition | Action | Decision |
|---|---|---|
| Schema drift in source dataset (column missing, type changed vs registry) | **abort** the family before any COPY; raise `SourceSchemaDrift` with diff. | locked |
| Row-count drift > 5 % vs prior published release | **warn**; require operator ack via `requested_status = continue-code`. Default: pause. | provisional (5 % threshold tunable; gate-pause-ack pattern locked) |
| Citation aggregate row has orphaned or unresolved references | **record them in `orphan_reference_count`** on `s2_paper_reference_metrics_raw`; do not force broad citation-edge promotion. Log + count. | locked |
| Duplicate `paper_id` within source `papers` shard | **abort** — source bug; cannot decide which row wins. | locked |
| Missing `<id>` on PT3 `<document>` | **drop row, count.** | locked |
| BioCXML `<annotation>` with unparsable offsets | **drop annotation, count, log.** | locked |
| Concept `concept_id_raw` not mappable to `concept_id` | **insert with `concept_id=NULL`**, do not abort (per `02 §5` invariant 3). | locked |
| Manifest `verified: false` for any shard | **abort** the dataset. | locked |
| Manifest checksum changes mid-run | **abort**; flag `PlanDrift` per §7. | locked |
| `pg_stat_activity` wait class spends > 5 min on `LWLock:LockManager` | **warn**; partition × index count crossed PG 18 fast-path lock slot threshold (`research-distilled §1` / `02 §0.6`). Don't abort first time; alert via §12. | provisional |

`requested_status` (`continue` | `abort` | NULL) is the operator control
channel, stored as a SMALLINT code from the enum registry. Worker polls
every 30 s during loading.

## §9 Failure & recovery

### 9.1 Mid-COPY crash

UNLOGGED partitions are not crash-safe — PG truncates them on restart
(<https://www.postgresql.org/docs/current/sql-createtable.html>: "if
the database crashes, an unlogged table is automatically truncated").
After a PG restart, every UNLOGGED partition for family F is empty;
resume (§7) re-loads from scratch. If the worker dies but PG keeps
running, the worker's recovery does `TRUNCATE solemd.<family>_p00 … _p31;`
before re-running COPY (cheap — truncate of UNLOGGED is instant).
**Rule of thumb:** on any crash, `TRUNCATE` every UNLOGGED partition
of every family **not** in `families_loaded` before re-running COPY.
**locked**.

### 9.2 Index-build crash

`DROP INDEX IF EXISTS solemd.<family>_pNN_<idx_name>;` for every
(partition, index) pair in F's index list, then re-run CREATE INDEX
from scratch on F. PG's CREATE INDEX is not resumable. Cheap because
heap pages are still resident in `shared_buffers`. **locked**.

### 9.3 SET LOGGED phase crash

`SET LOGGED` is transactional; partitions already SET LOGGED survive,
partitions still UNLOGGED are TRUNCATEd per §9.1. Worker re-runs
`SET LOGGED + VACUUM` on every partition not yet checkpointed for the
analyzing phase. Mitigation: SET LOGGED runs immediately after CREATE
INDEX completes on the same connection — narrows exposure to seconds
per partition. **locked**.

### 9.4 Publish-flip crash

PG rolls back. Status remains `analyzing`. Next worker run re-attempts
the `analyzing → published` UPDATE. **locked**.

### 9.5 Orphan UNLOGGED partitions

Daily pg_cron audit on warehouse scans `pg_catalog.pg_class` for
`relpersistence='u'` (UNLOGGED) tables under `solemd.*` / `pubtator.*`
whose `pg_stat_get_last_analyze_time` is older than 24 h. Emits
Prometheus gauge `ingest_orphan_unlogged_partitions` per §12. Operator
triage: resume the owning ingest run via
`ingest_runs.families_loaded`, or `TRUNCATE` + `ALTER TABLE … SET
LOGGED` + `VACUUM` if abandoned. **locked**.

## §10 Concurrency

### 10.1 Two ingest workers on the same release

Per-release advisory lock, held on a pinned admin connection for the
full ingest cycle:

```sql
SELECT pg_try_advisory_lock(
  hashtext('ingest:'||$source_code||':'||$release_tag)::int8
);
```

Held from §3.1 INSERT through §4.6 publish UPDATE; explicitly released
in a `finally` block. PG releases on session drop per
<https://www.postgresql.org/docs/current/explicit-locking.html>.

`hashtext('ingest:'||source||':'||release)::int8` mirrors `04 §9.1`'s
`hashtext('projection:'||family)::int8`. Consistent namespace prefix
(`ingest:` vs `projection:`) keeps cross-domain collisions
effectively impossible — though `hashtext` outputs only 32-bit
(<https://oneuptime.com/blog/post/2026-01-25-use-advisory-locks-postgresql/view>;
collision exposure noted at
<https://brandur.org/fragments/pg-advisory-locks-with-go-hash>), the
two-domain prefix split keeps the collision surface inside the ingest
domain alone.

> **Open item flagged for reviewer.** Advisory-lock key for ingest is
> locked here as `hashtext('ingest:'||source_code||':'||release_tag)::int8`.
> Projection uses `hashtext('projection:'||family)::int8` per `04 §9.1`.
> They share the single 64-bit advisory-lock space. If the reviewer
> prefers a deterministic registry-based key space (e.g.,
> `1_001 = ingest:s2:2026_03_10`, `2_001 = projection:cards`) consistent
> across both lanes, swap is one line; the rest of this doc is unchanged.

`pg_try_advisory_lock` (try-lock); failure means "another worker is on
this release"; second worker logs `IngestAlreadyInProgress` and exits.
**locked**.

### 10.2 Cross-release ingest

Two workers on **different** releases hold different locks and never
block. Disjoint partitions / tables; index build on F by worker A
doesn't block index build on G by worker B. Memory pressure (§6.2)
is the constraint, not lock contention.

### 10.3 Ingest vs projection

Projection (`04`) reads warehouse but never writes; no warehouse
advisory locks held. PG MVCC handles cross-release overlap correctly
— projection sees a consistent snapshot from its transaction start.
The `04` pattern of projecting from explicit `serving_run_id`-keyed
source rows means the projection cohort never depends on "the latest
version of every row." **locked**.

### 10.4 Raw-file collisions

Release directories under `/mnt/solemd-graph/data/<source>/releases/<tag>/`
are read-only (`01 §3`). Two workers reading the same shard concurrently
is fine. The only write conflict is on the §11 manifest polling,
which stays low-frequency and advisory-lock guarded by design.

## §11 Operational cadence

### 11.1 pg_cron schedules

| Job | Cron | Purpose |
|---|---|---|
| `ingest-poll-manifests` | `*/15 * * * *` | Scans `…/<release_tag>/MANIFEST` files; for each new `(source, tag)` not in `solemd.source_releases`, INSERTs the row and emits a SQL-side handoff / notification that the external dispatcher converts into a Dramatiq `ingest.start` job. |
| `ingest-audit-orphan-unlogged` | `15 6 * * *` | §9.5 audit. |
| `ingest-audit-stuck-runs` | `*/30 * * * *` | Find `ingest_runs` in active ingest phases (`loading`, `indexing`, `analyzing`) whose `phase_started_at` is older than the phase budget (e.g., loading > 12 h, indexing > 4 h). Emit Prometheus gauge `ingest_stuck_runs`. |

Per `03 §6.5` and `04 §11.1`, jobs run on staggered minutes to reduce
collision with other maintenance lanes; `pg_cron` itself is not restricted to
one active job when background workers are enabled
(<https://github.com/citusdata/pg_cron>).

### 11.2 Manual trigger

Operator launches a forced re-ingest:
`uv run --project apps/worker python -m app.main enqueue-release s2 2026-03-10 --force-new-run`.
The §3.2 entry guard leaves the prior published row immutable, mints a fresh `ingest_run_id`,
acquires the §10.1 advisory lock, and runs the §4 pipeline.

### 11.3 Kill-switch

Four layers: (1) per-release freeze via GUC
`app.ingest_disabled_releases='s2:2026-03-10,pt3:2026-03-21'` (worker
reads at release start, skips listed); (2) whole-ingest halt via GUC
`app.ingest_enabled=false` (worker checks at run start); (3) row-level
`ingest_runs.requested_status = abort-code` (worker polls every 30 s
during loading); (4) **manifest-file kill** — removing the `MANIFEST`
marker prevents §11.1 from re-triggering, and already-running workers
are unaffected (intentional). **locked**.

## §12 Observability hooks

This document does not design dashboards (`10-observability.md` does);
it emits requirements `10` must surface. The primary ledger is
`solemd.ingest_runs` itself: every cycle writes `started_at`,
`phase_started_at` (per-phase JSONB), `completed_at`, status
transitions, `families_loaded`, `last_loaded_family`, `error_message`
on failure, and `advisory_lock_key` for `pg_locks` cross-reference.

The landed worker telemetry uses Dramatiq's Prometheus middleware plus
`prometheus_client` application metrics on the same scope-local
multiprocess store prepared by `app.telemetry.bootstrap`.
`app.ingest_worker` owns the `ingest` scope and, by default, exposes it
on local port `9464`.

### 12.2 Required Prometheus metrics

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `ingest_phase_duration_seconds` | histogram | `source_code`, `release_tag`, `phase` | Per-phase wall-clock distribution. |
| `ingest_runs_total` | counter | `source_code`, `outcome` | Terminal ingest outcomes. |
| `ingest_family_rows_total` | counter | `source_code`, `family` | Rows loaded per ingest family. |
| `ingest_family_files_total` | counter | `source_code`, `family` | Files loaded per ingest family. |
| `ingest_failures_total` | counter | `source_code`, `phase`, `failure_class` | Failure-class breakdown. |
| `ingest_active_lock_age_seconds` | gauge | `source_code`, `release_tag` | `now() - lock_acquired_at`; alerts on long-held locks. |

The ingest scope also carries Dramatiq middleware metrics for the
`ingest` and `ingest_file` queues on the same multiprocess store. S2 citation
file-task progress is durable in `solemd.ingest_file_tasks`; Grafana should
query that table for pending/running/completed/failed counts, stale retries,
completed stage rows, and bytes read instead of running broad count sweeps
over staging data. Earlier aspirational throughput / RSS gauges remain
follow-on work and should not be documented as landed.

### 12.3 Required structured log events

Worker logs (jsonlog format per PG 18; `research-distilled §7`):
`ingest.cycle.started` (ingest_run_id, source_code, release_tag, plan);
`ingest.family.staging_complete` (family, rows_loaded, bytes_written);
`ingest.family.indexing_complete` (family, index_count, duration_s);
`ingest.family.set_logged_complete` (family, partitions, wal_bytes_written);
`ingest.cycle.published` (ingest_run_id, families, total_duration_s);
`ingest.cycle.aborted` (ingest_run_id, reason);
`ingest.cycle.failed` (ingest_run_id, phase, family, error_class,
error_message). `10-observability.md` routes these into panels and
alert rules.

## §13 Handoff to projection

Once `ingest_runs.status = published-code`, the projection worker (`04`)
becomes eligible to start a cohort using this `ingest_run_id` as the
source watermark.

**What projection consumes.** Projection (`04 §6.1`) joins on the
canonical selected-corpus tables such as `papers`, `paper_text`,
`paper_metrics`, `paper_lifecycle`, `paper_authors`, `authors`, `venues`,
and `paper_top_concepts`. Under the target contract those tables reflect
the mapped universe maintained by `05e`; current code may still populate
some S2-backed rows earlier as transitional machinery.
It also reads `serving_members` / `serving_cohorts` on **serve** to
resolve the cohort. `serving_runs.source_release_watermark` on serve
is sourced from `ingest_runs.source_release_id` at projection-start time.

**Trigger contract.** Default: pg_cron polling on serve every 5 min
(`projection-trigger-api-refresh` in `04 §11.1`). The ingest-aware
variant compares the latest published warehouse `source_release_id`
against the latest serve `source_release_watermark` over the worker's two
direct pools. If warehouse is ahead, it enqueues projection. The compare
is numeric on `source_release_id`; no timestamp-cast shortcut.

On a hit, the dispatcher enqueues a fresh cohort cycle.

**LISTEN/NOTIFY** is deferred per `04` open items. If it graduates to
locked, the publish UPDATE (§4.6) trivially adds
`NOTIFY ingest_published, jsonb_build_object('ingest_run_id', $1,
'source_code', $2, 'release_tag', $3)::text` so projection reacts in
seconds.

The poll uses the same admin pool (direct asyncpg, no pooler) per
`04 §4`. No FDW dependency for the trigger — 5-minute poll is the
acceptable publish-to-projection-start latency.

## §14 Historical handoff — first raw-release worker landing (completed)

This section is retained as implementation inventory because the first
production-shape raw ingest worker is now landed in `apps/worker`. The next
follow-on slice is `05e-corpus-selection.md`; this section remains useful only
as a record of the worker shape that was just implemented.

Where this historical section mentions canonical promotion helpers, read them
as transitional implementation inventory. The durable boundary is now: raw/stage
ownership in `05`, selected-corpus promotion/backfill ownership in `05e`,
child-wave document/chunk/evidence ownership in `05a` / `05f`.

### 14.1 Ownership in code

The implementation should stay modular, but the split is by responsibility,
not by queue count:

- `apps/worker/app/actors/ingest.py` owns Dramatiq actor entrypoints only.
- `apps/worker/app/ingest/runtime.py` owns run start/resume, advisory lock,
  status transitions, `families_loaded`, and per-family orchestration.
- `apps/worker/app/ingest/models.py` owns Pydantic request / plan / result
  payloads shared across actor, CLI, and tests.
- `apps/worker/app/ingest/sources/semantic_scholar.py` and
  `pubtator.py` own source-specific planning and stream transforms.
- `apps/worker/app/ingest/writers/` owns COPY tuple materialization and
  table-write helpers.
- `apps/worker/app/ingest/cli.py` owns the manual/operator entrypoint and
  must enqueue the same request payload shape the manifest dispatcher uses.

### 14.2 Actor topology

One release-level actor is the canonical boundary:

- `ingest.start_release(request)` is the only release actor. Payload:
  `source_code`, `release_tag`, `force_new_run`, `trigger`,
  `requested_by`, and optional dry-run flags for bench/dev.
- The actor acquires the per-release advisory lock, opens or resumes the
  `ingest_runs` row, builds and verifies `IngestPlan`, then executes the
  per-family loop inside the same actor invocation.
- Do not create file-level Dramatiq messages unless there is a durable
  database task ledger and an idempotent finalizer. S2 `citations` uses this
  pattern: `ingest.start_release` owns release state and finalization, while
  `ingest.s2_citation_file` consumes `solemd.ingest_file_tasks` rows on the
  `ingest_file` queue. Throughput for smaller families still comes from async
  stream readers plus bounded asyncpg COPY coroutines inside the release actor.
- Post-publish follow-on work stays downstream: projection enqueue remains the
  handoff in §13, and chunking remains the `05a` lane. The raw ingest actor
  may enqueue those later actors when their inputs exist, but they are not a
  precondition for the first raw-source landing.

### 14.3 Source-adapter contract

Each source module should own exactly three responsibilities:

1. `build_plan(release_dir, manifests) -> IngestPlan`
2. `stream_family(plan_family) -> AsyncIterator[tuple | dataclass]`
3. `promote_family(run_id, family, copy_writer) -> None`

Shared runtime code owns everything else: run lifecycle, lock management,
metrics, retries, and resume. That split keeps future source refreshes cheap:
new `release_tag` values reuse the same actor and runtime envelope while the
source adapter swaps only the planning and transform logic.

Source-specific notes that should stay explicit:

- Semantic Scholar `s2orc` remains optional. Missing `s2orc` shards are a
  plan omission, not a run failure.
- PubTator `biocxml.corpus_locator.sqlite` is an accelerator only. It may be
  used to narrow archive reads, but it is not the authority for what belongs
  in the release.
- Canonical promotion from the S2 raw staging tables stays on
  `engine_ingest_write`; do not route that promotion through admin just to
  avoid writing the shared helper correctly.

### 14.4 Write-path rules

- Bulk writes use asyncpg `copy_records_to_table`; no row-at-a-time INSERT
  loops on hot families.
- The first raw ingest worker uses the `ingest_write` pool only. Do not add
  `admin` or `warehouse_read` dependencies to the initial S2 / PubTator actor
  path.
- Bound in-family concurrency with a small `asyncio.TaskGroup` or semaphore
  over partitions/shards. The concurrency knob is the number of concurrent
  COPY coroutines, not the Dramatiq thread count.
- Start the raw ingest worker with low thread count and `dramatiq_queue_prefetch=1`.
  For S2 citation fanout on this workstation, use one ingest worker root over
  both queues with process-level parallelism, for example:
  `POOL_INGEST_MIN=1 POOL_INGEST_MAX=8 INGEST_MAX_CONCURRENT_FILES=1 dramatiq app.ingest_worker --processes 8 --threads 1 --queues ingest ingest_file`.
  Dramatiq's AsyncIO middleware still schedules async actors on each process
  event-loop thread; keep thread count low and scale message concurrency with
  worker processes so file actors run in parallel without multiplying nested
  per-process file fanout.
- Deterministic bad-input failures such as `IngestAlreadyPublished`,
  `IngestAlreadyInProgress`, `PlanDrift`, or `SourceSchemaDrift` should be
  typed exceptions surfaced through actor `throws=` or explicit early exits so
  duplicate manifest/manual triggers do not thrash retries or the dead-letter
  queue.

### 14.5 Refresh and rerun contract

- A new S2 or PubTator refresh is a new `source_releases` row plus a new
  `ingest.start_release` message. There is no in-place "current release"
  rewrite inside raw tables.
- A forced replay of the same release uses `force_new_run=True` and mints a
  fresh `ingest_run_id` against the same immutable release directory.
- Resume remains keyed to `families_loaded` for the family completion and
  hot-source-retention boundary. Large families may also own a narrower
  DB-backed work ledger when the implementation has idempotent stage writes
  and a finalizer. Today that narrower ledger is S2 `citations`:
  `solemd.ingest_file_tasks` tracks pending/running/completed/failed file
  attempts, and `s2_paper_reference_metrics_file_checkpoints` validates only
  completed files whose `UNLOGGED` stage rows still exist after a restart.
- Keep raw and canonical promotion modular so a later diff-based S2 refresh can
  skip untouched families without changing the actor envelope.
- Warehouse stays a separate cluster for the full path. The ingest worker never
  writes serve tables and never treats warehouse as "extra tables inside
  serve."

### 14.6 Acceptance bar for the implementing agent

The next implementation PR should not stop at actor stubs. Minimum acceptance:

- manual CLI and manifest dispatcher both enqueue the same validated request
  payload
- one integration test per source proves plan build + deterministic resume
- one end-to-end local sample ingest writes real warehouse rows and updates
  `ingest_runs`
- S2 citations now default to refresh-safe aggregate metrics in
  `solemd.s2_paper_reference_metrics_raw`; actual `paper_citations` edge
  materialization is mapped-owned enrichment
- docs move with code if the file layout, queue names, or role boundaries
  change
- chunking stays downstream of the raw ingest lane rather than being
  reimplemented inline

**locked** for polling; **deferred** for LISTEN/NOTIFY per `04`.

## Cross-family invariants

Beyond `02 §5`:

1. **Every published `ingest_runs` row has `families_loaded` ⊇ the
   published-family set named in `plan_manifest`.** Audited daily;
   emits `ingest_published_inconsistent_runs` counter on mismatch.
2. **Every UNLOGGED partition under `solemd.*` / `pubtator.*` is owned
   by exactly one in-flight `ingest_runs` row.** §9.5 audit job.
3. **`ingest_runs.advisory_lock_key` equals
   `hashtext('ingest:'||source_name||':'||source_release_key)::int8`
   for the corresponding `source_releases` row.** Audit recomputes.
4. **No row in any partitioned warehouse table has `corpus_id` outside
   the partition's hash bucket.** §4.3 routing correctness; audited
   per cycle:
   ```sql
   SELECT count(*) FROM solemd.paper_blocks_p07
    WHERE (hashint8(corpus_id) % 32 + 32) % 32 <> 7;
   -- expected: 0
   ```
5. **`source_release_id` on every fact row is `<=` `paper_lifecycle.last_seen_release_id`.**
   Inherits `02 §5` invariant 4; ingest is the writer, so it's enforced
   at write time, not as a post-load audit.

## Write patterns (ingest worker)

The ingest worker is the only writer of: `solemd.source_releases` (§11
poll), `solemd.ingest_runs` (entirety), all `s2_*_raw` tables,
source-local S2 raw helpers such as `s2_paper_authors_raw` and the current
transitional citation helpers, all `pubtator.*_stage` tables, all `umls.*`
raw tables, and the release-manifest / checksum staging needed to land a
source release. `vocab_terms` / `vocab_term_aliases` are still written
during the manually-triggered curated cycle.

The operational selected stage contract is owned by `05e` as the
`raw -> corpus -> mapped` membership + promotion boundary:

- `corpus` owns `solemd.corpus`, `papers`, `paper_text`, and the selection
  audit surfaces
- `mapped` owns heavier canonical PT3 / authorship and actual paper-to-paper
  citation enrichment in `paper_citations`
- `evidence` owns text-anchored citation mentions in `paper_citation_mentions`

Current code still includes some broad canonical promotion helpers on
`ingest_write`; treat those as transitional implementation inventory rather
than the durable ownership line.

The full-text document spine (`paper_documents` / `paper_sections` /
`paper_blocks` / `paper_sentences`), grounded mention/concept/relation
families, chunk lineage, and `paper_evidence_units` are downstream
evidence-lane surfaces owned by `05a` / `05f`, not broad raw release
ingest. The paper-scoped `evidence` lane in `05f` may later replace the
canonical document-spine rows for an evidence-wave paper with a
higher-fidelity PMC BioC document source, but it does not write raw
release tables or take over `ingest_runs`.

The ingest worker reads (does not write): the release directories
under `/mnt/solemd-graph/data/<source>/releases/<tag>/` (read-only per
`01 §3`); existing `solemd.papers` / `concept_xrefs` for §5.3
lookup-cache build; `solemd.paper_chunk_versions` for the active
`chunk_version_key` used in §5.2 `evidence_key` derivation.

## Read patterns

This doc is **write-only** — ingest never reads warehouse tables for
serving. Warehouse reads happen at projection-build time (`04`) and at
analytical query time (`02 §7.3`). The two internal reads ingest
performs (lookup cache build via full-table scan; resume-state
single-row lookup at worker entry) run via the same `ingest_write`
pool / role, using the narrow SELECT grants documented in `06 §7.1`.
No separate warehouse-admin read path is part of the current Slice 6
implementation contract, and no FDW surface belongs here.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| One published `ingest_runs` row per `(source_code, release_tag)`; UUIDv7 at run start | Inherits `02 §2`; partial rows queryable. |
| `families_loaded text[]` monotone within one `ingest_run_id` | Idempotency / resume; mirrors `04 §5` `tables_built`. |
| Phase status codes `started → loading → indexing → analyzing → published` (or `failed`/`aborted`) | `pg_stat_activity` + `ingest_runs` join answers "what is the worker doing right now". |
| Manifest-file protocol: `MANIFEST` marker triggers ingest via pg_cron poll | Decouples upload from ingest; idempotent; operator removes `MANIFEST` to halt. |
| UNLOGGED → CREATE INDEX (parallel, not CONCURRENTLY) → SET LOGGED → VACUUM (FREEZE, ANALYZE) phase order | `research-distilled §2`; PG wiki on SET LOGGED; Cybertec / EnterpriseDB. |
| `wal_level=minimal`, `synchronous_commit=off`, `archive_mode=off` during ingest | `00 §3` / `research-distilled §5`. Warehouse rebuildable; no PITR. |
| asyncpg `copy_records_to_table` (binary `COPY FROM STDIN`) is the sole bulk-write path | `research-distilled §2`; magic.io asyncpg blog. |
| DuckDB is the sole tabular stream-transformer (parquet, JSONL, CSV) | `read_parquet` / `read_json_auto` push down projection + predicate. |
| `lxml.iterparse` + `clear(keep_tail=False)` is the sole BioCXML stream-transformer | Bounds RSS < 2 GiB regardless of corpus size. |
| Partition routing via in-process PostgreSQL-compatible hash with parity tests against `hashint8($1)` | Keeps Slice 3 within ingest-budget shape while preserving deterministic bucket placement. |
| Per-release advisory lock `hashtext('ingest:'||source_code||':'||release_tag)::int8` | Mirrors `04 §9.1`; `pg_try_advisory_lock` for fast-fail; auto-release on session drop. |
| One UPDATE for publish; no swap | No live readers; no rename needed. |
| Publish flip is projection trigger via `04` pg_cron polling | LISTEN/NOTIFY deferred per `04` open items. |
| Schema drift / duplicate `paper_id` / manifest-checksum drift abort | Silent coercion + dedup races poison downstream joins. |
| Orphan citations increment `orphan_reference_count`; do not force broad edge promotion | Inherits `02 §5` spirit and now matches the aggregate raw citation contract in `02 §4.1`. |
| Concept `concept_id_raw` not mapped inserts `concept_id=NULL` | `02 §5` invariant 3. |
| BioCXML annotations with unparsable offsets dropped + counted | Silent data quality, not corruption. |
| Cross-cluster FK enforcement in worker code, not DB | `04 §2.4`. |
| FDW never in ingest path | `00 §4`, `02 §1`, `03 §3`. |
| `ingest_runs.advisory_lock_key` recorded for audit | Cross-reference with `pg_locks`. |
| One DuckDB connection per worker process | Aligns with `09-tuning.md`. |
| Lookup cache built once per family-load start as Python dict | Simple; fits in 68 GB host with 4-worker cap. |
| BioCXML tarball workers capped at 4 during S2 phase, full 8 after | RAM headroom on 68 GB; restored always after 128 GB. |
| Audit pg_cron jobs for orphan UNLOGGED, stuck runs, advisory-lock-key consistency | Self-healing; surfaces silent corruption fast. |

### Provisional (revisit after first sample build)

| Decision | Revisit trigger |
|---|---|
| `PRAGMA memory_limit='24GB'` (drop to 12 GB during 4-worker S2 phase on 68 GB host) | After 128 GB upgrade. |
| asyncpg pool sizing `min=8, max=64` | Real concurrency observed. |
| 68 GB host: `maintenance_work_mem='8GB'`, `max_parallel_maintenance_workers=8`; 128 GB host: `maintenance_work_mem='16GB'`, `max_parallel_maintenance_workers=12` | Real index-build duration. |
| Row-count drift threshold = 5 % vs prior release | Real release-to-release variability over 6+ months. |
| Wall-clock budget 5–9 h for first full S2 + PT3 ingest | Real measurement; show variance band. |
| Python-dict lookup cache vs DuckDB hash-join via `duckdb_postgres` | RAM headroom shrinks. |
| `halfvec(768)` for SPECTER2 embeddings | Recall validation per `02 §0.1`. |
| Stuck-run thresholds (loading > 12 h, indexing > 4 h) | Real durations from sample. |
| Manifest poll cron `*/15 * * * *` | If releases arrive faster than every 4 h, drop to 5 min. |
| In-process PG-compatible hash for partition routing (§4.3 Option 2) | Profiling shows the per-batch hash query is hot. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| LISTEN/NOTIFY publish trigger | `04` open item resolved. |
| Per-family parallelism inside one cycle | Family-build wall-clock dominates; today indexing dominates. |
| pgBouncer in front of warehouse for ingest | Worker concurrency exceeds 64-slot direct-pool headroom. |
| `pg_partman` 5.x on `ingest_runs` time-range lifecycle | Row count > 10 M (`02 §8`). |
| HNSW build on `paper_embeddings_graph` inside ingest | `02 §4.6` trigger fires. |
| Inline grounding chunk derivation inside ingest | Today owned by the Dramatiq `chunker.assemble_for_paper` actor per `05a §6`; folding it into ingest itself remains deferred until its lag becomes a publish-blocker. |
| Side ledger of phase timestamps vs `ingest_runs.phase_started_at` JSONB | Observability needs structured per-phase queries JSONB extraction is too slow for. |
| GPU-accelerated parquet decode for SPECTER2 | RAPIDS `cudf` profile shows DuckDB-side decode is the bottleneck. |
| Off-box ingest mirror (second machine, COPY-stream) | Multi-host topology becomes a thing. |
| Per-tarball BioCXML idempotency tracking | First complaint about a 1.5-h tarball restart on crash. |
| Schema-drift auto-recovery (typed coerce before abort) | Persistent low-impact source schema churn. |

## Open items

Forward-tracked; none block subsequent docs:

- **SPECTER2 mirror completeness.** `embeddings-specter_v2` is mapped-tier
  input. §5.4 reserves the loader path; once shards are mirrored or local
  generation is scheduled for the mapped cohort, §6.5 wall adds 3-6 h for HNSW
  build only if the `02 §4.6` trigger fires.
- **Parquet vs JSONL discrepancy with the brief.** Brief mentions
  "parquet/jsonl"; on-disk reality is JSONL.gz only. DuckDB handles
  both; §5.1 uses `read_json_auto` today. Source:
  <https://api.semanticscholar.org/api-docs/datasets>.
- **In-process PG-compatible hash.** §4.3 now locks this as the steady-state
  routing path, with PostgreSQL parity tests required before first use.
  Option 2 deferred. Reviewer: confirm the round-trip cost is acceptable.
- **Lookup-cache strategy at 128 GB host.** §5.3 locks Python dict;
  at 128 GB the same dict is resident at full 8-worker concurrency.
  Forward-compatible.
- **`requested_status` row-level kill column.** Resolved: modeled in
  `02 §4.1` and encoded from `db/schema/enum-codes.yaml`.
- **`families_loaded` text[] vs separate ledger table.** Mirrors `04 §5.4`
  debate; today text[] is fine because the family list is < 30 items.

No contradictions discovered with `00–04` or `research-distilled.md`.

Single judgement call worth flagging: the advisory-lock key for ingest
is `hashtext('ingest:'||source_code||':'||release_tag)::int8`. This
mirrors `04 §9.1`'s `'projection:'||family` namespace pattern. If the
reviewer prefers a deterministic registry-based key space consistent
across both lanes, it's a one-line change in §10.1 and the
cross-family invariants in `02 §5`.
