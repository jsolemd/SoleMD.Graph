# SoleMD.Graph — RAG

> **Scope**: current runtime architecture for evidence retrieval, ranking,
> answer assembly, and graph grounding.
>
> **Use this doc for**: the stable high-level map of what is live now and the
> grounded-generation direction the architecture is designed to support.
>
> **Note**: this file now also carries the former `rag-info.md` contract and
> implementation-summary content.
>
> **Companion docs**:
> - [database.md](./database.md) — full schema detail for `solemd.*` and
>   `pubtator.*`
> - [architecture.md](./architecture.md) — broader system architecture
> - [data.md](./data.md) — ingestion and corpus data flow

---

## Current State

| Area | Current state |
|------|---------------|
| Retrieval unit | **Paper-first**. The runtime ranks papers, not free-floating chunks. |
| Grounding unit | **Chunk-backed cited spans when coverage exists**; otherwise the system returns paper-grounded extractive evidence only. |
| Query routing | `title_lookup`, `passage_lookup`, and `general` profiles shape which lanes run and how precision is favored. |
| Corpus boundary | All retrieval is release-scoped through the active `graph_release_id` and `solemd.graph_points`. |
| Scope control | Optional `selection_only` mode limits retrieval to selected graph papers resolved inside the current release. |
| Current answer mode | `baseline-extractive-v1` from ranked evidence bundles. |
| Generative direction | Planned: grounded generative synthesis over cited spans and inline citations, built on the same paper-first retrieval and warehouse contracts. |
| Dense retrieval | SPECTER2 ad-hoc query encoding against `solemd.papers.embedding`. |
| Optional reranking | Bounded MedCPT reranking for clinician-intent passage queries only. |
| Chunk retrieval | Live only as **chunk lexical** search over `solemd.paper_chunks`; dense chunk ANN is not in the live request path. |
| Frontend boundary | The backend returns typed evidence and graph signals; DuckDB resolves graph refs locally for Cosmograph. |

---

## High-Level Architecture

```text
+-----------------------------------------------------------------------+
| BROWSER                                                               |
|                                                                       |
| Graph UI / Ask panel / selected paper or selection scope              |
| Response panel renders answer, bundles, citations, and graph signals  |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
| NEXT.JS ADAPTER                                                      |
|                                                                       |
| app/api/evidence/chat/stream.ts                                       |
| lib/engine/graph-rag.ts -> lib/engine/rag.ts                          |
|                                                                       |
| Builds one typed engine request from graph context and user query      |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
| FASTAPI                                                               |
|                                                                       |
| POST /api/v1/evidence/search -> RagService.search()                   |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
| RAG RUNTIME                                                            |
|                                                                       |
| 1. build_query() -> normalize query, infer retrieval profile          |
| 2. build_search_plan() -> choose precise vs broad retrieval lanes     |
| 3. retrieve_search_state() -> collect bounded candidate papers        |
| 4. finalize_search_result() -> enrich, rank, bundle, signal, answer   |
| 5. build_grounded_answer_from_runtime() if warehouse coverage exists  |
+------------------------------+--------------------+-------------------+
                               |                    |
                               v                    v
+------------------------------+--+   +------------+-------------------+
| RELEASE-SCOPED RETRIEVAL DB     |   | CANONICAL WAREHOUSE            |
|                                 |   |                                |
| graph_runs / graph_points       |   | paper_documents                |
| papers / citations              |   | paper_document_sources         |
| paper_references / paper_assets |   | paper_sections                 |
| paper_entity_mentions           |   | paper_blocks / paper_sentences |
| pubtator.relations              |   | paper_citation_mentions        |
| paper_chunks (chunk lexical)    |   | paper_chunks / members         |
+------------------------------+--+   +------------+-------------------+
                               |
                               v
+------------------------------+----------------------------------------+
| TYPED RESPONSE                                                         |
|                                                                       |
| answer | answer_corpus_ids | grounded_answer? | evidence_bundles[]    |
| graph_signals[] | retrieval_channels[] | evidence_flags{}             |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
| BROWSER GRAPH RESOLUTION                                                |
|                                                                       |
| DuckDB resolves corpus ids / graph refs against local bundle state     |
| Cosmograph highlights mapped papers; non-mapped evidence stays in UI   |
+-----------------------------------------------------------------------+
```

