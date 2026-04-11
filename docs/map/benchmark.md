# RAG Benchmark System

Langfuse-native evaluation infrastructure for measuring and optimizing every
RAG retrieval channel, ranking signal, and grounding dimension.

## Operational Flow

```
+---------------------------------------------------------------------+
|                    BENCHMARK LIFECYCLE                               |
|                                                                     |
|  +--------------+    +--------------+    +--------------------+    |
|  |  Seed Lists   |--->|  Prepare     |--->|  Langfuse Datasets |    |
|  |  (curated     |    |  Script      |    |  (source of truth) |    |
|  |   queries)    |    |              |    |  16 live suites    |    |
|  +--------------+    +--------------+    +--------+-----------+    |
|                                                    |                |
|                                                    v                |
|  +--------------+    +--------------+    +--------------------+    |
|  |  Analysis     |<---|  Experiment  |<---|  Benchmark Runner  |    |
|  |  (Langfuse UI |    |  Runner      |    |  rag_benchmark.py  |    |
|  |   + CLI)      |    |  (per-item   |    |  --all-benchmarks  |    |
|  |              |    |   scores)    |    |                    |    |
|  +--------------+    +--------------+    +--------------------+    |
|                                                                     |
|  Each item produces:                                                |
|    * 8 retrieval metrics (hit@1, MRR, grounded_answer_rate, ...)   |
|    * 16 signal decomposition scores (per ranking channel)           |
|    * 8 channel contribution scores (per ranking channel)             |
|    * 4 categorical dimensions (route, profile, depth, source)       |
|    * Langfuse trace with 5 RAG observations (1 generation + 4 spans)|
+---------------------------------------------------------------------+
```

## Commands

```bash
# Generate benchmarks and sync to Langfuse
cd engine && uv run python -m scripts.prepare_rag_curated_benchmarks

# Run all 16 live suites with suite-default gates
uv run python scripts/rag_benchmark.py --all-benchmarks \
    --run <run-name> --use-suite-gates --diagnose

# Run single suite
uv run python scripts/rag_benchmark.py \
    --dataset benchmark-clinical_evidence_v2 \
    --run <run-name>

# Run with explicit quality gate + failure review queue
uv run python scripts/rag_benchmark.py --all-benchmarks \
    --run <run-name> --diagnose --enqueue-failures \
    --quality-gate avg_hit_at_1=0.9,error_rate=0

# Review an existing Langfuse run without re-executing retrieval
uv run python scripts/rag_benchmark.py \
    --dataset benchmark-entity_relation_v2 \
    --run canonicalization-v1-2026-04-10 \
    --review-existing-run \
    --compare-run baseline-2026-04-10-expert-canonicalization \
    --review-max-misses 3

# Additional CLI flags for rag_benchmark.py:
#   --k <int>               Top-k results (default 5)
#   --rerank-topn <int>     Rerank top-n candidates (default 10)
#   --no-lexical            Disable lexical (FTS) retrieval channel
#   --no-dense-query        Disable dense embedding retrieval
#   --max-concurrency <n>   Parallel tasks per dataset (default 8)
#   --graph-release-id <s>  Graph release to query (default "current")
#   --review-existing-run   Review a stored Langfuse run instead of executing
#   --compare-run <name>    Compare the reviewed run against a baseline run

# Langfuse CLI -- inspect datasets and results
langfuse --env .env.local api datasets list
langfuse --env .env.local api dataset-items list --dataset-name benchmark-clinical_evidence_v2
langfuse --env .env.local api traces list --limit 10
```

## Live Benchmark Suites

