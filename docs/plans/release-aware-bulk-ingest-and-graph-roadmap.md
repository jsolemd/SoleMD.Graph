# Release-Aware Bulk Ingest and Graph Roadmap

Status: Active working plan  
Project: `SoleMD.Graph`  
Scope: local bulk data mirror, release-aware ingest, graph build, monthly refresh

## Why This Exists

The project is moving from a mixed "bulk + API metadata" posture toward a cleaner long-term model:

- keep Semantic Scholar and PubTator raw releases on the `E:` drive
- make raw storage release-aware and reproducible
- ingest as much metadata as possible from local bulk files
- reserve the Semantic Scholar API primarily for SPECTER2 embeddings and targeted fallback fields
- build the mapped graph and bundles from local canonical tables, not ad hoc runtime joins

This document is the implementation checklist for that shift.

## Current State

- Raw bulk data has been moved to `E:` and exposed to the repo via symlinks.
- Semantic Scholar has been cut over to a release-aware `2026-03-10` layout with manifests.
- PubTator has now been cut over to release-aware storage for release `2026-03-21`,
  with `raw/` pointing at the active release and manifests written for both
  annotations and BioCXML.
- Corpus policy is frozen.
- Metadata enrichment is complete for the current graph tier.
- Semantic Scholar `s2orc_v2` is fully downloaded and release-packaged, but its
  schema audit and ingest design remain deferred to later document / RAG work.
- Bulk citations ingest is now moving from design into implementation, with the
  local `citations` dataset becoming the canonical edge source.
- Bulk citations ingest is now resumable:
  - per-batch commits land directly in `solemd.citations`
  - `solemd.bulk_citation_ingest_batches` checkpoints shard-batch progress
  - completed reruns now short-circuit instead of rebuilding the domain-ID join state
  - synthetic canary validation proved checkpointed resume behavior
- The normalized PostgreSQL backbone already exists:
  - `solemd.corpus`
  - `solemd.papers`
  - `solemd.publication_venues`
  - `solemd.authors`
  - `solemd.paper_authors`
  - `solemd.author_affiliations`
  - `solemd.paper_assets`
  - `solemd.paper_references`
  - `solemd.citations`
  - `pubtator.entity_annotations`
  - `pubtator.relations`
- The real offline graph pipeline now exists and is benchmarked through `1M`
  papers in the dedicated GPU graph container:
  - RAPIDS `cuml.accel` PCA + UMAP layout
  - cuGraph Leiden clustering
  - lexical cluster labeling
  - PostgreSQL graph run writes
  - widened Parquet bundle export on canaries
  - the remaining work is full-run operationalization and linked export after
    bulk citations completes
- A canary offline graph build now works end-to-end on small samples:
  - UMAP layout
  - Leiden clustering
  - lexical cluster labels
  - graph run writes
  - bundle export
  - manifest-backed widened bundle tables:
    - `corpus_points`
    - `corpus_links`
    - `corpus_clusters`
    - `corpus_documents`
    - `corpus_cluster_exemplars`
- The remaining graph work is productionization for the full mapped corpus, not first-pass feasibility.
- The graph build baseline is now GPU-native inside the dedicated graph container:
  - local engine env still retains CPU fallback for development safety
  - the graph container now sets:
    - `GRAPH_LAYOUT_BACKEND=gpu`
    - `GRAPH_CLUSTER_BACKEND=gpu`
  - RAPIDS `cuml.accel` drives PCA + UMAP layout in that container
  - cuGraph Leiden is now the intended baseline clustering path in that container
  - a real in-container graph canary now succeeds with:
    - `layout_backend: "cuml_accel"`
    - `cluster_backend: "cugraph_leiden"`
  - CPU fallback remains available outside the container or when explicitly requested
  - GPU readiness should be treated as a two-part contract:
    - hardware visible and healthy (`nvidia-smi`)
    - RAPIDS Python stack installed in the engine environment
  - preferred environment strategy:
    - keep the NVIDIA driver on the Windows host
    - run RAPIDS in the Linux/container environment that executes the graph build
    - prefer a dedicated GPU graph-build container or service over ad hoc installation into the shared day-to-day devcontainer

