# SoleMD.Graph -- RAG

> **Scope**: current runtime architecture for evidence retrieval, ranking,
> answer assembly, and graph grounding.
>
> **Use this doc for**: the stable high-level map of what is live now.
>
> **Note**: this file now also carries the former `rag-info.md` contract and
> implementation-summary content.
>
> **Companion docs**:
> - [database.md](./database.md) -- full schema detail for `solemd.*` and
>   `pubtator.*`
> - [architecture.md](./architecture.md) -- broader system architecture
> - [ingest.md](./ingest.md) -- ingestion and corpus data flow
> - [../plans/rag-runtime-direction-2026-04.md](../plans/rag-runtime-direction-2026-04.md) --
>   the post-ledger next-state runtime plan

---

## Current State

| Area | Current state |
|------|---------------|
| Retrieval unit | **Paper-first**. The runtime ranks papers, not free-floating chunks. |
| Grounding unit | **Chunk-backed cited spans when answer-linked papers are fully covered under the active chunk version**; otherwise the system returns paper-grounded extractive evidence only. |
| Query routing | `title_lookup`, `question_lookup`, `passage_lookup`, and `general` shape which lanes run and how precision is favored. |
| Corpus boundary | All retrieval is release-scoped through the active `graph_release_id` and `solemd.graph_points`. |
| Scope control | Optional `selection_only` mode limits retrieval to selected graph papers resolved inside the current release. |
| Current answer mode | `baseline-extractive-v1` from ranked evidence bundles. `generate_answer` still means "build the baseline answer payload," not "switch to live LLM synthesis." |
| Citation steering | `cited_corpus_ids` now crosses the web -> engine seam, but it is **not yet** a retrieval or ranking control in the live backend. |
| Non-live scaffolding | Generated-answer and answer-verification modules now exist in tree, but they are **not** wired into the live request path. |
| Dense retrieval | SPECTER2 ad-hoc query encoding against `solemd.papers.embedding`. |
| Optional reranking | Bounded MedCPT reranking exists for clinician-intent passage queries, but the live runtime keeps it default-off (`rag_live_biomedical_reranker_enabled = false`). |
| Chunk retrieval | Live only as **chunk lexical** search over `solemd.paper_chunks`; dense chunk ANN is not in the live request path. |
| Expert canonicalization | Postgres-backed vocab alias enrichment is live and Langfuse traces now carry `vocab_concept_matches`, but the current bridge is not yet producing meaningful rank gains on the expert-language suite. |
| Frontend boundary | The backend returns typed evidence and graph signals; DuckDB resolves graph refs locally for Cosmograph. |

---

## Current Runtime Snapshot

These numbers matter because the repo currently has two truths at once:

- the broad current-release sampled cohort is still fast and stable
- the Langfuse benchmark surface now pinpoints the remaining retrieval gaps much
  more precisely than the older v2-only snapshot

| Artifact | What it says now | Why it matters |
|------|-------------------|----------------|
| [`.tmp/rag-runtime-eval-current-all-families-v30-recheck.json`](/home/workbench/SoleMD/SoleMD.Graph/.tmp/rag-runtime-eval-current-all-families-v30-recheck.json) | `96` sampled papers / `288` cases, `hit@1=1.0`, `grounded_answer_rate=1.0`, `target_in_grounded_answer_rate=1.0`, `p95_service_duration_ms=83.229`, `p99_service_duration_ms=99.443` | The broad current-release runtime floor remains fast, grounded, and operationally healthy. |
| `canonicalization-v1-2026-04-10` Langfuse benchmark run | `16` suites / `672` cases completed; only suite-gate failure was `biomedical_evidence_type_v1` latency (`p95_duration_ms = 294.319 > 250`) | The serving path is stable enough to benchmark end to end, and the remaining work is now a retrieval-quality problem rather than an evaluation-blindness problem. |

Current benchmark posture (selected suites):