| Suite | Items | Role |
|-------|------:|------|
| `biomedical_optimization_v3` | 297 | required broad regression floor for paper retrieval + grounding |
| `biomedical_holdout_v1` | 48 | required held-out biomedical regression guard |
| `biomedical_citation_context_v1` | 24 | required cited-study preservation and citation-context retrieval |
| `biomedical_narrative_v1` | 36 | grounded multi-study narrative retrieval |
| `biomedical_expert_canonicalization_v1` | 64 | expert-language canonicalization without title overfitting |
| `biomedical_metadata_retrieval_v1` | 36 | specialist metadata retrieval guardrail |
| `biomedical_evidence_type_v1` | 16 | specialist evidence-design retrieval guardrail |
| `title_retrieval_v2` | 12 | exact and fuzzy title routing |
| `clinical_evidence_v2` | 51 | general clinical evidence retrieval |
| `passage_retrieval_v2` | 13 | child evidence retrieval and passage alignment |
| `adversarial_routing_v2` | 12 | router stress and false-positive route control |
| `keyword_search_v2` | 12 | short-keyword exactness under global corpus search |
| `abstract_stratum_v2` | 12 | abstract-only retrieval coverage |
| `question_evidence_v2` | 15 | interrogative clinical evidence routing |
| `semantic_recall_v2` | 12 | paraphrase and semantic recall robustness |
| `entity_relation_v2` | 12 | entity-heavy and relation-heavy biomedical retrieval |
| **Total** | **672** | |

## Expert Canonicalization Coverage

Current warehouse state for `biomedical_expert_canonicalization_v1`:

- initial audit: `5 covered / 59 sparse`
- after the first bounded BioC pass: `32 covered / 32 sparse`
- after the archive-target overnight campaign and residual recovery work:
  - `61` structure-complete
  - `63` grounding-ready
  - `2` entity-thin
  - `1` sparse
- the only true sparse residual is `206148831`
  - PubMed `21862951` has no abstract
  - there is no manifest-resolved local BioC archive target
- the `2` entity-thin cases are `31269847` and `277771861`
- the recovered-paper title-fidelity debt is cleared
  - `docs/investigations/2026-04-11-expert-recovered-paper-quality.json`
    now has `flagged_corpus_ids = []`
- suite-gated review already uses only `chunks_entities_sentence` cases via
  `rag_benchmark.py --use-suite-gates`
- after refreshing the Langfuse dataset metadata on 2026-04-11, the current
  structure-complete review surface is:
  - `61` included / `3` excluded
  - baseline run `expert-structure61-2026-04-11`
    - `hit@1 = 0.131`
    - `hit@k = 0.262`
    - `grounded_answer_rate = 0.934`
    - `target_in_answer_corpus = 0.164`
    - `p95_duration_ms = 383.6`
  - previous accepted run `expert-structure61-rerank-direct-mainline-2026-04-11`
    - `hit@1 = 0.148`
    - `hit@k = 0.279`
    - `grounded_answer_rate = 0.951`
    - `target_in_answer_corpus = 0.213`
    - `p95_duration_ms = 315.8`
  - current accepted ranking run `expert-structure61-general-direct-priority-2026-04-11`
    - `hit@1 = 0.164`
    - `hit@k = 0.279`
    - `grounded_answer_rate = 0.951`
    - `target_in_answer_corpus = 0.230`
    - `p95_duration_ms = 298.6`
  - current live run `expert-structure61-composite-ontology-phrases-underresolved-2026-04-11`
    - `hit@1 = 0.164`
    - `hit@k = 0.279`
    - `grounded_answer_rate = 1.000`
    - `target_in_answer_corpus = 0.230`
    - `p95_duration_ms = 324.4`
  - delta from the prior accepted ranking mainline
    - `hit@1: flat`
    - `hit@k: flat`
    - `grounded_answer_rate: +0.049`
    - `target_in_answer_corpus: flat`
    - `p50_duration_ms: +0.322 ms`
    - `p95_duration_ms: +25.779 ms`
  - current miss taxonomy
    - `no_target_signal = 0`
    - `target_visible_not_top1 = 7`
    - `top1_miss = 44`
  - structural interpretation
    - upstream composite event phrases now surface ontology-backed vocab matches
      for the former no-target-signal queries without widening retrieval lanes
    - the tightened under-resolved supplemental vocab lookup keeps ordinary
      exact biomedical queries on the old fast path and only rescues phrases
      whose initial entity resolution collapsed to a generic concept
    - headline retrieval quality is still flat on the gated `61`-case surface,
      so the next frontier is converting the recovered concepts into stronger
      parent-child recall and rank gains rather than adding more phrase families

