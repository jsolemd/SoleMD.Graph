# RAG Benchmark System

Langfuse-native evaluation infrastructure for measuring and optimizing every
RAG retrieval channel, ranking signal, and grounding dimension.

## Operational Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BENCHMARK LIFECYCLE                               │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │  Seed Lists   │───▶│  Prepare     │───▶│  Langfuse Datasets │    │
│  │  (curated     │    │  Script      │    │  (source of truth) │    │
│  │   queries)    │    │              │    │  9 v2 suites       │    │
│  └──────────────┘    └──────────────┘    └────────┬───────────┘    │
│                                                    │                │
│                                                    ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │  Analysis     │◀───│  Experiment  │◀───│  Benchmark Runner  │    │
│  │  (Langfuse UI │    │  Runner      │    │  rag_benchmark.py  │    │
│  │   + CLI)      │    │  (per-item   │    │  --all-benchmarks  │    │
│  │              │    │   scores)    │    │                    │    │
│  └──────────────┘    └──────────────┘    └────────────────────┘    │
│                                                                     │
│  Each item produces:                                                │
│    • 8 retrieval metrics (hit@1, MRR, grounded_answer_rate, ...)   │
│    • 16 signal decomposition scores (per ranking channel)           │
│    • 8 channel contribution scores (per ranking channel)             │
│    • 4 categorical dimensions (route, profile, depth, source)       │
│    • Langfuse trace with 5 RAG observations (1 generation + 4 spans)│
└─────────────────────────────────────────────────────────────────────┘
```

## Commands

```bash
# Generate benchmarks and sync to Langfuse
cd engine && uv run python -m scripts.prepare_rag_curated_benchmarks

# Run all 9 suites
uv run python scripts/rag_benchmark.py --all-benchmarks \
    --run <run-name>

# Run single suite
uv run python scripts/rag_benchmark.py \
    --dataset benchmark-clinical_evidence_v2 \
    --run <run-name>

# Run with quality gate + failure review queue
uv run python scripts/rag_benchmark.py --all-benchmarks \
    --run <run-name> --diagnose --enqueue-failures \
    --quality-gate avg_hit_at_1=0.9,error_rate=0

# Additional CLI flags for rag_benchmark.py:
#   --k <int>               Top-k results (default 5)
#   --rerank-topn <int>     Rerank top-n candidates (default 10)
#   --no-lexical            Disable lexical (FTS) retrieval channel
#   --no-dense-query        Disable dense embedding retrieval
#   --max-concurrency <n>   Parallel tasks per dataset (default 8)
#   --graph-release-id <s>  Graph release to query (default "current")

# Langfuse CLI — inspect datasets and results
langfuse --env .env.local api datasets list
langfuse --env .env.local api dataset-items list --dataset-name benchmark-clinical_evidence_v2
langfuse --env .env.local api traces list --limit 10
```

## Benchmark Suites (v2)

| Suite | Items | Tests | Retrieval Profile |
|-------|-------|-------|-------------------|
| `title_retrieval_v2` | 12 | Exact/fuzzy title matching, edge cases (colons, Greek, abbreviations) | title_lookup |
| `clinical_evidence_v2` | 51 | Clinical queries with evidence intent (support/refute), mixed sources | general |
| `passage_retrieval_v2` | 15 | Natural language claims against chunked papers (chunk-gated) | passage_lookup |
| `adversarial_routing_v2` | 12 | Router stress: negation, gene symbols, terse multi-entity, stats | general |
| `keyword_search_v2` | 12 | Short keyword queries (2-4 tokens) against full corpus | general |
| `abstract_stratum_v2` | 12 | Abstract-only papers with no warehouse full-text coverage | general |
| `question_evidence_v2` | 12 | Interrogative clinical questions (what, how, why, which) | question_lookup |
| `semantic_recall_v2` | 12 | Paraphrased/colloquial queries where FTS fails (dense isolation) | general |
| `entity_relation_v2` | 12 | Entity-rich queries: gene variants, drug interactions, receptors | general |
| **Total** | **150** | | |

## Channel Coverage Matrix

```
                         lexical  dense  chunk  entity  relation  citation  title
                         ───────  ─────  ─────  ──────  ────────  ────────  ─────