| Benchmark | Cases | hit@1 | hit@k | target_in_answer | p95 ms | Interpretation |
|-----------|------:|------:|------:|-----------------:|-------:|----------------|
| `biomedical_optimization_v3` | 297 | 1.000 | 1.000 | 1.000 | 72.7 | required regression floor remains green |
| `biomedical_holdout_v1` | 48 | 1.000 | 1.000 | 1.000 | 52.8 | required held-out biomedical guard remains green |
| `biomedical_citation_context_v1` | 24 | 1.000 | 1.000 | 1.000 | 119.3 | cited-study preservation remains green |
| `passage_retrieval_v2` | 13 | 0.692 | 0.923 | 0.769 | 230.4 | accuracy held flat while p95 improved from `444.0 -> 230.4 ms` |
| `semantic_recall_v2` | 12 | 0.083 | 0.167 | 0.083 | 137.4 | accuracy held flat while p95 improved from `402.0 -> 137.4 ms` |
| `entity_relation_v2` | 12 | 0.500 | 0.667 | 0.667 | 301.6 | accuracy held flat while p95 improved from `580.1 -> 301.6 ms` |
| `biomedical_narrative_v1` | 36 | 0.167 | 0.361 | 0.278 | 362.8 | grounded narrative retrieval remains weak |
| `biomedical_expert_canonicalization_v1` | 64 | 0.016 | 0.062 | 0.031 | 1040.4 | expert-language retrieval is the clearest current gap |

Coverage note on 2026-04-11:

- the score row above is still the pre-backfill evaluation snapshot
- the live warehouse now gives `biomedical_expert_canonicalization_v1`
  `61` structure-complete, `63` grounding-ready, `2` entity-thin, `1` sparse
- before any targeted recovery work the suite was effectively `5 covered / 59 sparse`
- the only truly sparse residual is `206148831`; PubMed `21862951` has no
  abstract, and there is no manifest-resolved local BioC target
- the other two residuals (`31269847`, `277771861`) are already
  chunk/sentence-backed and are better understood as entity-thin than sparse
- the recovered-paper title-fidelity debt has been cleared; the recovered-set
  quality audit now has `flagged_corpus_ids = []`
- interpret the current expert-suite score as a mix of real retrieval weakness,
  one remaining source-bound sparse case, and two entity-thin partials, not as
  a pure ranking signal

Trace review on `biomedical_expert_canonicalization_v1` shows:

- `vocab_concept_matches` metadata is present on the expert-suite traces
- `17 / 64` cases produced non-empty vocab concept matches
- `0 / 17` matched cases reached `hit@1`

That means the canonicalization substrate is live, but the present concept
bridge is not yet strong enough to move winning-paper rank on the new
expert-language surface.

Coverage audit on April 10, 2026 changed the interpretation of that result:

- only `5 / 64` expert-suite targets initially had full child-evidence coverage
- `59 / 64` targets were present in `graph_points` but absent from
  `paper_documents`, chunks, entity mentions, and sentence seeds
- all `59 / 59` sparse targets were PubTator-addressable and manifest-resolved
  in the local BioC archive
- a first bounded BioC backfill increased covered targets from `5 -> 32`
  before the outer operator surface stopped yielding reliable end-of-run reports
- frozen archive-scoped discovery reports plus direct `member_name` fetch then
  completed the overnight archive-target campaign and moved the live expert
  suite to `61` structure-complete / `63` grounding-ready / `1` sparse

So the next clean backend step is coverage-and-quality-first:

- decide whether expert-suite reruns should gate on `grounding_ready` (`63`) or
  `structure_complete` (`61`)
- resolve or explicitly exempt the last source-bound sparse target `206148831`
- decide whether the `2` entity-thin grounding-ready cases need entity repair
  before the next expert rerun
- then rerun `biomedical_expert_canonicalization_v1`
- only after that continue deeper ranking/query-rewrite evaluation on the
  expert suite

Update on 2026-04-11:

- the operational decision is now to use the `61` structure-complete cases for
  expert-suite review
- `rag_benchmark.py --use-suite-gates` already enforces that via
  `gate_warehouse_depths=("chunks_entities_sentence",)` from the benchmark
  catalog
- after refreshing the dataset metadata and fixing review filtering, the
  baseline structure-complete expert surface was:
  - `hit@1 = 0.131`
  - `hit@k = 0.262`
  - `grounded_answer_rate = 0.934`
  - `target_in_answer_corpus = 0.164`
  - `p95_duration_ms = 383.6`
- the current accepted ranking mainline on the `61`-case surface is:
  - run `expert-structure61-general-direct-priority-2026-04-11`
  - `hit@1 = 0.164`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 0.951`
  - `target_in_answer_corpus = 0.230`
  - `p50_duration_ms = 153.0`
  - `p95_duration_ms = 298.6`
- the current live canonicalization pass is:
  - run `expert-structure61-composite-ontology-phrases-underresolved-2026-04-11`
  - `hit@1 = 0.164`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 1.000`
  - `target_in_answer_corpus = 0.230`
  - `p50_duration_ms = 153.3`
  - `p95_duration_ms = 324.4`