Operational note:

- explicit corpus ids were not sufficient on their own because the older
  archive-discovery path still scanned manifest windows from the beginning
- the clean operator path is now:
  1. audit live sparse cases
  2. materialize frozen per-archive discovery reports
  3. run `ingest_bioc_archive_targets.py --discovery-report-path ... --backfill-chunks --inspect-quality`
  4. classify residuals as `structure_complete`, `grounding_ready`, or
     `source-bound sparse` before rerunning Langfuse
  5. when using Langfuse review or quality gates, pass `--use-suite-gates`
     so the review respects `gate_warehouse_depths` from the benchmark catalog
  6. for passage/question expert prompts, let bounded biomedical reranking
     arbitrate earlier among already-direct candidates instead of leaving the
     reranker winner trapped behind citation/context priors

## Channel Coverage Matrix

```
                         lexical  dense  chunk  entity  relation  citation  title
                         -------  -----  -----  ------  --------  --------  -----
title_retrieval_v2       ##       .      .      .       .         .         ##
clinical_evidence_v2     ##       ##     .      .       .         ##        .
passage_retrieval_v2     ##       ##     ##     .       .         ##        .
adversarial_routing_v2   ##       .      .      .       .         ##        .
keyword_search_v2        ##       .      .      .       .         .         .
abstract_stratum_v2      ##       ##     .      .       .         .         .
question_evidence_v2     ##       ##     .      .       .         ##        .
semantic_recall_v2       .        ##     .      .       .         .         .
entity_relation_v2       ##       .      .      ##      ##        .         .

## = primary test target   . = implicit/secondary
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
> and is captured in observation metadata at `session_flags.route_signature` --
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
+-- Datasets (16 live benchmark suites)
|   +-- benchmark-biomedical_optimization_v3             (297 items)
|   +-- benchmark-biomedical_holdout_v1                  (48 items)
|   +-- benchmark-biomedical_citation_context_v1         (24 items)
|   +-- benchmark-biomedical_narrative_v1                (36 items)
|   +-- benchmark-biomedical_expert_canonicalization_v1  (64 items)
|   +-- benchmark-biomedical_metadata_retrieval_v1       (36 items)
|   +-- benchmark-biomedical_evidence_type_v1            (16 items)
|   +-- benchmark-title_retrieval_v2                     (12 items)
|   +-- benchmark-clinical_evidence_v2                   (51 items)
|   +-- benchmark-passage_retrieval_v2                   (13 items)
|   +-- benchmark-adversarial_routing_v2                 (12 items)
|   +-- benchmark-keyword_search_v2                      (12 items)
|   +-- benchmark-abstract_stratum_v2                    (12 items)
|   +-- benchmark-question_evidence_v2                   (15 items)
|   +-- benchmark-semantic_recall_v2                     (12 items)
|   +-- benchmark-entity_relation_v2                     (12 items)
|
+-- Dataset Runs (one per benchmark execution)
|   +-- post-optimization-2026-04-05
|       +-- Per-item evaluations (40+ scores each)
|       +-- Run-level aggregates (avg_hit@1, p50, etc.)
|       +-- Linked traces (full RAG span tree)
|
+-- Traces (per benchmark item)
|   +-- experiment-item-run
|       +-- rag.search (GENERATION)
|       |   +-- rag.execute (SPAN)
|       |       +-- rag.retrieve (SPAN)
|       |       +-- rag.finalize (SPAN)
|       |           +-- rag.groundedAnswer (SPAN)
|       +-- Evaluations attached to trace
|
+-- Score Configs (28 registered dimensions)
|   +-- 9 retrieval metrics (hit_at_1, hit_at_k, mrr, routing_match, duration_ms, evidence_bundle_count, target_in_*)
|   +-- 2 answer quality (grounded_answer_present, faithfulness)
|   +-- 4 categorical (retrieval_profile, warehouse_depth, source_availability, source_system)
|   +-- 6 ingest quality (section/block/sentence/entity counts, has_abstract, has_title)
|   +-- 7 graph observability (point_count, cluster_count, bundle_bytes, build_duration, cluster_labeled/error/total)
|
+-- Annotation Queue: rag-failure-review
    +-- hit@1=0 traces for domain expert review
```

