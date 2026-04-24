# Ingest

> Where data comes from and how it gets into the database.

The ingest layer has two source feeds (PubTator3 + Semantic Scholar) and one
warehouse pipeline (the RAG warehouse at `solemd.paper_documents -> sections
-> blocks -> sentences`). Everything downstream -- graph build, RAG retrieval,
benchmarks -- reads from the tables this layer writes.

See also: [`database.md`](database.md) for the authoritative schema,
[`graph-build.md`](graph-build.md) for the DB -> bundle step, and
[`rag.md`](rag.md) for the retrieval runtime that uses these tables.

---

## Data sources

```
  EXTERNAL                                 LOCAL
  --------                                 -----

  PubTator3 (NCBI)  --entities-------->   pubtator.entity_annotations
                    --relations------->   pubtator.relations
                    --BioCXML full text-> paper_documents/sections/blocks

  Semantic Scholar  --release papers-->   solemd.s2_papers_raw
                    --abstracts------->   solemd.s2_papers_raw
                    --citations------->   solemd.s2_paper_reference_metrics_raw
                    --tldrs/embeds---->   mapped-tier paper_text + graph rows
                    --s2orc_v2------->    evidence-tier document spine fallback
```

### Sources at a glance

| Source | Datasets | Pull mode | Bulk size | Loader |
|---|---|---|---|---|
| PubTator3 | entities, relations, BioCXML | release files + targeted PMC BioC API | ~190 GB BioCXML | `apps/worker/app/ingest/sources/pubtator.py`, `apps/worker/app/evidence/` |
| Semantic Scholar | publication-venues, authors, papers, abstracts, citations, deferred tldrs/embeddings/s2orc_v2 | release files; live API only for targeted reconciliation | ~638 GB local release mirror | `apps/worker/app/ingest/sources/semantic_scholar.py`, `apps/worker/app/ingest/writers/s2.py` |

### PubTator3

Pre-extracted entity and relation annotations from NCBI PubTator3, plus
full-text BioCXML for open-access papers. Entity types include Gene, Disease,
Chemical, Species, Mutation, CellLine, SNP. Relation types include treats,
inhibits, associates, positive_correlate, negative_correlate, cotreatment.

**Concept IDs are noisy** -- always validate mention text before using
`concept_id` as an entity rule key. See `feedback_pubtator_concept_quality`.

### Semantic Scholar

**S2 is the canonical source for stable paper metadata, citation aggregates,
TLDRs, and SPECTER2 embeddings.** Current ingest is release-backed under
`apps/worker/app/ingest/`, not the old live-API batch client. The Datasets API
release mirror is the reproducible source for broad corpus work; the live Graph
API is reserved for targeted enrichment or reconciliation where a bounded paper
set and rate limits are acceptable.

Tier ownership:

| Dataset family | Tier |
|---|---|
| `publication-venues`, `papers`, `abstracts`, `citations` aggregates | raw ingest |
| `tldrs`, `embeddings-specter_v2` | mapped rollout |
| `s2orc_v2` | evidence fallback/full-text lane |

Incremental expansion strategy now happens at the corpus/mapped tier: select the
domain corpus from published raw releases, then promote mapped waves into
canonical `solemd.papers`, `paper_text`, embeddings, and evidence inputs.

---

## RAG warehouse ingest pipeline

The RAG warehouse is the retrieval substrate. Its ingest runs in four stages
from the canonical orchestrator.

```
                     +--------------------------+
                     |  ORCHESTRATOR             |
                     |  rag_ingest/orchestrator  |
                     +-------------+-------------+
                                   |
        +--------------------------+--------------------------+
        |                          |                          |
        v                          v                          v
 +-------------+           +---------------+          +---------------+
 |  SOURCE     |           |  PARSER       |          |  WAREHOUSE    |
 |  LOCATOR    | --rows--> |  LAYER        | --row--> |  WRITER       |
 |             |           |               |          |               |
 | s2 + bioc + |           | s2orc_row +   |          | paper_        |
 | overlays    |           | biocxml_doc   |          | documents ++  |
 +-------------+           +---------------+          +-------+-------+
                                                              |
                                                              v
                                                    +-------------------+
                                                    |  CHUNK BACKFILL   |
                                                    |                   |
                                                    | block -> chunk    |
                                                    | chunk -> member   |
                                                    | member -> version |
                                                    +-------------------+
```

### Stage -> code map