- delta vs the prior accepted ranking mainline:
  - `hit@1: flat`
  - `hit@k: flat`
  - `grounded_answer_rate: +0.049`
  - `target_in_answer_corpus: flat`
  - `p50_duration_ms: +0.322 ms`
  - `p95_duration_ms: +25.779 ms`
- the current failure mix is:
  - `0` no-target-signal misses
  - `7` target-visible-not-top1 misses
  - `44` top1 misses
- the miss surface is now cleaner even though top-line retrieval is flat:
  - upstream composite event phrases plus under-resolved vocab rescue removed the
    no-target-signal bucket by mapping expert shorthand into ontology-backed
    vocab concepts before retrieval
  - `target_visible_not_top1` remains the cleanest ranking-only bucket
  - `top1_miss` is now even more explicitly the dominant frontier and needs
    stronger parent-child evidence promotion after recall
- the live policy decision is now explicit:
  - concept and chunk recovery stay enabled for recall
  - title-profile demotion after fallback recovery remains parked in the hot path
  - ranking, not mid-retrieval route mutation, is the accepted arbitration surface
  - live graph traversal remains deferred; the hot path should keep exploiting
    cheap precomputed entity, relation, citation, and semantic-neighbor signals first

Graph note:

- query-time graph retrieval is still deferred
- the live hot path already consumes cheap precomputed structure through entity,
  relation, citation, and graph-signal surfaces
- the latest gain came from letting exact resolved concepts open the existing
  entity-match lane, not from adding a new graph traversal step
- until graph traversal can be expressed as a bounded precomputed signal, it is
  more likely to add latency/complexity than to solve the current expert-suite
  miss buckets
- next graph step is a precomputed read-model over PubTator relations, aliases,
  citations, semantic-neighbor links, and the paper/chunk/sentence hierarchy
- that graph layer should feed candidate expansion, shortlist priors, and
  rerank support, not replace the current parent/child retrieval stack

---

## Langfuse Evaluation System

Langfuse is the **operational control plane** for RAG quality. All evaluation
runs through the Langfuse SDK/API -- not a separate dashboard or log parser.

### Infrastructure

| Component | State |
|-----------|-------|
| Langfuse server | v3.158.0, self-hosted at `localhost:3100` |
| Python SDK | v4 (observation-centric model) |
| Score configs | benchmark metrics plus runtime observability dimensions registered via `ensure_score_configs()` |
| Environment | `development` for experiments, `production` for live API |
| Annotation queue | `rag-failure-review` for domain expert triage of hit@1=0 |

### Benchmark Datasets (16 live suites)

Benchmarks are Langfuse Datasets (source of truth). JSON snapshots are opt-in
via `--snapshot` for git-tracked freezes.

| Dataset group | Current suites | Purpose |
|---------|-------------------|---------|
| Required biomedical guards | `biomedical_optimization_v3`, `biomedical_holdout_v1`, `biomedical_citation_context_v1` | keep the broad biomedical floor green |
| Specialist guardrails | `biomedical_metadata_retrieval_v1`, `biomedical_evidence_type_v1` | prevent regressions on metadata and evidence-design retrieval |
| OpenEvidence-style frontier | `biomedical_narrative_v1`, `biomedical_expert_canonicalization_v1` | grounded narrative retrieval and expert-language canonicalization |
| Legacy v2 routing/retrieval suites | `title_retrieval_v2`, `clinical_evidence_v2`, `passage_retrieval_v2`, `adversarial_routing_v2`, `keyword_search_v2`, `abstract_stratum_v2`, `question_evidence_v2`, `semantic_recall_v2`, `entity_relation_v2` | route-specific and channel-specific regression detection |

### Score Dimensions