## Current Verification Snapshot (canonicalization-v1-2026-04-10)

Latest full-suite run:

```bash
cd engine && uv run python scripts/rag_benchmark.py \
    --all-benchmarks \
    --run canonicalization-v1-2026-04-10 \
    --use-suite-gates \
    --diagnose
```

Outcome:

- `16` suites completed
- `672` Langfuse-backed cases reviewed
- overall gate result: **failed**
- only gate failure: `benchmark-biomedical_evidence_type_v1`
  - `hit@1 = 1.000`
  - `p95_duration_ms = 294.319`
  - suite gate remains `<= 250 ms`

Latest post-change snapshot:

| Suite | Cases | hit@1 | hit@k | target_in_answer | p95 ms |
|-------|------:|------:|------:|-----------------:|-------:|
| `biomedical_optimization_v3` | 297 | 1.000 | 1.000 | 1.000 | 72.7 |
| `biomedical_holdout_v1` | 48 | 1.000 | 1.000 | 1.000 | 52.8 |
| `biomedical_citation_context_v1` | 24 | 1.000 | 1.000 | 1.000 | 119.3 |
| `biomedical_narrative_v1` | 36 | 0.167 | 0.361 | 0.278 | 362.8 |
| `biomedical_expert_canonicalization_v1` | 64 | 0.016 | 0.062 | 0.031 | 1040.4 |
| `biomedical_metadata_retrieval_v1` | 36 | 1.000 | 1.000 | 1.000 | 117.0 |
| `biomedical_evidence_type_v1` | 16 | 1.000 | 1.000 | 1.000 | 294.3 |
| `title_retrieval_v2` | 12 | 1.000 | 1.000 | 1.000 | 42.4 |
| `clinical_evidence_v2` | 51 | 0.039 | 0.137 | 0.098 | 441.7 |
| `passage_retrieval_v2` | 13 | 0.692 | 0.923 | 0.769 | 230.4 |
| `adversarial_routing_v2` | 12 | 0.000 | 0.083 | 0.000 | 388.3 |
| `keyword_search_v2` | 12 | 0.000 | 0.167 | 0.083 | 78.6 |
| `abstract_stratum_v2` | 12 | 0.000 | 0.000 | 0.000 | 284.0 |
| `question_evidence_v2` | 15 | 0.200 | 0.400 | 0.267 | 228.1 |
| `semantic_recall_v2` | 12 | 0.083 | 0.167 | 0.083 | 137.4 |
| `entity_relation_v2` | 12 | 0.500 | 0.667 | 0.667 | 301.6 |

Coverage note on 2026-04-11:

- the expert-suite metrics above are still the pre-backfill benchmark snapshot
- after the overnight archive-target campaign and residual recovery work, the
  live warehouse now gives `biomedical_expert_canonicalization_v1`:
  - `61` structure-complete
  - `63` grounding-ready
  - `2` entity-thin
  - `1` sparse
- earlier in the recovery work it was effectively `5 covered / 59 sparse`
- a full post-backfill benchmark rerun is still pending
- future expert-suite comparisons should separate score movement on the covered
  `61` structure-complete and `63` grounding-ready cases from the last
  source-bound sparse-case decision

What changed relative to `baseline-2026-04-10-expert-canonicalization`:

- existing suite hit-rate metrics stayed flat
- latency improved materially on the legacy general-retrieval suites
  - `passage_retrieval_v2` p95: `444.0 -> 230.4 ms`
  - `semantic_recall_v2` p95: `402.0 -> 137.4 ms`
  - `entity_relation_v2` p95: `580.1 -> 301.6 ms`
- the new expert canonicalization suite is now the clearest structural gap

Trace-backed interpretation:

- `vocab_concept_matches` metadata is now present on expert-suite traces
- `17 / 64` expert-suite cases produced non-empty vocab concept matches
- `0 / 17` of those matched traces reached `hit@1`

The implication is clean: concept recovery plumbing is live, but the current
alias bridge is not yet converting those recovered concepts into winning-paper
rank gains.

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
  +--------------+     +--------------+     +--------------+
  |  Run          |     |  Diagnose     |     |  Optimize     |
  |  Benchmarks   |---->|  Signals      |---->|  Code/Config  |
  |               |     |               |     |               |
  |  16 suites    |     |  Which        |     |  ranking       |
  |  672 items    |     |  channels     |     |  weights,      |
  |  Langfuse     |     |  fail?        |     |  thresholds,   |
  |  traces       |     |  fused_score  |     |  entity rules, |
  |               |     |  gap?         |     |  embeddings    |
  +--------------+     +--------------+     +------+-------+
         ^                                          |
         +------------------------------------------+
                    re-run to verify