---

## Stable Runtime Boundaries

- The backend decides which papers matter. The browser does not retrieve or rank evidence on its own.
- Chunk search is a retrieval lane, not the canonical result identity. The result spine stays paper-level.
- Grounded answers are coverage-gated. If the requested answer papers are not covered by the warehouse chunk runtime, the system falls back to paper-grounded extractive output.
- Selection context is first-class. A selected paper or `selection_only` scope can change routing, candidate preservation, and ranking.
- The same grounding contract is intended to support later generative synthesis: retrieve and rank papers first, then generate only from source-traceable cited spans rather than from unconstrained model recall.
- DuckDB is the local graph resolver, not the evidence retriever. It maps backend-selected papers back onto the current graph bundle.

---

## Runtime Flow

1. The browser sends a typed request with `graph_release_id`, query text, and optional graph context such as a selected paper or selection scope.
2. The engine normalizes the query, infers a retrieval profile, and builds a search plan that decides how much precision or expansion to allow.
3. Retrieval runs across bounded lanes: lexical, chunk lexical, dense query, entity, relation, citation-context expansion, and selected-paper semantic neighbors.
4. Candidate papers are merged, reranked, enriched with citations, entities, relations, references, and assets, then packaged into evidence bundles and graph signals.
5. The live answer path builds a paper-grounded extractive answer from the top bundles.
6. If chunk runtime coverage is complete for the answer-linked papers, the engine also returns a `grounded_answer` with inline citation anchors and cited-span packets.
7. That grounded packet layer is the intended substrate for later generative answer synthesis, so generation can be added without changing release scoping, retrieval identity, or graph resolution.
8. The browser resolves returned corpus ids back into local graph rows and lights the mapped subset on Cosmograph.

---

## Generative Direction

The live runtime is still extractive, but the architecture is intentionally
moving toward **grounded generation**, not away from grounding.

- Evidence selection stays paper-first and release-scoped.
- Generation should happen only after ranking and span grounding are complete.
- `grounded_answer`, inline citation anchors, and cited-span packets are the
  contract that makes later generation source-traceable.
- The intended upgrade is not "let the model answer freely." It is "let the
  model compose an answer from bounded, cited, warehouse-backed evidence."

---

## Important Runtime Tables

| Table | Why it matters in the live path | Notes |
|------|----------------------------------|-------|
| `solemd.graph_runs` | Resolves `graph_release_id` to one concrete graph run | Supports `current`, explicit run ids, and bundle checksums |
| `solemd.graph_points` | Defines release membership for retrieval and graph resolution | Every live query is scoped through the resolved run |
| `solemd.papers` | Core paper metadata, paper FTS, and dense embeddings | Title, abstract, TLDR, venue, counts, `embedding` |
| `solemd.citations` | Citation-context recall and bounded neighbor expansion | Boost-only lane, not a standalone result spine |
| `solemd.paper_entity_mentions` | Entity seed recall and post-rank enrichment | Also anchors species and concept-level signals |
| `pubtator.relations` | Relation seed recall and relation enrichment | Supplies normalized subject/object relation matching |
| `solemd.paper_references` | Bibliography for returned evidence bundles | Used after ranking on the top result set |
| `solemd.paper_assets` | Full-text and attached asset metadata | Returned with bundles when available |

## Important Warehouse Tables

| Table | Role in grounding and chunk runtime | Notes |
|------|--------------------------------------|-------|
| `solemd.paper_documents` | Canonical document entry row per `corpus_id` | Warehouse root |
| `solemd.paper_document_sources` | Source provenance and primary text source selection | Tracks which source owns the canonical text spine |
| `solemd.paper_sections` | Hierarchical section tree | Title, abstract, methods, results, etc. |
| `solemd.paper_blocks` | Canonical block spans | Paragraph/table/list level text |
| `solemd.paper_sentences` | Canonical sentence lineage | Required for precise cited-span assembly |
| `solemd.paper_citation_mentions` | Aligned in-text citation mentions | Feeds inline citations and cited-span packets |
| `solemd.paper_entity_mentions` | Aligned entity mentions with canonical lineage | Shared warehouse and retrieval substrate |
| `solemd.paper_chunk_versions` | Declares the active serving chunk policy | Grounded-answer gate checks this version |
| `solemd.paper_chunks` | Derived serving chunks | Current source for chunk lexical search |
| `solemd.paper_chunk_members` | Links serving chunks back to canonical blocks and sentences | Preserves span lineage for grounding |

