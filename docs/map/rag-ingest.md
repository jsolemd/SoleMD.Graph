# SoleMD.Graph — RAG Ingest Pipeline

> **Scope**: everything that feeds the PostgreSQL warehouse *before* the RAG
> runtime reads from it.
>
> **Use this doc for**: understanding source systems, the parsing pipeline,
> warehouse schema, operator scripts, and scaling decisions.
>
> **Companion docs**:
> - [rag.md](./rag.md) — runtime architecture (reads from the warehouse)
> - [database.md](./database.md) — full schema detail
> - [data.md](./data.md) — broader corpus data flow
> - [../plans/rag-runtime-direction-2026-04.md](../plans/rag-runtime-direction-2026-04.md) —
>   warehouse scaling phases and runtime plan

---

## Source Systems

| Source | What it provides | Coverage | Access method |
|--------|------------------|----------|---------------|
| **S2 metadata** | Title, abstract, TLDR, venue, year, citation counts, SPECTER2 embeddings | ~14M papers (full universe) | Bulk download, `solemd.papers` |
| **S2ORC full text** | Structured sections, paragraphs, inline citations, bibliography | ~6M papers (open-access PMC subset) | Local shards (`s2orc_v2/` directory) |
| **PubTator BioCXML archives** | Full text (PMC) or abstract (PubMed-only), entity annotations with offsets, relations | ~36M PubMed abstracts + ~6M PMC full text | Local archives (`BioCXML.0-9.tar.gz`, ~195 GB total) |
| **PubTator3 REST API** | Same BioCXML format as archives, per-PMID or batched | Same coverage as archives | `GET pubtator3-api/publications/export/biocxml?pmids=...&full=true` |
| **PubTator annotations** | Entity mentions, concept IDs, relation triples | ~36M papers | Local bulk files + `pubtator.*` tables |

---

## Pipeline Diagram

```text
                    EXTERNAL SOURCES
  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ S2ORC shards │  │ BioCXML archives │  │ PubTator3 API    │
  │ (local)      │  │ (195 GB local)   │  │ (REST, 3 req/s)  │
  └──────┬───────┘  └───────┬──────────┘  └────────┬─────────┘
         │                  │                      │
         v                  v                      v
  ┌──────────────────────────────────────────────────────────┐
  │                   SOURCE LOCATOR                         │
  │  SQLite sidecars: map corpus_id → source location        │
  │  s2orc_v2.corpus_locator.sqlite                         │
  │  biocxml.corpus_locator.sqlite                          │
  │  biocxml.archive_manifest.sqlite (document_id → tar pos)│
  └──────────────────────────┬───────────────────────────────┘
                             │
                             v
  ┌──────────────────────────────────────────────────────────┐
  │                     PARSER LAYER                          │
  │                                                          │
  │  parse_s2orc_row()          → ParsedPaperSource          │
  │  parse_biocxml_document()   → ParsedPaperSource          │
  │                                                          │
  │  Both emit: document, sections, blocks, sentences,       │
  │             references, citations, entity mentions        │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             v
  ┌──────────────────────────────────────────────────────────┐
  │                  SOURCE SELECTION                         │
  │                                                          │
  │  build_grounding_source_plan() → GroundingSourcePlan     │
  │  Picks primary source, merges annotation overlays        │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             v
  ┌──────────────────────────────────────────────────────────┐
  │               WAREHOUSE WRITER                           │
  │                                                          │
  │  build_write_batch_from_grounding_plan()                 │
  │  RagWarehouseWriter.ingest_sources() / ingest_source_groups() │
  │  PostgresRagWriteRepository.apply_write_batch()          │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             v
  ┌──────────────────────────────────────────────────────────┐
  │               POSTGRESQL WAREHOUSE                       │
  │                                                          │
  │  paper_documents → paper_document_sources                │
  │  paper_sections → paper_blocks → paper_sentences         │
  │  paper_citation_mentions, paper_entity_mentions           │
  │  paper_references                                        │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             v
  ┌──────────────────────────────────────────────────────────┐
  │               CHUNK BACKFILL                             │
  │                                                          │
  │  assemble_structural_chunks() → paper_chunks,            │
  │  paper_chunk_members, paper_chunk_versions               │
  │  backfill_structural_chunks.py / run_chunk_backfill()    │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             v
  ┌──────────────────────────────────────────────────────────┐
  │               RAG RUNTIME READS                          │
  │  (see rag.md)                                            │
  └──────────────────────────────────────────────────────────┘
```

---

## PostgreSQL Warehouse Schema

### Canonical document structure

| Table | Role | Populated by |
|-------|------|-------------|
| `solemd.paper_documents` | Root document row per `corpus_id` | Warehouse writer |
| `solemd.paper_document_sources` | Source provenance (which parser, which source system) | Warehouse writer |
| `solemd.paper_sections` | Hierarchical section tree (title, abstract, methods, ...) | Warehouse writer |
| `solemd.paper_blocks` | Paragraph/table/list spans within sections | Warehouse writer |
| `solemd.paper_sentences` | Sentence-level segmentation within blocks | Warehouse writer |
| `solemd.paper_references` | Bibliography entries with optional corpus matching | Warehouse writer |
| `solemd.paper_citation_mentions` | In-text citation anchors aligned to blocks | Warehouse writer |
| `solemd.paper_entity_mentions` | Entity annotations with concept IDs and offsets | Warehouse writer |

### Derived serving structure

| Table | Role | Populated by |
|-------|------|-------------|
| `solemd.paper_chunk_versions` | Declares the active chunk serving policy | Chunk seed script |
| `solemd.paper_chunks` | Derived serving chunks from blocks/sentences | Chunk backfill |
| `solemd.paper_chunk_members` | Links chunks back to source blocks/sentences | Chunk backfill |