**Retrieval**: `hit_at_1`, `hit_at_k`, `mrr`, `routing_match`, `duration_ms`, `evidence_bundle_count`
**Answer quality**: `grounded_answer_rate`, `target_in_grounded_answer`, `target_in_answer_corpus`, `faithfulness`
**Signal decomposition** (per target paper): `target_lexical_score`, `target_chunk_lexical_score`, `target_dense_score`, `target_entity_score`, `target_relation_score`, `target_citation_boost`, `target_intent_score`, `target_publication_type_score`, `target_evidence_quality_score`, `target_biomedical_rerank_score`, `target_fused_score`, `fused_score_gap`
**Channel contribution**: `channel_lexical`, `channel_chunk`, `channel_dense`, `channel_entity`, `channel_relation`, `channel_citation`, `target_lane_count`
**Categorical**: `retrieval_profile`, `warehouse_depth`, `source_system`, `has_chunks`
**Ingest**: `section_count`, `block_count`, `sentence_count`, `entity_count`, `has_abstract_section`, `has_title_section`
**Graph build**: `graph_point_count`, `graph_cluster_count`, `graph_bundle_bytes`, `graph_build_duration_s`

### Evaluation Workflow

```
prepare_rag_curated_benchmarks.py  ->  Langfuse Datasets (source of truth)
                                       v
rag_benchmark.py --diagnose  ->  traces + scores + failure diagnosis
                                       v
                       --enqueue-failures  ->  Annotation queue for expert review
                                       v
                     Fix routing/ranking  ->  Re-run + compare runs in Langfuse UI
```

### Trace Tree (34 spans)

```
rag.search                     # Top-level (GENERATION)
+-- rag.execute
|   +-- rag.retrieve
|   +-- rag.finalize
|   +-- rag.answerGeneration
|   +-- rag.groundedAnswer
```

### Operator Decision Tree

| Scenario | Command |
|----------|---------|
| Generate benchmarks | `uv run python -m scripts.prepare_rag_curated_benchmarks` |
| Run all baselines | `uv run python scripts/rag_benchmark.py --all-benchmarks --run baseline-YYYY-MM-DD --use-suite-gates --diagnose` |
| Enqueue failures | Add `--enqueue-failures` to any run |
| Quality gate | Add `--quality-gate avg_hit_at_1=0.9,error_rate=0` |
| Review stored run | `uv run python scripts/rag_benchmark.py --dataset <dataset> --run <run-name> --review-existing-run` |
| Compare runs | `uv run python scripts/rag_benchmark.py --dataset <dataset> --run <post-run> --review-existing-run --compare-run <baseline-run>` |

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
- `cited_corpus_ids` is a live request seam, but it is not yet a retrieval guarantee or rank override.
- DuckDB is the local graph resolver, not the evidence retriever. It maps backend-selected papers back onto the current graph bundle.

---

## Runtime Flow

1. The browser sends a typed request with `graph_release_id`, query text, and optional graph context such as a selected paper or selection scope.
2. The engine normalizes the query, infers a retrieval profile, and builds a search plan that decides how much precision or expansion to allow.
3. Retrieval runs across bounded lanes: lexical, chunk lexical, dense query, entity, relation, citation-context expansion, and selected-paper semantic neighbors.
4. Candidate papers are merged, reranked, enriched with citations, entities, relations, references, and assets, then packaged into evidence bundles and graph signals.
5. The live answer path builds a paper-grounded extractive answer from the top bundles.
6. If chunk runtime coverage is complete for the answer-linked papers, the engine also returns a `grounded_answer` with inline citation anchors and cited-span packets.
7. The browser resolves returned corpus ids back into local graph rows and lights the mapped subset on Cosmograph.

---

## In-Tree But Not Live

These seams exist in the repository today but are not part of the live serving path:

- `engine/app/rag/answer_generation.py`
- `engine/app/rag/answer_verification.py`
- request-level `cited_corpus_ids` plumbing across the web -> engine boundary

Their intended next use belongs in the plan doc, not here.

---

## Important Runtime Tables

| Table | Why it matters in the live path | Notes |
|------|----------------------------------|-------|
| `solemd.graph_runs` | Resolves `graph_release_id` to one concrete graph run | Supports `current`, explicit run ids, and bundle checksums |
| `solemd.graph_points` | Defines release membership for retrieval and graph resolution | Every live query is scoped through the resolved run |
| `solemd.papers` | Core paper metadata, paper FTS, and dense embeddings | Title, abstract, TLDR, venue, counts, `embedding`, `fts_vector` (stored tsvector); all graph-scoped queries JOIN through `graph_points` before FTS evaluation |
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
| `cited_corpus_ids` as a retrieval/ranking constraint | Request seam only; not yet used by the live backend search path |
| Grounded generative synthesis over cited spans | Scaffolding exists, not yet wired into the request hot path |
| Faithfulness verification in the request hot path | Scaffolding exists, not yet wired into the request hot path |