```

1. **Run** benchmarks via `rag_benchmark.py --all-benchmarks`
2. **Read** results via Langfuse-backed review (`rag_benchmark.py --review-existing-run`)
3. **Diagnose** failures: which channels contribute to misses? what's the fused_score_gap?
4. **Optimize** the weakest channel (entity rules, ranking coefficients, dense model)
5. **Re-run** to verify improvement; quality gates catch regressions

The signal decomposition (16 scores per item) tells the agent exactly which
retrieval component to fix -- no guesswork needed.

## Retrieval Architecture Recommendations

Five evidence-based improvements organized by pipeline layer. Each operates
at a distinct stage to ensure non-overlapping, independent contributions.

```
Layer 1: COVERAGE   -> Do all documents have retrieval surfaces?
Layer 2: RECALL     -> Are all independent channels active for target queries?
Layer 3: FUSION     -> Are channel scores combined fairly?
Layer 4: RERANKING  -> Is cross-encoder precision applied broadly?
```

### Rec 1 -- COVERAGE: Abstract-only paper embeddings

| Dimension | Detail |
|-----------|--------|
| **Suite** | `abstract_stratum_v2` -- 0% hit@1, 8.3% hit@k |
| **Root cause** | `WHERE p.embedding IS NOT NULL` silently drops abstract-only papers from dense recall |
| **RAG principle** | Partial embedding coverage is a well-known silent retrieval failure in pgvector systems. Documents without embeddings are invisible to dense retrieval regardless of model quality. |
| **Action** | Ingest pipeline: populate SPECTER2 embeddings for abstract-only papers |
| **Files** | `repository_vector_search.py:48-52` (filter), ingest pipeline (embedding generation) |

### Rec 2 -- RECALL (entity): Lower entity enrichment skip thresholds

| Dimension | Detail |
|-----------|--------|
| **Suite** | `entity_relation_v2` -- entity_score=0% across all items |
| **Root cause** | `should_skip_runtime_entity_enrichment()` returns True when strong lexical anchors exist, skipping entity resolution entirely (`retrieval_policy.py:145-154`) |
| **RAG principle** | Multi-lane retrieval channels must run independently, not gate on each other's results. Gating entity recall on lexical success destroys complementarity. (Bruch et al., ACM TOIS 2023; RAG-Fusion 2024) |
| **Action** | Lower or remove the lexical-anchor gate so entity enrichment runs alongside lexical |
| **Files** | `retrieval_policy.py:145-154`, `search_retrieval.py:380-389` |
| **Independence** | Entity matching resolves structured biomedical CUIs -- orthogonal to term overlap (lexical) and semantic similarity (dense) |

### Rec 3 -- RECALL (dense): Decouple dense from title-lookup gating

| Dimension | Detail |
|-----------|--------|
| **Suite** | `adversarial_routing_v2` -- dense=0; lexical active (42%) |
| **Root cause** | Queries reclassified as TITLE_LOOKUP trigger `prefer_precise_grounding=True`, which gates dense via `should_run_dense_query()` (`retrieval_policy.py:168-169`) |
| **RAG principle** | Dense and lexical are complementary, not redundant. No hybrid search literature supports gating dense off when lexical succeeds. (Bruch et al. 2023) |
| **Action** | Allow dense + title retrieval simultaneously; decouple `prefer_precise_grounding` from dense gating |
| **Files** | `retrieval_policy.py:157-176`, `search_plan.py:59` |
| **Independence** | Dense handles semantic similarity -- orthogonal to entity's structured concept resolution (Rec 2) |

### Rec 4 -- FUSION: Remove ad-hoc dense_score 0.1x penalty

| Dimension | Detail |
|-----------|--------|
| **Suite** | `keyword_search_v2` -- 0% hit@1, 16.7% hit@k (found but not ranked) |
| **Root cause** | `dense_score *= 0.1` penalty for papers without direct passage support (`ranking.py:157-162`). This discards valid dense signals at the fusion layer. |
| **RAG principle** | Standard RRF is parameter-free beyond k. Ad-hoc multiplicative penalties based on what other channels contributed corrupts rank-based invariance. Fusion weights should be query-independent or learned. (Elastic WRRF; Benham 2017) |
| **Action** | Remove or reduce the 0.1x penalty; let fusion weights alone determine channel importance |
| **Files** | `ranking.py:157-162`, `ranking_support.py:24-47`, `ranking_support.py:124-174` |
| **Independence** | Operates at fusion layer -- Recs 2-3 activate recall channels; this ensures their signals aren't discarded during ranking |

### Rec 5 -- RERANKING: Broaden MedCPT cross-encoder activation

| Dimension | Detail |
|-----------|--------|
| **Suite** | `semantic_recall_v2` -- 0% hit@1, 0% hit@k |
| **Root cause** | `should_run_biomedical_reranker()` gates MedCPT to PASSAGE/QUESTION profiles with non-GENERAL clinical_intent (`retrieval_policy.py:305-327`), restricting it to a fraction of queries |
| **RAG principle** | BEIR benchmarks show cross-encoders achieve highest zero-shot nDCG@10 when applied universally. MedCPT (trained on 18M PubMed pairs) is a general-purpose biomedical reranker -- no evidence supports restricting it by query profile. (Thakur et al., NeurIPS 2021; Rosa et al. 2022) |
| **Action** | Enable MedCPT for all profiles with >= 3 candidates by relaxing conditions in `should_run_biomedical_reranker()` |
| **Files** | `retrieval_policy.py:305-327`, `biomedical_reranking.py:68-151` |
| **Independence** | Post-recall precision layer -- orthogonal to all recall channels and fusion; operates on the fused candidate set |

### Priority and Independence Summary

| # | Layer | Channel | Suite | Independence |
|---|-------|---------|-------|-------------|
| 1 | Coverage | Embeddings | abstract_stratum_v2 | Infrastructure -- no channel logic overlap |
| 2 | Recall | Entity | entity_relation_v2 | Structured CUI resolution, not term/semantic |
| 3 | Recall | Dense | adversarial_routing_v2 | Semantic similarity, not structured/term |
| 4 | Fusion | RRF weights | keyword_search_v2 | Ranking layer, not recall layer |
| 5 | Reranking | Cross-encoder | semantic_recall_v2 | Post-fusion precision, not recall or fusion |

---

_Last verified against code: 2026-04-08_