---

## What Is Not In The Live Request Path

| Area | State |
|------|-------|
| Dense chunk ANN retrieval | Not live |
| Qdrant-backed serving | Not used |
| Ungrounded or free-form LLM synthesis as the default answer path | Not live |
| Grounded generative synthesis over cited spans | Planned, not yet live |
| Faithfulness verification in the request hot path | Not live |

The live system today is a bounded evidence retrieval and extractive answer
pipeline with optional chunk-backed grounding. The intended next answer layer is
grounded generative synthesis over cited, source-traceable warehouse spans, not
an ungrounded free-form assistant.

# SoleMD.Graph — RAG Info

> **Purpose**: condensed implementation notes and runtime contract details that
> used to be split across `rag-runtime-contract.md`,
> `rag-architecture.md`, and `rag-architecture-code.md`.
>
> **Use this doc for**: routing rules, response shape, model roles,
> evaluation, and code landmarks.
>
> **Read this with**:
> - [rag.md](./rag.md) for the canonical high-level architecture
> - [database.md](./database.md) for schema detail

---

## Runtime Contract

### Request surface

| Field | Meaning |
|------|---------|
| `graph_release_id` | Resolve the active release. `current` is supported. |
| `query` | User question or lookup string. |
| `selected_graph_paper_ref` / `selected_paper_id` / `selected_node_id` | Optional selected graph context carried into retrieval planning. |
| `selection_graph_paper_refs` | Optional explicit selection scope. |
| `scope_mode` | `global` or `selection_only`. |
| `evidence_intent` | `support`, `refute`, or `both`. |
| `k` / `rerank_topn` | Final bundle count and rerank window. |
| `use_lexical` / `use_dense_query` / `generate_answer` | Engine toggles. The web ask path currently exposes `use_lexical` and `generate_answer`; the engine contract also supports `use_dense_query`. |

### Response surface

| Field | Meaning |
|------|---------|
| `answer` | Extractive answer text from the baseline live path. |
| `answer_corpus_ids` | Papers used to construct the answer payload. |
| `grounded_answer` | Inline-cited chunk-backed answer record when coverage exists; this is also the intended substrate for later grounded generation. |
| `evidence_bundles` | Ranked per-paper evidence packages. |
| `graph_signals` | Graph-lighting instructions for the browser. |
| `retrieval_channels` | Per-lane hit summaries for debugging and UI transparency. |
| `evidence_flags` | Thin typed applicability and caution flags. |

---

## Retrieval Profiles

| Profile | Main use case | Retrieval posture |
|--------|----------------|-------------------|
| `title_lookup` | Exact or near-title queries | Prefer exact title anchors, suppress broader expansion when lexical title support is already strong |
| `passage_lookup` | Sentence-like or passage-like queries | Run chunk lexical first, prefer direct grounding, keep citation expansion tight, allow bounded lexical fallback when chunk recall is weak |
| `general` | Open topical queries | Broadest hybrid mix across lexical, dense, entity, relation, and citation signals |

The retrieval profile is inferred in `search_support.py`, then converted into a
planner decision in `search_plan.py`. That separation matters: profile is about
query shape, while the plan is the concrete execution posture for that request.

---

## Retrieval Channels

