# Biomedical Optimization V3

## Why v3 exists

`biomedical_optimization_v2` was not a valid primary optimization benchmark.
The runtime-eval population builder preferred `solemd.paper_documents.title`
over canonical `solemd.papers.title`, which let structural headings leak into
the title benchmark. Four concrete artifacts in `v2` were:

- `23741869`: `Stroke types contributing to impairment`
- `27634567`: `Primary outcome: death or disability at 18 months`
- `84183536`: `Review of suggested apoE-driven mechanisms`
- `258637667`: `ECT - an ultrabrief history:`

`biomedical_optimization_v3` fixes that by resolving benchmark titles from
canonical paper metadata first and only falling back to document titles when
the canonical title is missing.

The same corpus ids now resolve to the expected paper titles:

- `23741869`: `Stroke injury, cognitive impairment and vascular dementia`
- `27634567`: `Neurological outcomes at 18 months of age after moderate hypothermia for perinatal hypoxic ischaemic encephalopathy: synthesis and meta-analysis of trial data`
- `84183536`: `ApoE4: an emerging therapeutic target for Alzheimer’s disease`
- `258637667`: `Electroconvulsive Therapy: Mechanisms of Action, Clinical Considerations, and Future Directions.`

## Benchmark shape

- Dataset: `benchmark-biomedical_optimization_v3`
- Snapshot: [biomedical_optimization_v3.json](/home/workbench/SoleMD/SoleMD.Graph/engine/data/runtime_eval_benchmarks/biomedical_optimization_v3.json)
- Covered papers: `82`
- Cases: `246`
- Families: `82 title_global`, `82 title_selected`, `82 sentence_global`
- Source mix: `82 biocxml`

This is the current fully covered benchmark surface. It is still not
corpus-wide. It is the covered full-text subset we can optimize against
without ingest confounding.

## Baseline Langfuse run

- Run name: `biomedical-optimization-v3-canonical-titles-2026-04-08 - 2026-04-09T00:23:10.644635Z`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/793447bf-33b9-46b0-bc65-372e376ce543

Overall:

- `hit@1`: `0.996`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `target_in_answer_corpus`: `1.000`
- `p50_duration_ms`: `470.0`
- `p95_duration_ms`: `22045.1`
- `p99_duration_ms`: `26712.2`
- `error_rate`: `0.000`

Family breakdown:

- `title_global`: `1.000 hit@1`, `1.000 hit@k`, `1.000 grounded`, `p50 518.4 ms`, `p95 22045.1 ms`
- `title_selected`: `1.000 hit@1`, `1.000 hit@k`, `1.000 grounded`, `p50 203.5 ms`, `p95 24820.7 ms`
- `sentence_global`: `0.988 hit@1`, `1.000 hit@k`, `1.000 grounded`, `p50 455.2 ms`, `p95 895.0 ms`

The accuracy picture is now essentially solved on the covered benchmark. The
remaining issue is latency, especially in the title families.

## Title fast-path optimization

Two runtime changes were applied against the live `benchmark-biomedical_optimization_v3`
dataset.

1. Unique title anchors now short-circuit seeded entity/relation search, dense
   search, and broad finalize-time enrichment.
2. Duplicate exact-title anchors no longer fall back to the full global seeded
   pipeline. They resolve entity terms once, then run local finalize-time
   entity matching only on the anchored duplicate set.

This keeps exact-title retrieval accurate while removing the title-lane entity
tax that was dominating the Langfuse traces.

### Fast-path v1

- Run name: `biomedical-optimization-v3-title-fastpath-2026-04-08 - 2026-04-09T02:29:09.753229Z`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/2233d863-da29-4af0-8d5c-e3ade3317918

Overall:

- `hit@1`: `0.996`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `71.4`
- `p95_duration_ms`: `367.1`
- `p99_duration_ms`: `952.2`

Family breakdown:

- `title_global`: `p50 52.8 ms`, `p95 328.2 ms`
- `title_selected`: `p50 46.3 ms`, `p95 141.3 ms`
- `sentence_global`: `p50 150.6 ms`, `p95 461.7 ms`

This removed the general title-lane latency problem, but one exact-title
collision still ran for `29979.7 ms`:

- `3470330`: `Diagnosis and management of dementia with Lewy bodies`
- Trace: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/traces/916212e591425f31175016611985e1e4

That trace showed the fast path was too aggressive for duplicate exact titles.
Skipping dense/entity globally was correct for unique anchors, but not for
collisions where two papers share the same title.

### Fast-path v2

- Run name: `biomedical-optimization-v3-title-fastpath-v2-2026-04-08 - 2026-04-09T02:46:48.624730Z`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/ce90933e-5f3e-4f5c-a710-5803bb4a097f

Overall:

- `hit@1`: `0.996`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `67.2`
- `p95_duration_ms`: `323.0`
- `p99_duration_ms`: `650.8`

Family breakdown:

- `title_global`: `p50 50.9 ms`, `p95 289.8 ms`
- `title_selected`: `p50 47.0 ms`, `p95 176.0 ms`
- `sentence_global`: `p50 122.5 ms`, `p95 397.4 ms`

The duplicate-title outlier is no longer a title-family tail risk:

- `Diagnosis and management of dementia with Lewy bodies` dropped from
  `29979.7 ms` in v1 to `650.8 ms` in v2 while keeping the benchmark target
  (`3470330`) at rank 1.
- Local replay confirmed the new path:
  - skips global dense search
  - skips global seeded entity search
  - resolves entity terms once
  - fetches entity matches only for the two anchored duplicate title papers

This is the current best live run for `benchmark-biomedical_optimization_v3`.

## Passage ranking repair