---

## Source Coverage Matrix

| Capability | S2 metadata | S2ORC full text | PubTator BioCXML | PubTator3 API |
|-----------|------------|-----------------|-------------------|---------------|
| Title | yes | yes | yes | yes |
| Abstract | yes | yes | yes (PubMed) | yes (PubMed) |
| Full text (sections, paragraphs) | no | yes (PMC) | yes (PMC) | yes (PMC) |
| SPECTER2 embeddings | yes | no | no | no |
| Entity annotations w/ offsets | no | no | yes | yes |
| Relation triples | no | no | yes | yes |
| Inline citations w/ offsets | no | yes | partial | partial |
| Bibliography entries | no | yes | no | no |
| Sentence segmentation | no | no | no (done by parser) | no (done by parser) |

---

## Parser Functions

### `parse_s2orc_row()`

Location: `engine/app/rag_ingest/source_parsers.py`

Parses S2ORC JSON structures into `ParsedPaperSource`.  Produces full
section/block/sentence structure with inline citations and bibliography.
Best source for PMC full-text papers when S2ORC coverage exists.

### `parse_biocxml_document()`

Location: `engine/app/rag_ingest/source_parsers.py`

Parses BioCXML XML (from archives or API) into `ParsedPaperSource`.
Produces passage-level blocks with sentence segmentation and entity
annotations.  Works for both full-text PMC papers and abstract-only
PubMed papers.

Both parsers emit the same `ParsedPaperSource` dataclass, so the warehouse
writer is source-agnostic.

---

## Ingest Operators

### Targeted ingest (API path — <1000 papers)

| Script | Purpose | Source |
|--------|---------|--------|
| `db/scripts/ingest_biocxml_api.py` | Fetch BioCXML from PubTator3 API → parse → warehouse | PubTator3 REST API |

```bash
uv run python -m db.scripts.ingest_biocxml_api \
  --corpus-ids-file data/target_corpus_ids.txt \
  --parser-version parser-v4 \
  --chunk-backfill
```

### Archive-based ingest (bulk — >1000 papers)

| Script | Purpose | Source |
|--------|---------|--------|
| `db/scripts/ingest_bioc_archive_targets.py` | Discover + ingest from one BioCXML archive | Local BioCXML archives |
| `db/scripts/ingest_bioc_archive_campaign.py` | Multi-window campaign across one archive | Local BioCXML archives |
| `db/scripts/backfill_bioc_overlays.py` | Add BioCXML as secondary source on existing papers | Local BioCXML archives |
| `db/scripts/refresh_rag_warehouse.py` | Full multi-source pipeline (S2ORC first, BioCXML fallback) | S2ORC + BioCXML |
| `db/scripts/run_s2_refresh_campaign.py` | Bounded S2ORC campaign | S2ORC shards |

### Chunk and index operators

| Script | Purpose |
|--------|---------|
| `db/scripts/backfill_structural_chunks.py` | Generate serving chunks from warehouse blocks/sentences |
| `db/scripts/seed_default_chunk_version.py` | Declare chunk serving policy version |
| `db/scripts/refresh_rag_source_locator.py` | Rebuild SQLite source locator sidecars |

### Inspection operators

| Script | Purpose |
|--------|---------|
| `db/scripts/inspect_rag_warehouse_quality.py` | Structural quality audit |
| `db/scripts/inspect_chunk_runtime.py` | Chunk grounding readiness |
| `db/scripts/inspect_rag_source_locator.py` | Source locator coverage |

---

## Current Warehouse State (2026-04-04)

| Table | Rows |
|-------|------|
| `paper_documents` | 624 |
| `paper_document_sources` | 624 |
| `paper_sections` | 4,331 |
| `paper_blocks` | 9,769 |
| `paper_sentences` | 48,121 |
| `paper_chunks` | 8,942 |
| `paper_chunk_members` | 46,534 |
| `paper_citation_mentions` | 16,463 |
| `paper_entity_mentions` | 6,565 |

Universe: 14,060,679 corpus papers (all with PMIDs).
Active graph: 2,452,643 papers in current release.

---

## Scaling Numbers

| Tier | Papers | Warehouse est. | Primary source | Access method |
|------|--------|----------------|----------------|---------------|
| Current | 624 | ~50 MB | S2ORC (596) + BioCXML (28) | Local shards + API |
| Graph papers | ~2.5M | ~100 GB | PubTator3 API (abstracts) + BioCXML archives (PMC full text) | API + local archives |
| Full universe | 14M | ~500 GB | API batches (~13h at 3 req/s) + BioCXML archives | API + local archives |
| Full PubTator | 36M | ~1 TB+ | BioCXML archives only | Local archives |

---

## Storage Architecture Decisions

1. **PubTator3 API for targeted ingest (<1000 papers)**: <1s per batch of 100
   PMIDs.  No archive decompression needed.  Returns same BioCXML format as
   archives.

2. **Local BioCXML archives for bulk full-text ingest**: The 195 GB archive
   set has PMC full text that the API also serves, but archive access avoids
   API rate limits for large campaigns.

3. **Archive manifest for random access**: SQLite sidecar indexes document_id
   → tar position so individual papers can be extracted without sequential
   decompression.  Future: `ratarmount` for filesystem-like archive access.

4. **Never sequential-scan for small batches**: A full archive scan takes 70+
   minutes per ~20 GB archive.  Always use the manifest or API for targeted
   ingest.

5. **US hosting for production**: 500 GB managed PostgreSQL on US
   infrastructure.  Monthly refresh cycle with incremental API-based ingest
   between refreshes.