| Channel | Source | Live role | Notes |
|--------|--------|-----------|-------|
| `lexical` | `solemd.papers` FTS | Paper recall | Title/abstract-weighted search with title-similarity helpers |
| `chunk_lexical` | `solemd.paper_chunks` FTS | Passage recall | Current chunk lane; no dense chunk ANN in the live path |
| `dense_query` | `solemd.papers.embedding` | Semantic paper recall | Uses SPECTER2 ad-hoc query encoding |
| `entity_match` | `solemd.paper_entity_mentions` | Seed recall and enrichment | Exact concept or canonical-name matching with bounded terms |
| `relation_match` | `pubtator.relations` | Seed recall and enrichment | Relation-type matching against normalized relation terms |
| `citation_context` | `solemd.citations` | Boost-only expansion | Expands from already recalled candidates; not treated as a full RRF lane |
| `semantic_neighbor` | `solemd.papers.embedding` plus selected context | Selected-paper expansion | Only runs when a selected paper exists and broader expansion is justified |

---

## Ranking And Assembly

| Stage | Main function(s) | Result |
|------|-------------------|--------|
| Query normalization | `build_query()` | Normalized query, selection scope normalization, inferred retrieval profile and clinical intent |
| Search planning | `build_search_plan()` | Precise vs broad lane policy for the request |
| Initial retrieval | `retrieve_search_state()` | Bounded candidate papers and selected-paper semantic expansion |
| Candidate fusion | `merge_candidate_papers()` / `build_channel_rankings()` | Unified candidate list plus per-channel rankings |
| Preliminary ranking | `rank_paper_hits()` | First pass before enrichment |
| Optional rerank | `apply_biomedical_rerank()` | Bounded MedCPT refinement on eligible passage queries |
| Enrichment | repository `fetch_*` methods | Citation, entity, relation, species, references, assets |
| Final ranking | `rank_paper_hits()` | Final ordered papers |
| Bundle assembly | `assemble_evidence_bundles()` / `merge_graph_signals()` | UI-ready evidence packages and graph instructions |
| Answer assembly | `build_baseline_answer_payload()` | Extractive baseline answer and answer-linked paper ids |
| Grounding | `build_grounded_answer_from_runtime()` | Inline citations and cited-span packets when chunk runtime coverage is complete |

The exact ranking coefficients live in code, especially `ranking_support.py`.
This doc names the seams and the intent, not the numeric weights.

---

## Grounding Gate

Grounded answers are deliberately coverage-gated. The runtime checks for the
current chunk version and for full answer-paper coverage before it claims
chunk-backed grounding.

### Grounding prerequisites

| Requirement | Why it exists |
|------------|---------------|
| `paper_chunk_versions` contains the requested chunk version | Grounding must target one declared serving contract |
| `paper_chunks` exists for the answer-linked papers | Chunk lexical and grounding must agree on chunk identity |
| `paper_chunk_members` exists for the answer-linked papers | Chunk packets need lineage back to blocks and sentences |
| `paper_citation_mentions` exists | Inline citation anchors require canonical citation rows |
| `paper_entity_mentions` exists | Cited spans can surface entity packets without reparsing |

If these prerequisites fail, the system returns the extractive paper-grounded
answer and leaves `grounded_answer` as `null`.

---

## Evidence Flags

| Flag | Meaning |
|------|---------|
| `direct_passage_support` | The grounded answer has chunk-backed cited spans. |
| `indirect_only` | Papers were retrieved, but there is no passage-level grounding. |
| `nonhuman_only` | Top evidence is entirely nonhuman by the current species profile. |
| `species_unresolved` | Species applicability could not be resolved for the top evidence. |
| `null_finding_present` | A top title or snippet carries a null-finding signal. |

These are thin typed runtime flags. They are intentionally not an LLM summary
layer.

---

## Model Roles

| Model or artifact | Role | State |
|-------------------|------|-------|
| SPECTER2 ad-hoc query encoder | Dense paper retrieval | Live |
| MedCPT reranker | Optional bounded reranking for clinician-intent passage queries | Live, gated |
| `baseline-extractive-v1` | Default answer formatter | Live |
| Grounded generative synthesis layer | Future answer mode that composes source-traceable cited spans into prose | Planned |
| Patronus Lynx 8B tooling | Faithfulness checking for evaluation workflows | Available outside the live hot path |
| RAGAS context metrics | Evaluation-only context precision and recall | Optional tooling |