The remaining `sentence_global` miss was a real ranking defect, not a
benchmark-construction or ingest issue:

- Corpus: `116587801`
- Title: `Meta‐analysis of brain‐derived neurotrophic factor p.Val66Met in adult ADHD in four European populations`
- Trace: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/traces/23f7f7f880220f3e2dd98e1784c42237

Langfuse showed the failure mode clearly:

- the target had stronger integrated evidence
  - `chunk_lexical_score=0.461`
  - `citation_boost=3`
  - `passage_alignment_score=1.0`
  - `fused_score=0.8799`
- the winning paper was dense-only, but still counted as "direct" because its
  abstract/title alignment hit `0.72`
- the passage sort key then let raw `biomedical_rerank_score` override
  `fused_score`, which buried the target at rank `2`

Two runtime fixes resolved that:

1. passage/question ranking now distinguishes strong lexical/chunk support from
   weaker alignment-only support
2. title-anchor precedence was added inside passage/question sort so title-like
   queries that still route as `passage_lookup` keep title behavior

### Passage tier v1

- Run name: `biomedical-optimization-v3-passage-tier-v1-2026-04-08 - 2026-04-09T02:57:10.005661Z`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/28090c40-6367-4418-b60a-39eb8dd010e4

This fixed the ADHD `sentence_global` miss, but it was too broad: two
`title_global` cases that still routed as `passage_lookup` regressed to rank
`2`.

### Passage tier v2

- Run name: `biomedical-optimization-v3-passage-tier-v2-2026-04-08 - 2026-04-09T02:59:28.096601Z`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/9ea21843-0ad4-4b5b-a3b9-fd5b9f73b276

This repaired the title regressions while preserving the ADHD recovery:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `75.2`
- `p95_duration_ms`: `349.5`
- `p99_duration_ms`: `710.1`

At this point the covered optimization benchmark reached `100%` accuracy.

## Warmed benchmark runner

The worst remaining tail was a cold runtime path, not a steady-state one.

Langfuse trace `6c9bddde8610ae02d43519ddac19fb92` showed:

- `encode_dense_query=3238.6 ms`
- `search_query_embedding_papers=785.5 ms`
- `biomedical_reranker_ready=False`

The codebase already had the right native fix: `RagService.warm()`. The
benchmark runner simply was not calling it. The experiment path now warms the
service once when it is built, instead of measuring the first query against a
cold encoder/reranker path.

### Passage tier v3 warm

- Run name: `biomedical-optimization-v3-passage-tier-v3-warm-2026-04-08 - 2026-04-09T03:03:29.960793Z`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/8a5d68f0-e083-44ec-a46b-15b9ebed1bd9

Warmup removed the cold-start tail without changing quality:

- `hit@1`: `1.000`
- `p50_duration_ms`: `78.2`
- `p95_duration_ms`: `328.0`
- `p99_duration_ms`: `549.8`

The original `4779.4 ms` sentence outlier disappeared. After warmup, the slow
surface shifted to citation-heavy passage cases and duplicate-title
disambiguation.

## Citation-context pruning

The next slow case was the sleep-quality sentence query:

- Trace: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/traces/76632ee83d2ced0adcc0508916824960
- `fetch_citation_contexts_initial=701.9 ms`
- `fetch_citation_contexts_missing_top_hits=41.7 ms`
- `citation_context_ids=1`

The query was sending `19` unique citation terms into the context matcher. A
direct timing check on the live DB showed that bounding those terms helped
substantially for the same result set:

- all unique terms: `~632 ms`
- top `8` high-information terms: `~303 ms`
- top `6` high-information terms: `~250 ms`

The runtime now caps citation-context lookup to the top `8` high-information
terms (longest unique normalized terms, preserving original order among the
selected subset).

### Passage tier v4 citation terms

- Run name: `biomedical-optimization-v3-passage-tier-v4-citation-terms-2026-04-08 - 2026-04-09T03:07:25.409349Z`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/f5c13848-198f-4f8f-804e-c96e3344a91f

This is the current best live run:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `72.7`
- `p95_duration_ms`: `258.7`
- `p99_duration_ms`: `482.3`

Family breakdown:

- `sentence_global`: `1.000 hit@1`, `p50 122.6 ms`, `p95 306.1 ms`
- `title_global`: `1.000 hit@1`, `p50 55.4 ms`, `p95 258.7 ms`
- `title_selected`: `1.000 hit@1`, `p50 45.2 ms`, `p95 183.3 ms`

The previously slow sleep-quality case dropped from `840.5 ms` to `482.3 ms`
while keeping the same retrieval outcome.

## What changed

- Canonical paper titles now drive the optimization benchmark.
- The benchmark now uses the largest currently covered paper set instead of a
  paper-disjoint curated subset.
- Langfuse dataset item ids are stable per `benchmark_key + corpus_id + query_family`,
  so future refreshes update the benchmark cleanly instead of accumulating stale
  cases.
- `rag_benchmark.py` now has `--review-live` for run-scoped Langfuse review.
- Passage/question ranking now treats chunk/lexical-backed evidence as stronger
  than alignment-only support and lets title anchors recover title-like queries
  that still route through passage lookup.
- The Langfuse benchmark runner now warms `RagService` before timed execution.
- Citation-context lookup now uses a bounded high-information term subset
  instead of the full long-query token list.

## Next optimization target

1. Investigate duplicate-title entity disambiguation cost on
   `Diagnosis and management of dementia with Lewy bodies`
   (`fetch_entity_matches=510 ms`).
2. Review the new worst `sentence_global` tail at
   `32419070` (`791.7 ms`) before widening the benchmark further.
3. Only after that, update the `docs/map/*` current-state docs for this session.