## Core Decisions

### 1. Raw bulk data becomes the default source of truth for non-embedding metadata

Target posture:

- `papers` bulk dataset -> canonical paper metadata
- `abstracts` bulk dataset -> abstracts
- `tldrs` bulk dataset -> TLDRs
- `citations` bulk dataset -> references/citation edges
- `paper-ids` bulk dataset -> identifier resolution and crosswalks
- `authors` bulk dataset -> author and authorship review after schema audit
- `s2orc-v2` -> full-text / chunk / document substrate later
- `PubTator3` tabular + BioCXML -> biomedical entities, relations, and later richer mention/document context

API posture:

- Semantic Scholar API should remain the main source for `embedding.specter_v2`
- API should be retained as a targeted fallback for fields that are not present or not well normalized in bulk data after audit

### 2. Raw storage must be release-aware

Current "raw/<dataset>" storage is good enough for one-off downloads but not safe for monthly refreshes.

Target storage layout:

```text
/mnt/e/SoleMD.Graph/data/
  semantic-scholar/
    releases/
      2026-03-10/
        papers/
        abstracts/
        tldrs/
        citations/
        authors/
        paper-ids/
        s2orc-v2/
        manifests/
  pubtator/
    releases/
      2026-03-10/
        bioconcepts2pubtator3.gz
        relation2pubtator3.gz
        chemical2pubtator3.gz
        disease2pubtator3.gz
        gene2pubtator3.gz
        mutation2pubtator3.gz
        species2pubtator3.gz
        cellline2pubtator3.gz
        biocxml/
        manifests/
  graph/
    bundles/
    manifests/
    logs/
```

Compatibility path:

- repo-local `data/semantic-scholar/raw` and `data/pubtator/raw` may remain symlinks
- those symlinks should point to the active release, not to an undifferentiated long-lived `raw/` tree

### 3. Every release needs a manifest

Each downloaded release should have machine-readable manifests capturing:

- release id
- dataset name
- source URL / endpoint
- shard count
- expected file names
- file sizes
- checksums if available
- local verification timestamps
- downloader version / command used

This should support:

- re-verification
- monthly refreshes
- auditability
- reproducible ingest

## Workstreams

## Workstream 1: Harden Raw Download and Storage

Goal: make `E:`-drive bulk storage safe, optimized, and monthly-refreshable.

Tasks:

- replace non-versioned `raw/<dataset>` assumptions with `releases/<release>/<dataset>`
- update download scripts to write into release-specific directories
- add release manifests for every downloaded dataset
- add an "active release" symlink or config pointer for the engine
- standardize verification output
- add resume-safe / retry-safe download metadata
- review use of `aria2c` or equivalent parallel HTTP download tooling for shard downloads
- keep single API manifest lookup to Semantic Scholar, then parallelize only the CDN downloads

Definition of done:

- a new release can be downloaded without overwriting or mixing with the current release
- existing release contents can be re-verified without network calls
- switching active release is a metadata/config change, not a file move

## Workstream 2: Audit the Structure of Every Downloaded Dataset

Goal: decide exactly which local bulk files populate which database tables.

Datasets to audit:

- Semantic Scholar `papers`
- Semantic Scholar `abstracts`
- Semantic Scholar `tldrs`
- Semantic Scholar `citations`
- Semantic Scholar `authors`
- Semantic Scholar `paper-ids`
- Semantic Scholar `s2orc-v2`
- PubTator annotation files
- PubTator BioCXML

For each dataset, record:

- file format
- row schema
- primary identifiers
- whether rows are one-paper, one-edge, one-author, or one-document
- whether the dataset is global or graph-tier scoped
- which canonical PostgreSQL table(s) it should populate
- whether it supersedes or complements current API enrichment

Definition of done:

- there is a concrete "dataset -> tables/columns" map
- we know which fields should come from bulk vs API
- PubTator has its own companion audit tracked in
  [pubtator-bulk-dataset-audit.md](/home/workbench/SoleMD/SoleMD.Graph/docs/plans/pubtator-bulk-dataset-audit.md)
- `s2orc_v2` has its own document/RAG follow-up tracked under Workstream 7

## Workstream 3: Shift Metadata Ingest Toward Local Bulk Sources

Goal: reduce reliance on per-paper API enrichment for metadata that already exists in downloaded datasets.

Target mapping:

- `papers` -> `solemd.corpus`, base columns in `solemd.papers`
- `abstracts` -> `solemd.papers.abstract`
- `tldrs` -> `solemd.papers.tldr`
- `paper-ids` -> identifier normalization / external id reconciliation
- `citations` -> canonical `solemd.citations`
- `authors` -> evaluate against `solemd.authors`, `solemd.paper_authors`, `solemd.author_affiliations`
- `s2orc-v2` -> later `paper_documents` / `paper_chunks` / full-text tables

Expected outcome:

- local bulk files become the primary metadata substrate
- API calls become narrower and cheaper
- monthly refreshes become more deterministic

Open question to resolve during audit:

- whether the bulk `authors` dataset is sufficient to replace current author API enrichment, or whether it should coexist with API-authored snapshots

## Workstream 4: Implement Bulk Citations / References Ingest

Goal: stop depending on sparse API reference arrays for graph edges.

Tasks:

- design the canonical ingest from the Semantic Scholar `citations` bulk dataset
- stage and normalize identifiers
- populate `solemd.citations` directly from bulk citations
- keep `solemd.paper_references` as the richer bibliography path until we decide on a later bulk backfill
- add release-aware tracking for citation ingest
- add verification and coverage reports
- keep batch commits small enough to survive multi-hour runs and resume from checkpoints after interruption

This should become the canonical edge substrate for:

- graph links
- citation overlays
- geo citation links

Important design note:

- the bulk `citations` dataset is rich enough to become the canonical `solemd.citations` source
- `paper_references` should remain the richer bibliography path until we decide whether to backfill it from bulk papers / paper-ids / other metadata joins
- the implementation should optimize for staged DuckDB filtering plus PostgreSQL `COPY`, not Python row-by-row inserts
- contexts, intents, and influence metadata should be preserved rather than collapsed away, because they expand what the frontend and later analytical layers can do
- current implementation status:
  - a batched DuckDB -> PostgreSQL `COPY` loader now exists
  - it uses release manifests, disk-backed temp staging, and bounded shard batches
  - a real dry-run canary on the local `2026-03-10` release succeeded:
    - `2` shards (`~2 GB`) -> `2,284,340` domain-domain citation edges
    - `elapsed_seconds: 97.6`
    - no DuckDB OOM
  - larger-batch throughput tuning is still in progress before the first full load

## Workstream 5: Build the Real Graph Pipeline

Goal: move from graph scaffolding to the first mapped graph.

Implementation targets:

- apply and possibly extend `009_create_graph_table.sql` before first real run
- productionize `engine/app/graph/layout.py`
- productionize `engine/app/graph/clusters.py`
- productionize `engine/app/graph/labels.py`
- productionize `engine/app/graph/export_bundle.py`
- add graph-run QA and publish-current workflow
- add scalable execution strategy for the full `~2.5M` embedding cohort

Modeling decisions:

- clusters should be computed offline, not in Cosmograph
- use high-dimensional embedding space for clustering
- use 2D UMAP only for `x/y` layout
- persist cluster IDs and labels as canonical graph artifacts
- widen the bundle contract when backend data already exists; do not clip point,
  document, or link metadata down to the older minimal frontend shape

Bundle contract decisions:

- keep Apache Parquet as the on-disk bundle format and keep the `.parquet`
  naming; it is the standard columnar file format we want here