The live request path remains paper-first retrieval plus extractive answer
assembly. The intended evolution is grounded generation over cited spans and
inline citations, not an always-on free-form synthesis loop.

---

## Evaluation

| Component | Purpose |
|-----------|---------|
| `runtime_eval.py` and friends | Release-scoped runtime evaluation harness |
| `dense_audit.py` | Dense-retrieval failure analysis and hard-case harvesting |
| `runtime_eval_benchmarks.py` | Frozen benchmark generation and loading |
| `runtime_profile.py` | Planner-only SQL profile snapshots for slow cases |
| `eval_langfuse.py` | Langfuse score push and dataset integration |
| `ragas_eval.py` | Optional RAGAS-derived context metrics |
| `claim_verification.py` / `faithfulness_checker.py` | Faithfulness tooling outside the request hot path |

The evaluation stack exists to keep route changes, corpus changes, and ranking
changes measurable against the active release.

---

## Safety Posture

This system is a literature search engine, not a clinical decision support
system.

- It retrieves papers, evidence snippets, and citations.
- It can surface support/refute intent, species applicability, and null-finding signals.
- It does not provide treatment recommendations.
- It does not turn grounded evidence into autonomous clinical advice.
- It does not rely on unverifiable free-form answer generation in the live path.
- Any future generative layer should remain grounded, citation-backed, and source-traceable.

---

## Code Landmarks

| Path | Why it matters |
|------|----------------|
| `app/api/evidence/chat/stream.ts` | Browser-facing ask stream and typed request parsing |
| `lib/engine/graph-rag.ts` | Graph-aware request builder and engine-response mapper |
| `lib/engine/rag.ts` | Raw engine client contract |
| `engine/app/api/rag.py` | FastAPI route boundary |
| `engine/app/rag/service.py` | Runtime service entrypoint and warmup |
| `engine/app/rag/search_support.py` | Query normalization and request-to-model conversion |
| `engine/app/rag/search_plan.py` | Query-shape execution planning |
| `engine/app/rag/search_retrieval.py` | Initial retrieval stage |
| `engine/app/rag/search_finalize.py` | Enrichment, ranking, answer assembly, response finalization |
| `engine/app/rag/ranking.py` and `engine/app/rag/ranking_support.py` | Final scoring behavior |
| `engine/app/rag/answer.py` | Extractive baseline answer selection |
| `engine/app/rag/grounded_runtime.py` | Coverage gate for chunk-backed grounding |
| `engine/app/rag/warehouse_grounding.py` | Conversion from warehouse rows to cited answer packets |
| `engine/app/rag/queries.py` | SQL substrate for release resolution, retrieval, enrichment, and grounding |
| `engine/app/rag/repository_*.py` | PostgreSQL adapter mixins for each retrieval concern |

---

## Warehouse Operator Commands

Decision tree for warehouse operations. Use the **specific** script, not the
generic `refresh_rag_warehouse.py`, unless you need the full multi-source pipeline.

### "I need to add new papers to the warehouse"

| Scenario | Command | Key flags |
|----------|---------|-----------|
| S2ORC source-driven (new papers) | `refresh_rag_warehouse.py` | `--limit N --max-s2-shards N` |
| BioCXML new papers from a specific archive | `ingest_bioc_archive_targets.py` | `--archive-name BioCXML.N.tar.gz --limit N` |
| BioCXML bounded window campaign | `ingest_bioc_archive_campaign.py` | `--archive-name --window-count N --limit-per-window N` |
| S2ORC bounded campaign | `run_s2_refresh_campaign.py` | `--run-count N --limit-per-run N` |

### "I need to build/rebuild the BioCXML archive manifest"

The archive manifest maps every document in each BioCXML archive to its ordinal,
member name, and document ID. Discovery, overlay backfill, and source locator refresh
all use the manifest to avoid re-scanning 190GB of archives on every run.

```bash
# Single archive (e.g. after a partial failure):
uv run python scripts/populate_bioc_archive_manifest.py \
  --archive-name BioCXML.3.tar.gz

# Parallel indexing across all 10 archives (~7 min total):
for i in $(seq 0 9); do
  uv run python scripts/populate_bioc_archive_manifest.py \
    --archive-name "BioCXML.${i}.tar.gz" &
done
wait

# Force re-index (ignore existing entries):
uv run python scripts/populate_bioc_archive_manifest.py \
  --archive-name BioCXML.0.tar.gz --no-resume
```