title_retrieval_v2       ██       ░      ░      ░       ░         ░         ██
clinical_evidence_v2     ██       ██     ░      ░       ░         ██        ░
passage_retrieval_v2     ██       ██     ██     ░       ░         ██        ░
adversarial_routing_v2   ██       ░      ░      ░       ░         ██        ░
keyword_search_v2        ██       ░      ░      ░       ░         ░         ░
abstract_stratum_v2      ██       ██     ░      ░       ░         ░         ░
question_evidence_v2     ██       ██     ░      ░       ░         ██        ░
semantic_recall_v2       ░        ██     ░      ░       ░         ░         ░
entity_relation_v2       ██       ░      ░      ██      ██        ░         ░

██ = primary test target   ░ = implicit/secondary
```

## Per-Item Scores (Langfuse Evaluations)

### Retrieval Quality

| Score | Type | Description |
|-------|------|-------------|
| `hit_at_1` | numeric 0/1 | Target paper at rank 1 |
| `hit_at_k` | numeric 0/1 | Target paper in top-k results |
| `mrr` | numeric 0-1 | 1/rank of target paper (0 if not found) |
| `routing_match` | numeric 0/1 | Actual retrieval_profile matches expected_retrieval_profile (fires only when case carries expectation) |
| `grounded_answer_rate` | numeric 0/1 | Grounded answer present |
| `target_in_grounded_answer` | numeric 0/1 | Target paper in grounded answer |
| `target_in_answer_corpus` | numeric 0/1 | Target paper in answer corpus |
| `evidence_bundle_count` | numeric | Evidence bundles returned |
| `grounded_answer_present` | numeric 0/1 | Grounded answer present (binary; production traces) |
| `duration_ms` | numeric | End-to-end service latency |

### Signal Decomposition (16 per-target-paper scores)

| Score | Channel | What it measures |
|-------|---------|-----------------|
| `target_lexical_score` | lexical | FTS title+abstract match strength |
| `target_chunk_lexical_score` | chunk | Passage-level lexical match |
| `target_dense_score` | dense | SPECTER2 embedding cosine similarity |
| `target_entity_score` | entity | Named entity concept match |
| `target_relation_score` | relation | Knowledge graph relation match |
| `target_citation_boost` | citation | Citation network boost |
| `target_citation_intent_score` | citation | Citation intent classification |
| `target_title_anchor_score` | title | Title anchor routing match |
| `target_passage_alignment_score` | chunk | Passage-to-query alignment |
| `target_selected_context_score` | context | Pre-selected paper context |
| `target_intent_score` | intent | Evidence intent match |
| `target_publication_type_score` | quality | Publication type prior |
| `target_evidence_quality_score` | quality | Ingest quality signal |
| `target_clinical_prior_score` | quality | Clinical domain prior |
| `target_biomedical_rerank_score` | rerank | MedCPT biomedical reranker |
| `target_fused_score` | fusion | Final weighted fusion score |

### Channel Contribution Scores (8)

| Score | Meaning |
|-------|---------|
| `channel_lexical` | 1.0 if lexical_score > 0 |
| `channel_chunk` | 1.0 if chunk_lexical_score > 0 |
| `channel_dense` | 1.0 if dense_score > 0 |
| `channel_entity` | 1.0 if entity_score > 0 |
| `channel_relation` | 1.0 if relation_score > 0 |
| `channel_citation` | 1.0 if citation_boost > 0 |
| `target_lane_count` | Total channels that contributed |
| `fused_score_gap` | Gap between #1 and target's fused_score |

### Categorical Dimensions

| Score | Values |
|-------|--------|
| `retrieval_profile` | title_lookup, question_lookup, passage_lookup, general |
| `warehouse_depth` | fulltext, abstract, none |
| `source_system` | biocxml, s2orc_v2, abstract_only |

> **Not a score:** `route_signature` is an arbitrary high-cardinality string
> (the full routing decision fingerprint). It does not fit a categorical config
> and is captured in observation metadata at `session_flags.route_signature` —
> read it directly from the trace when diagnosing routing decisions.

## Run-Level Aggregates

| Metric | Description |
|--------|-------------|
| `avg_hit_at_1` | % of items where target = rank 1 |
| `avg_hit_at_k` | % of items where target in top-k |
| `avg_grounded_answer_rate` | % with grounded answers |
| `p50_duration_ms` | Median latency |
| `p95_duration_ms` | 95th percentile latency |
| `p99_duration_ms` | 99th percentile latency |
| `error_rate` | % of items that errored |

## Langfuse Structure

```
Langfuse Project
├── Datasets (9 v2 benchmark suites)
│   ├── benchmark-title_retrieval_v2         (12 items)
│   ├── benchmark-clinical_evidence_v2       (51 items)
│   ├── benchmark-passage_retrieval_v2       (15 items)
│   ├── benchmark-adversarial_routing_v2     (12 items)
│   ├── benchmark-keyword_search_v2          (12 items)
│   ├── benchmark-abstract_stratum_v2        (12 items)
│   ├── benchmark-question_evidence_v2       (12 items)
│   ├── benchmark-semantic_recall_v2         (12 items)
│   └── benchmark-entity_relation_v2         (12 items)
│
├── Dataset Runs (one per benchmark execution)
│   └── post-optimization-2026-04-05
│       ├── Per-item evaluations (40+ scores each)
│       ├── Run-level aggregates (avg_hit@1, p50, etc.)
│       └── Linked traces (full RAG span tree)
│
├── Traces (per benchmark item)
│   └── experiment-item-run
│       ├── rag.search (GENERATION)
│       │   └── rag.execute (SPAN)
│       │       ├── rag.retrieve (SPAN)
│       │       └── rag.finalize (SPAN)
│       │           └── rag.groundedAnswer (SPAN)
│       └── Evaluations attached to trace
│
├── Score Configs (28 registered dimensions)
│   ├── 9 retrieval metrics (hit_at_1, hit_at_k, mrr, routing_match, duration_ms, evidence_bundle_count, target_in_*)
│   ├── 2 answer quality (grounded_answer_present, faithfulness)
│   ├── 4 categorical (retrieval_profile, warehouse_depth, source_availability, source_system)
│   ├── 6 ingest quality (section/block/sentence/entity counts, has_abstract, has_title)
│   └── 7 graph observability (point_count, cluster_count, bundle_bytes, build_duration, cluster_labeled/error/total)
│
└── Annotation Queue: rag-failure-review
    └── hit@1=0 traces for domain expert review