- use a tiered export contract instead of pushing every heavy payload into the
  always-hot point table:
  - hot:
    - `corpus_points.parquet`
    - immediate render/filter metadata
  - warm:
    - `corpus_documents.parquet`
    - `corpus_clusters.parquet`
    - `corpus_cluster_exemplars.parquet`
    - `corpus_links.parquet`
  - cold:
    - fetched on demand via detail/data services
    - full text
    - PDF mirrors / signed asset paths
    - full PubTator annotation lists
    - full PubTator relation lists
    - large citation-context payloads

Filter-first metadata policy:

- include rich filterable metadata in the bundle up front, especially:
  - identifiers: DOI / PMID / PMCID / S2 paper id
  - journal, publication venue, year
  - citation / reference counts
  - author count
  - OA flags, PDF access metadata, text availability
  - cluster id / label / probability / outlier score
  - entity / relation counts
  - compact concept summaries suitable for fast faceting
- do not force the UI to fetch basic filter state paper-by-paper

PubTator export policy:

- include compact PubTator-derived paper summaries in the bundle, not just raw counts
- target compact fields such as:
  - top canonical entity ids / labels per paper
  - semantic-group summary
  - organ-system summary
  - major relation-category summary
- keep the full annotation and relation payloads behind fetch paths for detail
  drilldown instead of inflating the hot point layer

Current implementation status:

- done:
  - offline UMAP implementation exists
  - offline Leiden implementation exists
  - lexical cluster labeling exists
  - canary graph builds succeed
  - canary graph bundle export succeeds
  - graph input loading now uses a temp memmap-backed embedding array instead of
    hauling the full paper payload into Python objects
  - clustering now runs on the full preprocessed embedding space
  - UMAP is now treated only as the 2D layout layer
  - cluster label sampling now happens from PostgreSQL after graph points are
    written, rather than carrying all titles/TLDRs in memory
- still to do:
  - make the UMAP/clustering path efficient enough for the full mapped corpus
  - run and record the staged GPU benchmark ladder while citations ingest continues:
    - `25k`
    - `100k`
    - `500k`
    - `1M`
  - use those benchmark results to set the first full-run execution policy
  - add macro/micro clustering if needed
  - validate bundle export end-to-end on a real non-trivial run

Current benchmark policy:

- while bulk citations is still running, only run `--skip-export` subset builds
- do not publish a `current` graph during parallel heavy ingest
- wait for citations completion before the first real linked full-graph export

Recorded benchmark results:

- `25k` papers, GPU container, `--skip-export`
  - `layout_backend: "cuml_accel"`
  - `cluster_backend: "cugraph_leiden"`
  - `cluster_count: 13`
  - wall time: `25.17s`
- `100k` papers, GPU container, `--skip-export`
  - `layout_backend: "cuml_accel"`
  - `cluster_backend: "cugraph_leiden"`
  - `cluster_count: 16`
  - wall time: `46.60s`
- `500k` papers, GPU container, `--skip-export`
  - `layout_backend: "cuml_accel"`
  - `cluster_backend: "cugraph_leiden"`
  - `cluster_count: 35`
  - wall time: `160.71s`
- `1M` papers, GPU container, `--skip-export`
  - `graph_run_id: "3699cf08-a0ef-4cf0-8d9c-2719874aaeba"`
  - `layout_backend: "cuml_accel"`
  - `cluster_backend: "cugraph_leiden"`
  - `cluster_count: 37`
  - wall time: `280.67s`

Interpretation:

- the GPU graph path is no longer theoretical
- the current scaling curve is good enough to justify a first full point-only run
  once the system is not competing with the overnight bulk citations ingest
- the remaining risk is operational contention on PostgreSQL / disk / temp space,
  not algorithmic feasibility

Expected stored outputs:

- mapped paper coordinates
- macro and micro cluster assignments if needed
- cluster centroids
- exemplars
- labels

## Workstream 6: Full Metadata UI Expansion

Goal: ensure the frontend eventually uses the richer backend and bundle metadata rather than hiding it behind a minimal paper contract.

Tasks:

- surface richer paper metadata in the detail panel:
  - `text_availability`
  - OA state / PDF access / license
  - publication venue / provenance
  - richer author metadata