| Stage | What it does | Code |
|---|---|---|
| Source locator | Decides which sources exist for each paper (S2, BioCXML archive, API overlay) | `rag_ingest/source_locator.py`, `source_locator_refresh.py`, `source_locator_checkpoint.py` |
| Parser layer | Turns one row of raw source into a normalized `ParsedDocument` | `rag_ingest/source_parsers.py` (`parse_s2orc_row`, `parse_biocxml_document`) |
| Source selection | Picks which source wins per paper (BioCXML beats S2 abstract) | `rag/source_selection.py` |
| Warehouse writer | UPSERTs into paper_documents/sections/blocks/sentences/references/mentions | `rag_ingest/warehouse_writer.py`, `write_repository.py`, `write_contract.py`, `write_batch_builder.py` |
| Chunk backfill | Builds `paper_chunks` + `paper_chunk_members` over the canonical chunk version | `rag_ingest/chunk_backfill.py`, `chunk_backfill_runtime.py`, `chunking.py`, `chunk_policy.py`, `chunk_quality.py` |
| Tracing | Wraps each stage in Langfuse spans | `rag_ingest/ingest_tracing.py` |

All traced spans use `SPAN_*` constants from `engine/app/langfuse_config.py`.
Adding a new span requires registering the constant there first. See
`.claude/CLAUDE.md`.

### Warehouse table contract

The canonical schema is documented in [`database.md`](database.md). In short:

```
paper_documents       one row per (corpus_id, source)
    |
    +--> paper_sections        narrative sections (intro, methods, ...)
    |       +--> paper_blocks  paragraphs / structured blocks
    |               +--> paper_sentences   sentence-level text
    |
    +--> paper_references           outgoing refs (from S2 + BioCXML)
    +--> paper_citation_mentions    in-text citation anchors
    +--> paper_entity_mentions      PubTator entity hits + offsets

paper_chunks          retrieval units, versioned by paper_chunk_versions
    +--> paper_chunk_members       which blocks/sentences make up a chunk
```

### BioCXML overlay pipeline

The BioCXML archive (~190 GB, monthly cadence) is too large to hold in the
warehouse wholesale. The pipeline treats it as an *overlay*:

```
  +-----------------------+
  | 1. Manifest populate  | populate_bioc_archive_manifest.py
  +-----------+-----------+
              |
              v
  +-----------------------+
  | 2. Archive scan       | rag_ingest/bioc_archive_scan.py
  |                       | walks archive tarballs, finds target PMIDs
  +-----------+-----------+
              |
              v
  +-----------------------+
  | 3. Member fetch       | rag_ingest/bioc_member_fetch.py
  |                       | pulls individual members (with prewarm cache)
  +-----------+-----------+
              |
              v
  +-----------------------+
  | 4. Overlay backfill   | rag_ingest/bioc_overlay_backfill.py
  |                       | writes parsed BioCXML into warehouse
  +-----------------------+
```

Related support modules: `bioc_archive_campaign.py`, `bioc_archive_window.py`,
`bioc_archive_manifest.py`, `bioc_archive_ingest.py`, `bioc_target_discovery.py`,
`bioc_member_prewarm.py`.

For targeted small pulls (<500 PMIDs), skip the archive and use the PubTator3
API directly via `rag_ingest/biocxml_api_ingest.py` or `pubtator_api.py`.

---

## Domain filter

Not every S2 paper belongs in the corpus. The domain filter runs DuckDB over
the bulk S2 shards to identify papers that match domain vocabulary.

```
   bulk S2 shards --> DuckDB filter --> domain corpus id list
                      ^                 |
                      |                 v
           vocab_terms.tsv         solemd.corpus
           (3,361 curated          (admitted papers)
            psych/neuro terms)
```

| Piece | Code | Notes |
|---|---|---|
| Vocab loader | `apps/worker/app/corpus/assets.py` | Versions curated vocabulary assets into warehouse tables |
| Selector runtime | `apps/worker/app/corpus/runtime.py` | Builds the selected corpus from published raw releases |
| Venue normalization | `apps/worker/app/ingest/writers/s2.py` | Loads publication venues and normalizes duplicate upstream rows |
| Mapped enrichment | `apps/worker/app/corpus/` | Promotes mapped child-wave surfaces from release-backed raw/stage data |
| Citation derivation | `apps/worker/app/ingest/writers/s2.py` + mapped enrichment | Raw loads broad paper-level citation aggregates; actual `paper_citations` edges are mapped-wave enrichment |