```

## Baseline Results (post-optimization-2026-04-05)

| Suite | hit@1 | hit@k | p50 (ms) | Notes |
|-------|-------|-------|----------|-------|
| title_retrieval_v2 | 100% | 100% | 677 | Title matching is excellent |
| clinical_evidence_v2 | 7.8% | 17.6% | 31,030 | Low recall; fused_score_gap=0.30 |
| passage_retrieval_v2 | 13.3% | 46.7% | 176,707 | Dense + citation channels carrying |
| adversarial_routing_v2 | 16.7% | 41.7% | 96,419 | Lexical active (42%), dense=0 |
| keyword_search_v2 | 0% | 16.7% | 174 | FTS fast but ranking misses |
| abstract_stratum_v2 | 0% | 8.3% | 65,155 | Abstract-only papers barely retrieved |
| question_evidence_v2 | 8.3% | 33.3% | 24,039 | Weak lexical, some dense/citation |
| semantic_recall_v2 | 0% | 0% | 73,790 | Dense alone can't bridge terminology |
| entity_relation_v2 | 8.3% | 8.3% | 74,075 | Entity channel = 0% — inactive |

Latency note: p50 values reflect concurrent benchmark load (max_concurrency=4)
with cold buffer cache. Single-query production latency is much lower: FTS
alone measured at 13ms (EXPLAIN ANALYZE), keyword_search p50=174ms shows the
optimized path. The high p50 on other suites is dominated by HNSW vector scans
on a cold 10GB index with I/O contention.

> **Snapshot date**: These results are from a specific benchmark run and will
> diverge as ranking code, embeddings, or ingested corpus change. Re-run
> `--all-benchmarks` to capture current performance.

## Key Files

| File | Role |
|------|------|
| `engine/scripts/prepare_rag_curated_benchmarks.py` | Seed lists + suite builders + Langfuse sync |
| `engine/scripts/rag_benchmark.py` | CLI entry point for running benchmarks |
| `engine/app/rag_ingest/experiment.py` | Langfuse experiment runner, evaluators, annotation queue |
| `engine/app/rag_ingest/eval_langfuse.py` | Score config registration + dataset creation |
| `engine/app/langfuse_config.py` | Span names, score constants, Langfuse client |

## Agentic Optimization Loop

The benchmark system is designed for agent-driven quality improvement:

```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  Run          │     │  Diagnose     │     │  Optimize     │
  │  Benchmarks   │────▶│  Signals      │────▶│  Code/Config  │
  │               │     │               │     │               │
  │  9 suites     │     │  Which        │     │  Ranking       │
  │  150 items    │     │  channels     │     │  weights,      │
  │  Langfuse     │     │  fail?        │     │  thresholds,   │
  │  traces       │     │  fused_score  │     │  entity rules, │
  │               │     │  gap?         │     │  embeddings    │
  └──────────────┘     └──────────────┘     └──────┬───────┘
         ▲                                          │
         └──────────────────────────────────────────┘
                    re-run to verify