The live system today is a bounded evidence retrieval and extractive answer
pipeline with optional chunk-backed grounding.

# SoleMD.Graph -- RAG Info

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
| `cited_corpus_ids` | Explicit user-cited papers carried through the request seam. This field exists live, but backend retrieval does not yet enforce it. |
| `k` / `rerank_topn` | Final bundle count and rerank window. |
| `use_lexical` / `use_dense_query` / `generate_answer` | Engine toggles. `generate_answer` currently controls the extractive baseline answer path, not a live generative mode switch. |

### Response surface

| Field | Meaning |
|------|---------|
| `answer` | Extractive answer text from the baseline live path. |
| `answer_model` | Usually `baseline-extractive-v1` when answer generation is enabled in the live path. |
| `answer_corpus_ids` | Papers used to construct the answer payload. |
| `grounded_answer` | Inline-cited chunk-backed answer record when coverage exists. |
| `evidence_bundles` | Ranked per-paper evidence packages. |
| `graph_signals` | Graph-lighting instructions for the browser. |
| `retrieval_channels` | Per-lane hit summaries for debugging and UI transparency. |
| `evidence_flags` | Thin typed applicability and caution flags. |

---

## Retrieval Profiles

| Profile | Main use case | Retrieval posture |
|--------|----------------|-------------------|
| `title_lookup` | Exact or near-title queries | Prefer exact title anchors, suppress broader expansion when lexical title support is already strong |
| `question_lookup` | Interrogative sentence queries | Run both paper lexical and chunk lexical lanes, allow bounded paper fallback when chunk anchors are weak, and prefer precise grounding |
| `passage_lookup` | Sentence-like or passage-like queries | Run chunk lexical first, prefer direct grounding, keep citation expansion tight, allow bounded lexical fallback when chunk recall is weak |
| `general` | Open topical queries | Broadest hybrid mix across lexical, dense, entity, relation, and citation signals |

The retrieval profile is inferred in `search_support.py`, then converted into a
planner decision in `search_plan.py`. That separation matters: profile is about
query shape, while the plan is the concrete execution posture for that request.

---

## Retrieval Channels

| Channel | Source | Live role | Notes |
|--------|--------|-----------|-------|
| `lexical` | `solemd.papers.fts_vector` | Paper recall | Stored tsvector (title weight A, abstract weight B) via graph_points JOIN; GIN-indexed for sub-100ms retrieval |
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
This doc names the seams and the intent, not the numeric weights. The live
runtime also exposes route-level observability such as
`paper_search_sparse_passage_fallback` in runtime-eval artifacts, which matters
when passage-mode recovery is doing real work.

---

## Grounding Gate

Grounded answers are deliberately coverage-gated. The runtime checks for the
current chunk version and for full answer-paper coverage before it claims
chunk-backed grounding.

Current code reports this through `GroundedAnswerRuntimeStatus.fully_covered`
plus `has_any_coverage`. Partial coverage is observable, but the live response
only emits `grounded_answer` when the answer-linked paper set is fully covered.

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
| MedCPT reranker | Optional bounded reranking for clinician-intent passage queries | Available, default-off |
| `baseline-extractive-v1` | Default answer formatter | Live |
| `answer_generation.py` | Generated cited-answer scaffolding | In tree, not live |
| `answer_verification.py` | Serving-path faithfulness gate scaffolding | In tree, not live |
| Patronus Lynx 8B tooling | Faithfulness checking for evaluation workflows | Available outside the live hot path |
| RAGAS context metrics | Evaluation-only context precision and recall | Optional tooling |

The live request path remains paper-first retrieval plus extractive answer
assembly. Anything beyond that belongs in the future plan, not the current-state map.

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

The current review posture should use both:

- the broad sampled release artifact for runtime floor and latency
- the frozen targeted benchmarks for failure-class tracking

### Operator workflow

**Langfuse is the primary review surface for RAG evaluation.** Do not rely on
JSON reports alone -- always verify results through Langfuse traces.

