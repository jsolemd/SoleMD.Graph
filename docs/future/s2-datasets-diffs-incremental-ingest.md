# S2 Datasets API — Incremental Diff-Based Ingest

Status: Partially landed: API client, diff manifest ledger, and deletion guardrails are implemented; raw diff application remains gated.
Date: 2026-04-26
Owner: ingest lane (`apps/worker/app/ingest/*`)

## Motivation

Today the S2 ingest lane **re-downloads whole releases** every cycle. With
S2 releasing monthly and the full snapshot totaling ~638 GB (papers 45 GB,
citations 255 GB, s2orc_v2 180 GB, abstracts 54 GB, paper-ids 15 GB,
authors 3 GB, tldrs 6 GB), steady-state bandwidth and processing cost
dominate. The citation dataset alone is 358 shards at ~1 GB each.

S2 exposes `GET /datasets/v1/diffs/{start_release_id}/to/{end_release_id}/{dataset_name}`
which returns the complete change set between two releases as a chain of
per-release-pair `diff` objects. Each diff object contains two URL lists:

- `update_files` — records to **upsert by primary key**
- `delete_files` — records to **remove by primary key**

Skipping the unchanged majority cuts bandwidth by roughly the delta ratio
(expected: 10–50× on citations, ~5–20× on papers) and eliminates the warehouse
truncate-and-reload cycle.

## Current state (facts, not aspiration)

- Downloader/API client: `apps/worker/app/ingest/s2_datasets_api.py` calls
  `GET /datasets/v1/diffs/{start}/to/{end}/{dataset}` with timeout,
  retry, `Retry-After`, `User-Agent`, and optional `x-api-key` support.
- Warehouse loader: `apps/worker/app/ingest/runtime.py` ingests one
  `(source_code, release_tag)` pair per run; `source_releases` table keyed by
  `release_tag: str`. `families_loaded` (models.py:68) checkpoints per-family
  progress.
- Release selection: `config.py::s2_release_id` is hardcoded or env-pinned;
  no `/release/latest` awareness.
- Warehouse write path: full ingest seeds `solemd.s2_dataset_cursors`.
  Diff manifests and per-file URLs land in
  `solemd.s2_dataset_diff_manifests` / `solemd.s2_dataset_diff_files`.
  Raw upsert/delete application is still gated because consumers must honor
  the cursor rather than filtering only on rewritten `source_release_id`.
- On-disk layout: `/mnt/solemd-graph/data/semantic-scholar/releases/<tag>/
  <dataset>/<dataset>-NNNN.jsonl.gz` + per-dataset manifest with checksums.

## Target contract

### Downloader

```
uv run python data/download_s2_dataset.py <dataset> \
  --from-release 2026-02-10 --to-release 2026-03-10
```

Calls `/datasets/v1/diffs/2026-02-10/to/2026-03-10/<dataset>`, receives a
`diffs` array. For each diff object:

1. Download every `update_files` URL → `<base>/diffs/<from>_to_<to>/<dataset>/update-NNNN.jsonl.gz`
2. Download every `delete_files` URL → `<base>/diffs/<from>_to_<to>/<dataset>/delete-NNNN.jsonl.gz`
3. Verify each with `gzip -t` as today.
4. Emit a diff manifest alongside the existing release-manifest format:
   `manifests/<dataset>.diff-manifest.json` with
   `{from_release, to_release, update_checksums, delete_checksums}`.

When the diffs endpoint returns multiple hops (e.g. monthly ingest that
missed two cycles), each hop lands in its own subdirectory and is applied
in order.

### Warehouse loader

Use `solemd.s2_dataset_cursors` rather than adding release-row flags. The
cursor is dataset-scoped because S2 families can advance independently and
because `s2_papers_raw` is a current-state table keyed by paper id.

Extend `apps/worker/app/ingest/runtime.py`:

- `_ensure_source_release`: when `parent_release_tag` is set, require the
  parent row to exist in `source_releases` with `status='published'`.
- Per-family dispatch: if `diff_applied`, the family loader reads update
  shards + delete shards instead of release shards.
- Writer contract: per-family loaders must implement `upsert_by_pk(rows)` and
  `delete_by_pk(rows)`. Today they mostly implement `replace_all(rows)`.
  **This is the biggest code change.** Expected affected families:
  papers, authors, citations, abstracts, tldrs, paper-ids, publication-venues.

Writers under `apps/worker/app/ingest/writers/` need auditing one by one
for which PK they use. Papers: `corpus_id`/`paper_id`. Citations:
`(citing_paper_id, cited_paper_id)`. Authors: `author_id`. Mostly clean
natural keys.