```

1. **Run** benchmarks via `rag_benchmark.py --all-benchmarks`
2. **Read** results via Langfuse CLI (`langfuse api dataset-runs list`)
3. **Diagnose** failures: which channels contribute to misses? what's the fused_score_gap?
4. **Optimize** the weakest channel (entity rules, ranking coefficients, dense model)
5. **Re-run** to verify improvement; quality gates catch regressions

The signal decomposition (16 scores per item) tells the agent exactly which
retrieval component to fix — no guesswork needed.

## Retrieval Architecture Recommendations

Five evidence-based improvements organized by pipeline layer. Each operates
at a distinct stage to ensure non-overlapping, independent contributions.

```
Layer 1: COVERAGE   → Do all documents have retrieval surfaces?
Layer 2: RECALL     → Are all independent channels active for target queries?
Layer 3: FUSION     → Are channel scores combined fairly?
Layer 4: RERANKING  → Is cross-encoder precision applied broadly?
```

### Rec 1 — COVERAGE: Abstract-only paper embeddings

| Dimension | Detail |
|-----------|--------|
| **Suite** | `abstract_stratum_v2` — 0% hit@1, 8.3% hit@k |
| **Root cause** | `WHERE p.embedding IS NOT NULL` silently drops abstract-only papers from dense recall |
| **RAG principle** | Partial embedding coverage is a well-known silent retrieval failure in pgvector systems. Documents without embeddings are invisible to dense retrieval regardless of model quality. |
| **Action** | Ingest pipeline: populate SPECTER2 embeddings for abstract-only papers |
| **Files** | `repository_vector_search.py:48-52` (filter), ingest pipeline (embedding generation) |

### Rec 2 — RECALL (entity): Lower entity enrichment skip thresholds

| Dimension | Detail |
|-----------|--------|
| **Suite** | `entity_relation_v2` — entity_score=0% across all items |
| **Root cause** | `should_skip_runtime_entity_enrichment()` returns True when strong lexical anchors exist, skipping entity resolution entirely (`retrieval_policy.py:145-154`) |
| **RAG principle** | Multi-lane retrieval channels must run independently, not gate on each other's results. Gating entity recall on lexical success destroys complementarity. (Bruch et al., ACM TOIS 2023; RAG-Fusion 2024) |
| **Action** | Lower or remove the lexical-anchor gate so entity enrichment runs alongside lexical |
| **Files** | `retrieval_policy.py:145-154`, `search_retrieval.py:380-389` |
| **Independence** | Entity matching resolves structured biomedical CUIs — orthogonal to term overlap (lexical) and semantic similarity (dense) |

### Rec 3 — RECALL (dense): Decouple dense from title-lookup gating

| Dimension | Detail |
|-----------|--------|
| **Suite** | `adversarial_routing_v2` — dense=0; lexical active (42%) |
| **Root cause** | Queries reclassified as TITLE_LOOKUP trigger `prefer_precise_grounding=True`, which gates dense via `should_run_dense_query()` (`retrieval_policy.py:168-169`) |
| **RAG principle** | Dense and lexical are complementary, not redundant. No hybrid search literature supports gating dense off when lexical succeeds. (Bruch et al. 2023) |
| **Action** | Allow dense + title retrieval simultaneously; decouple `prefer_precise_grounding` from dense gating |
| **Files** | `retrieval_policy.py:157-176`, `search_plan.py:59` |
| **Independence** | Dense handles semantic similarity — orthogonal to entity's structured concept resolution (Rec 2) |

### Rec 4 — FUSION: Remove ad-hoc dense_score 0.1x penalty

| Dimension | Detail |
|-----------|--------|
| **Suite** | `keyword_search_v2` — 0% hit@1, 16.7% hit@k (found but not ranked) |
| **Root cause** | `dense_score *= 0.1` penalty for papers without direct passage support (`ranking.py:157-162`). This discards valid dense signals at the fusion layer. |
| **RAG principle** | Standard RRF is parameter-free beyond k. Ad-hoc multiplicative penalties based on what other channels contributed corrupts rank-based invariance. Fusion weights should be query-independent or learned. (Elastic WRRF; Benham 2017) |
| **Action** | Remove or reduce the 0.1x penalty; let fusion weights alone determine channel importance |
| **Files** | `ranking.py:157-162`, `ranking_support.py:24-47`, `ranking_support.py:124-174` |
| **Independence** | Operates at fusion layer — Recs 2-3 activate recall channels; this ensures their signals aren't discarded during ranking |

### Rec 5 — RERANKING: Broaden MedCPT cross-encoder activation

| Dimension | Detail |
|-----------|--------|
| **Suite** | `semantic_recall_v2` — 0% hit@1, 0% hit@k |
| **Root cause** | `should_run_biomedical_reranker()` gates MedCPT to PASSAGE/QUESTION profiles with non-GENERAL clinical_intent (`retrieval_policy.py:305-327`), restricting it to a fraction of queries |
| **RAG principle** | BEIR benchmarks show cross-encoders achieve highest zero-shot nDCG@10 when applied universally. MedCPT (trained on 18M PubMed pairs) is a general-purpose biomedical reranker — no evidence supports restricting it by query profile. (Thakur et al., NeurIPS 2021; Rosa et al. 2022) |
| **Action** | Enable MedCPT for all profiles with >= 3 candidates by relaxing conditions in `should_run_biomedical_reranker()` |
| **Files** | `retrieval_policy.py:305-327`, `biomedical_reranking.py:68-151` |
| **Independence** | Post-recall precision layer — orthogonal to all recall channels and fusion; operates on the fused candidate set |

### Priority and Independence Summary

| # | Layer | Channel | Suite | Independence |
|---|-------|---------|-------|-------------|
| 1 | Coverage | Embeddings | abstract_stratum_v2 | Infrastructure — no channel logic overlap |
| 2 | Recall | Entity | entity_relation_v2 | Structured CUI resolution, not term/semantic |
| 3 | Recall | Dense | adversarial_routing_v2 | Semantic similarity, not structured/term |
| 4 | Fusion | RRF weights | keyword_search_v2 | Ranking layer, not recall layer |
| 5 | Reranking | Cross-encoder | semantic_recall_v2 | Post-fusion precision, not recall or fusion |