```bash
cd engine

# 1. Run benchmarks (traces push to Langfuse automatically)
export LANGFUSE_HOST=http://localhost:3100
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_PUBLIC_KEY=pk-lf-...

uv run python -m scripts.evaluate_rag_runtime \
  --benchmark-path data/runtime_eval_benchmarks/<name>.json \
  --graph-release-id current

# 2. Review in Langfuse UI at $LANGFUSE_HOST
#    - Score Analytics: hit_at_1, routing_match, grounded_answer_rate regressions
#    - Filter by categorical tags: query_family, warehouse_depth, retrieval_profile
#    - Click any trace to inspect the full pipeline:
#      Input:  query, corpus_id, query_family, evidence_intent
#      Output: top_hits with rank_features, retrieval_channel_hit_counts
#      Meta:   session_flags (route, profile, scope), candidate_counts, stage_durations_ms
#    - Inspect observation metadata for the full routing fingerprint:
#      session_flags.route_signature captures the per-request route string
#      (arbitrary high-cardinality, not a score -- read directly from the trace).
```

Each trace captures the complete retrieval pipeline state -- query in, which
channels fired, how candidates were ranked, what features scored each hit,
which route was taken, where time was spent, and what answer was selected.
Use this for debugging regressions, comparing A/B routing changes, and
understanding why a specific paper was or wasn't retrieved.

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
| `engine/app/rag/query_enrichment.py` | Query-shape classification, title-like detection, and question detection |
| `engine/app/rag/search_plan.py` | Query-shape execution planning |
| `engine/app/rag/retrieval_policy.py` | Centralized route gating, exact-title rescue, fallback policy, reranker gating |
| `engine/app/rag/search_retrieval.py` | Initial retrieval stage |
| `engine/app/rag/search_finalize.py` | Enrichment, ranking, answer assembly, response finalization |
| `engine/app/rag/ranking.py` and `engine/app/rag/ranking_support.py` | Final scoring behavior |
| `engine/app/rag/answer.py` | Extractive baseline answer selection |
| `engine/app/rag/grounded_runtime.py` | Coverage gate for chunk-backed grounding |
| `engine/app/rag/warehouse_grounding.py` | Conversion from warehouse rows to cited answer packets |
| `engine/app/rag/answer_generation.py` | Generated-answer scaffolding that is not yet wired live |
| `engine/app/rag/answer_verification.py` | Faithfulness-gate scaffolding that is not yet wired live |
| `engine/app/rag/queries.py` | SQL substrate for release resolution, retrieval, enrichment, and grounding |
| `engine/app/rag/repository_*.py` | PostgreSQL adapter mixins for each retrieval concern |
| `docs/agentic/2026-04-01-solemd-graph-rag-runtime-ledger.md` | The durable record of the runtime optimization and cleanup sequence through A53 |

---

## Warehouse Operator Commands

Decision tree for warehouse operations. Use the **specific** script, not the
generic `refresh_rag_warehouse.py`, unless you need the full multi-source pipeline.

### Data flow -- three layers of indexing

Understanding where data lives prevents confusion about what each script does:

```
Layer 1: ARCHIVE MANIFEST (SQLite sidecar, no PostgreSQL)
  File: releases/<rev>/manifests/biocxml.archive_manifest.sqlite
  Maps: document_id (PMID) -> tar archive position (archive, ordinal, member)
  Built by: populate_bioc_archive_manifest.py  |  source_locator_refresh (auto)
              v
Layer 2: SOURCE LOCATOR (SQLite sidecar, reads PostgreSQL for corpus resolution)
  Files: releases/<rev>/manifests/s2orc_v2.corpus_locator.sqlite
         releases/<rev>/manifests/biocxml.corpus_locator.sqlite
  Maps: corpus_id -> source location (shard/archive, ordinal, document key)
  Built by: refresh_rag_source_locator.py
              v
Layer 3: WAREHOUSE (PostgreSQL)
  Tables: solemd.paper_documents, paper_sections, paper_blocks, paper_sentences, ...
  Contains: parsed document structure, chunks, embeddings, entity mentions
  Built by: refresh_rag_warehouse.py  |  backfill_bioc_overlays.py
```

Each layer feeds the next. Layer 1 must exist before layer 2 can index BioCXML
sources. Layer 2 must exist before layer 3 can fetch documents for parsing.

### "I need to add new papers to the warehouse"

| Scenario | Command | Key flags |
|----------|---------|-----------|
| S2ORC source-driven (new papers) | `refresh_rag_warehouse.py` | `--limit N --max-s2-shards N` |
| BioCXML new papers from a specific archive | `ingest_bioc_archive_targets.py` | `--archive-name BioCXML.N.tar.gz --limit N` |
| BioCXML bounded window campaign | `ingest_bioc_archive_campaign.py` | `--archive-name --window-count N --limit-per-window N` |
| S2ORC bounded campaign | `run_s2_refresh_campaign.py` | `--run-count N --limit-per-run N` |