### Release selection

Add `--release-selector` to the downloader:

- `pinned` — uses `S2_RELEASE_ID` (current behavior; default for reproducibility)
- `latest` — polls `/datasets/v1/release/latest`, returns the newest
  `release_id`; writes it to stdout; caller can record it in the ingest run.

pg_cron manifest-poll layer still detects new `(source_code, release_tag)`
pairs the same way; it just sees diff-manifest files in addition to
release-manifest files.

## Rollout plan

Phased, smallest-blast-radius first.

### Phase 1 — small dataset dry-run

- Pick `authors` (smallest at ~3 GB, 30 shards, simple PK).
- Download both full `2026-02-10` release and diff `2026-02-10 → 2026-03-10`.
- Apply to a staging schema; compare authors warehouse state against the
  already-ingested `2026-03-10` full release.
- Success criterion: row-for-row equivalence on natural PK.
- Runtime: ~1 day of work; catches the full-vs-diff semantic gap without
  any production warehouse risk.

### Phase 2 — loader protocol

- Add `upsert_by_pk` + `delete_by_pk` methods to every writer under
  `apps/worker/app/ingest/writers/`.
- Unit tests on each writer with synthetic update/delete shards.
- Warehouse migration: add `parent_release_tag` + `diff_applied` columns
  to `source_releases`.

### Phase 3 — citations pilot

- Citations is where the bandwidth win is largest (~255 GB → expected
  ~20–50 GB delta per month).
- Run both paths in parallel for one month: full-release ingest to a
  canary schema, diff ingest to staging. Diff row counts + shard-level
  checksums.

### Phase 4 — production cutover

- Primary ingest path switches to diffs. Full releases become the
  "rebaseline" fallback for:
  - Cold-start (no parent release on disk).
  - Schema change in a dataset (S2 announces via release notes).
  - Chain length cap: if more than N diffs would need to be applied in
    sequence, force a full re-ingest to bound recovery complexity. Start
    N=3 (conservative).

### Phase 5 — retention

- `apps/worker/app/ingest/source_retention.py` now archives once
  `families_loaded` proves durability, but refuses hot deletion until
  `s2_dataset_cursors.hot_source_delete_safe_at` is non-null for the family.

## Open questions

1. **Dataset schema evolution across diffs.** If S2 adds a column in
   release `R+2`, does the `R → R+1` diff contain the old schema and the
   `R+1 → R+2` diff contain the new? S2 release notes should answer this;
   confirm before Phase 2. Handling options: detect schema mismatch at
   diff-manifest time and force a full re-ingest.

2. **`embeddings-specter_v2` and `s2orc_v2`.** Large dataset families
   where the PK is less obvious (SPECTER2 = paper_id; s2orc = document_id
   but with sections). Audit before extending to them. SPECTER2 isn't in
   the 2026-03-10 release anyway (locked in 05-ingest-pipeline.md §2.1).

3. **Publication-venues.** UUID-keyed, low churn — probably fine.

4. **Release-tag collision.** If two runs race on the same `(source,
   release)` pair where one is a full ingest and the other is a diff
   rebaseline, the `source_releases` row uniqueness must still hold. The
   `diff_applied` flag tells them apart but the row is still one per
   release; the last-write-wins for `diff_applied` is probably fine but
   needs a lock.

5. **Chain recovery.** If the warehouse applied `R → R+1` but not
   `R+1 → R+2`, the `source_releases.parent_release_tag` chain lets us
   reconstruct; but validating it end-to-end needs a walk from the
   current tag back to the last full release.

## What this is NOT

- Not a move to the live Graph API. Bulk dataset diffs, not per-paper
  fetch. `/paper/search`, `/paper/batch`, `/recommendations` stay out of
  the ingest lane.
- Not a rewrite of the raw-ingest manifest format — it's additive
  (`.diff-manifest.json` sits alongside `.manifest.json`).
- Not a change to the PubTator lane. PubTator3 has its own release cadence
  and no diff endpoint.

## Effort estimate

| Phase | Rough effort |
|---|---|
| 1 — small-dataset dry run | ~1 day |
| 2 — loader protocol + tests + migration | ~3–5 days |
| 3 — citations pilot | ~2 days (+ wall-clock for comparison run) |
| 4 — production cutover + fallback logic | ~2 days |
| 5 — retention rules | ~1 day |
| **Total** | **~10–15 days** of focused work |

Bandwidth savings at steady state: expected 80–95% reduction on monthly
S2 ingest once citations is on diffs (dominant contributor).