- expose citation-edge richness where useful:
  - context counts
  - influence
  - intents
- expose richer PubTator-derived filtering and exploration:
  - compact entity summaries
  - semantic groups
  - organ systems
  - major relation categories
- add cluster and exemplar metadata to the UI where it improves navigation
- make the frontend resilient to richer bundle schemas instead of assuming the older thin payload

Important note:

- this should not block the first mapped graph
- but the backend contract should continue to stay richer than the current UI until the UI catches up

## Workstream 7: Bundle Ownership and Output Cleanup

Goal: make Graph, not App, own the bundle lifecycle.

Tasks:

- move bundle output to a Graph-owned root
- stop defaulting to old `SoleMD.App` bundle paths
- standardize bundle manifest structure
- track bundle provenance:
  - source release ids
  - graph run id
  - row counts
  - checksum
  - export parameters

Expected output layout:

```text
/mnt/e/SoleMD.Graph/graph/bundles/<graph_run_id>/
  manifest.json
  corpus_points.parquet
  corpus_links.parquet
  corpus_clusters.parquet
  corpus_documents.parquet
  corpus_cluster_exemplars.parquet
  geo_points.parquet
  geo_links.parquet
  geo_citation_links.parquet
  graph_author_geo.parquet
```

## Workstream 8: Full-Text / RAG Pipeline Later

Goal: defer full-text ingestion until after the first mapped graph is stable.

Tasks to track now:

- audit `s2orc_v2` field structure in depth
- design `paper_documents` and `paper_chunks` tables
- decide how S2ORC text and bibliography annotations connect to citation contexts
- design the later RAG pipeline around local full text rather than API fetches
- allow schema audit, retrieval design, and chunking experiments to proceed in
  parallel with bulk citations ingest and graph benchmarking, because they do
  not overlap the current citation upsert critical path

This is explicitly deferred and does not block:

- bulk metadata ingest
- citation-edge ingest
- first mapped graph
- richer metadata-driven filtering in the initial graph bundle

Parallel-safe preparation work:

- inspect `s2orc_v2` row/document structure
- define retrieval-unit boundaries
- evaluate chunking strategy and metadata retention
- design table contracts for `paper_documents`, `paper_chunks`, and later chunk
  embeddings
- prepare fetch paths for full-text / chunk drilldown without coupling them to
  the first graph bundle

## Workstream 9: Monthly Refresh Contract

Goal: make refreshes deterministic.

Monthly sequence:

1. download new Semantic Scholar and PubTator releases into new release directories
2. verify and materialize manifests
3. switch the active release pointer
4. rerun bulk ingest into canonical tables
5. rerun frozen promotion policy
6. rerun embedding enrichment only where required
7. rerun graph build
8. publish a new bundle

This requires:

- release-aware raw storage
- release-aware ingest sentinels
- graph-run provenance

## Immediate Next Steps

These are the next concrete tasks after metadata enrichment completion:

1. finish and validate bulk citations ingest from the local `citations` release
2. verify bulk citations coverage/counts and clear the first linked graph export path
3. audit the structure of each downloaded S2 and PubTator dataset
4. decide the canonical bulk-vs-API mapping for each field/table
5. run the first full GPU point-only graph build, then the first linked export after citations is complete
6. move bundle ownership fully into `SoleMD.Graph`
7. keep full metadata UI expansion on the roadmap while not blocking the first mapped graph
8. audit `s2orc_v2` and design the later full-text / RAG ingest

## Notes

- The current API metadata enrichment run is still useful and should not be discarded.
- The long-term plan is not "API for everything." The long-term plan is "bulk for stable metadata, API for embeddings and targeted fallback."
- `s2orc-v2` is now locally available and should be audited next for later document/RAG work; it still does not block the first mapped graph.
- PubTator raw storage is now release-aware; the remaining PubTator work is the BioCXML structure audit and later richer ingest design.
- The later RAG pipeline should be built on local full-text assets, not repeated API fetches.