### "I need to build/rebuild the BioCXML archive manifest" (Layer 1)

The archive manifest is a **SQLite sidecar** (not PostgreSQL) that maps every document
in each BioCXML archive to its tar position. Without it, finding a specific PMID
requires decompressing the entire ~20GB archive sequentially. With it, lookup is instant.

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

### "I need to audit source locator coverage" (Layer 2)

```bash
uv run python scripts/audit_source_locator_coverage.py
```

Reads the two **SQLite** source locator sidecars and compares against the **PostgreSQL**
corpus table. Reports how many papers have S2 entries, BioCXML entries, both, or
neither. Papers with neither need a `source_locator_refresh` run.

### "I need BioCXML overlay on existing S2 papers" (entities, full text)

**Use `backfill_bioc_overlays.py`** -- NOT `refresh_rag_warehouse.py`.

```bash
# Single archive (fastest -- targets one archive):
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
| `fulltext` | Real structural parsing (sections, blocks, sentences, chunks) | Retrieval + grounded answers + cited spans + evidence flags | -- |
| `front_matter_only` | Abstract-only canonical structure with thin document depth | Retrieval + chunk-backed grounding when chunks exist + paper-level evidence | Weaker citation density and thinner span coverage than fulltext papers |
| `none` | Not in warehouse | Retrieval from metadata (title, abstract, embeddings) | No grounded answers |

The `by_warehouse_depth` eval dimension stratifies metrics by this classification so
quality numbers are never conflated across depth levels.

---

## Out Of Scope -- 2026-04-06 Architecture Pass

The 2026-04-06 routing + ranking improvements intentionally did **not**
touch the items below. They remain tracked but deferred:

- **Reshaping benchmark seeds.** Cases now carry
  `expected_retrieval_profile` via `RuntimeEvalBenchmarkCase` and the
  `routing_match` score surfaces mismatches. A future pass can either
  reshape seeds or add more router heuristics with stronger evidence --
  we don't want to chase individual seeds without a broader justification.
- **Adding TITLE-profile reranker influence.** The cross-encoder is now
  live on GENERAL/PASSAGE/QUESTION profiles. TITLE will wait until we
  have GENERAL observability data on latency and score impact before
  expanding the reranker to the already-100% title lane.
- **Adding an `expected_active_channels` field.** Additive observability
  that would let us assert which retrieval channels should light up per
  case. Can be added alongside a channel evaluator in a later pass.
- **Aggressive router heuristics.** Length-only demote rules and
  broad preposition lists (`in`, `with`, `on`, `by`, `via`, `into`)
  were rejected -- they regress legitimate biomedical titles such as
  `Lithium in Bipolar Disorder`. Only the narrow paraphrase markers
  `from` and `against` joined `PROSE_CLAUSE_TOKENS`, and the auxiliary
  verbs already in the set were broadened to apply at any query length.

---

## Title Similarity Fast-Fail

The `title_matches` and `normalized_title_matches` CTEs were removed from
`_paper_search_sql` (both the `include_title_similarity=True` and False
variants) on 2026-04-07. They combined four trigram predicates via OR
(`LIKE '%X%'`, `% query`, `query <<% normalize_title_key(title)`, and a
normalized `LIKE`) inside a BitmapOr over the GiST trigram indexes on a
14M-row `papers` table. On short title queries the BitmapOr + Recheck
burned 30-60 s per call -- trigram recheck on millions of false positives
is inherent to the approach regardless of index type (GIN was tested and
rejected: 125 s on the same query because the recheck processes 94% of
the candidates).

The retained `exact_title_matches` (btree exact on `lower(title)` and
`normalize_title_key(title)`) and `fts_matches` (GIN `fts_vector @@
ts_query`) cover the common title-lookup cases. The inline
`fts_title_similarity_sql` still scores matched rows with
`word_similarity` / `similarity` so the `title_similarity * 0.15` boost
in `final_order_sql` still benefits genuine title queries. What we lose:
character-level typo tolerance on titles (e.g. `alzhiemer` -> `Alzheimer`)
-- acceptable for a research search engine where title queries usually
contain intentional tokens that FTS already catches via stemming.

Measured impact on `rag.search` warm latency with `title_similarity=True`:
before 27-72 s per query; after 13-47 ms per query (~1000x).

---

_Last verified against code: 2026-04-08_