**Automatic maintenance:** `source_locator_refresh` automatically populates the
manifest during its BioCXML stage. After the first full locator refresh, the manifest
stays complete without manual intervention.

**Verify coverage:**
```bash
uv run python -c "
from app.config import settings
from app.rag_ingest.bioc_archive_manifest import SidecarBioCArchiveManifestRepository
m = SidecarBioCArchiveManifestRepository()
rev = settings.pubtator_release_id
for i in range(10):
    name = f'BioCXML.{i}.tar.gz'
    print(f'{name}: max_ordinal={m.max_document_ordinal(source_revision=rev, archive_name=name)}')
"
```

### "I need to audit source locator coverage"

```bash
uv run python scripts/audit_source_locator_coverage.py
```

Reports S2 + BioCXML source locator completeness against the corpus table. Identifies
papers with neither source — these need a `source_locator_refresh` run.

### "I need BioCXML overlay on existing S2 papers" (entities, full text)

**Use `backfill_bioc_overlays.py`** — NOT `refresh_rag_warehouse.py`.

```bash
# Single archive (fastest — targets one archive):
uv run python db/scripts/backfill_bioc_overlays.py \
  --run-id overlay-YYYYMMDD \
  --parser-version parser-v1 \
  --corpus-ids-file .tmp/target_ids.txt \
  --archive-name BioCXML.N.tar.gz \
  --discovery-max-documents 5000

# Parallel across all 10 archives:
for i in $(seq 0 9); do
  uv run python db/scripts/backfill_bioc_overlays.py \
    --run-id overlay-arc${i}-YYYYMMDD \
    --parser-version parser-v1 \
    --corpus-ids-file .tmp/target_ids.txt \
    --archive-name "BioCXML.${i}.tar.gz" \
    --discovery-max-documents 5000 &
done
wait
```

**Why not `refresh_rag_warehouse.py`?** The generic refresh scans all S2 shards
first (even with `--refresh-existing`), then falls back to BioCXML. For papers
already in the warehouse, that S2 scan is pure waste. `backfill_bioc_overlays.py`
skips S2 entirely (`skip_s2_primary=True`).

### "I need to backfill chunks for warehouse papers"

```bash
uv run python db/scripts/backfill_structural_chunks.py \
  --run-id chunks-YYYYMMDD \
  --source-revision-key s2orc_v2:2026-03-10 \
  --parser-version parser-v1
```

### "I need to check warehouse quality / readiness"

| Script | Purpose |
|--------|---------|
| `inspect_chunk_runtime.py` | Chunk-backed grounding readiness for specific papers |
| `inspect_rag_warehouse_quality.py` | Structural quality audit (sections, blocks, sentences) |
| `inspect_rag_source_locator.py` | Source locator sidecar coverage |

### Warehouse depth classification

| Depth | Meaning | What works | What doesn't |
|-------|---------|------------|--------------|
| `fulltext` | Real structural parsing (sections, blocks, sentences, chunks) | Retrieval + grounded answers + cited spans + evidence flags | — |
| `front_matter_only` | Abstract-only stub (1 section, 1 block) | Retrieval + paper-level evidence | No passage grounding, no inline citations |
| `none` | Not in warehouse | Retrieval from metadata (title, abstract, embeddings) | No grounded answers |

The `by_warehouse_depth` eval dimension stratifies metrics by this classification so
quality numbers are never conflated across depth levels.

---

## Consolidation Note

On 2026-04-03 the RAG docs were consolidated into `rag.md`.

The former `rag-info.md` content is now folded into this document, and the
older split deep-dive docs were moved to archive:

- [../archive/rag-architecture.md](../archive/rag-architecture.md)
- [../archive/rag-architecture-code.md](../archive/rag-architecture-code.md)
- [../archive/rag-runtime-contract.md](../archive/rag-runtime-contract.md)