Base admission (which corpus papers become `graph_base_points`) is a separate
decision and is documented in [`graph-build.md`](graph-build.md).

---

## Operator commands

All canonical ingest operators live in `engine/db/scripts/`. Use these
directly -- do not write ad-hoc drivers.

### Routine refreshes

```bash
# Monthly S2 + warehouse refresh
cd engine && uv run python db/scripts/refresh_rag_warehouse.py

# RAG source locator refresh (after new papers arrive)
cd engine && uv run python db/scripts/refresh_rag_source_locator.py

# S2 diff-based refresh campaign
cd engine && uv run python db/scripts/run_s2_refresh_campaign.py
```

### BioCXML overlay operators

```bash
# 1. Populate archive manifest from the BioCXML tarballs
cd engine && uv run python scripts/populate_bioc_archive_manifest.py

# 2. Discover target PMIDs for overlay
cd engine && uv run python db/scripts/discover_bioc_archive_targets.py

# 3. Window-based archive ingest (large campaigns)
cd engine && uv run python db/scripts/ingest_bioc_archive_window.py

# 4. Targeted-PMID archive ingest
cd engine && uv run python db/scripts/ingest_bioc_archive_targets.py

# 5. Campaign-mode (full pipeline)
cd engine && uv run python db/scripts/ingest_bioc_archive_campaign.py

# 6. Prewarm member cache (speeds up fetch)
cd engine && uv run python db/scripts/prewarm_bioc_archive_member_cache.py

# 7. Overlay backfill into warehouse
cd engine && uv run python db/scripts/backfill_bioc_overlays.py
```

Use `backfill_bioc_overlays.py` for BioCXML overlay work -- **never** a
generic refresh script. See `feedback_use_dedicated_ingest_scripts`.

### Targeted API ingest (small batches, no archive)

```bash
# PubTator3 API, by PMID
cd engine && uv run python db/scripts/ingest_biocxml_api.py
```

### Chunk backfill

```bash
# Backfill structural chunks for the canonical chunk version
cd engine && uv run python db/scripts/backfill_structural_chunks.py

# Seed a new default chunk version
cd engine && uv run python db/scripts/seed_default_chunk_version.py
```

### Inspection / audit

```bash
# Inspect current source locator coverage
cd engine && uv run python db/scripts/inspect_rag_source_locator.py

# Inspect warehouse chunk/runtime state
cd engine && uv run python db/scripts/inspect_rag_warehouse_quality.py
cd engine && uv run python db/scripts/inspect_chunk_runtime.py
```

### Sanity checks (not operators)

Prefer running a live query over trusting snapshot numbers in docs:

```sql
-- How many papers in the warehouse?
SELECT count(*) FROM solemd.paper_documents;

-- Coverage by source
SELECT source, count(*)
FROM solemd.paper_documents
GROUP BY source
ORDER BY 2 DESC;

-- Chunk coverage
SELECT count(DISTINCT corpus_id)
FROM solemd.paper_chunks
WHERE chunk_version_id = (SELECT id FROM paper_chunk_versions WHERE is_default);
```

---

## Module map

```
apps/worker/app/ingest/
  sources/semantic_scholar.py  S2 release planning and streaming
  writers/s2.py                S2 COPY writers and raw/evidence staging
  sources/pubtator.py          PT3 release planning and streaming
  writers/pubtator.py          PT3 COPY writers
  source_retention.py          hot-storage retention planning

engine/app/rag_ingest/
  orchestrator.py       Top-level RAG ingest entry
  source_locator.py     Per-paper source decision (with refresh + checkpoint)
  source_parsers.py     parse_s2orc_row, parse_biocxml_document
  warehouse_writer.py   Canonical writer
  write_repository.py   PG write repository
  write_contract.py     Write batch schema
  chunk_backfill.py     Chunk + member + version backfill
  chunking.py           Chunk policy + sentence grouping
  bioc_archive_*.py     BioCXML archive pipeline (see diagram above)
  bioc_member_*.py      Member fetch + prewarm
  bioc_overlay_backfill.py  Overlay writer
  biocxml_api_ingest.py Targeted API ingest (no archive)
  pubtator_api.py       Low-level PubTator3 API client
  ingest_tracing.py     Langfuse span wrapping for ingest stages
```

---

_Last verified against code: 2026-04-24_
