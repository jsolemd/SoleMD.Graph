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

## Remaining miss

There is one top-1 miss in the full `v3` run:

- Corpus: `116587801`
- Title: `Meta‐analysis of brain‐derived neurotrophic factor p.Val66Met in adult ADHD in four European populations`
- Family: `sentence_global`
- Retrieval profile: `passage_lookup`
- Warehouse depth: `fulltext`
- Hit rank: `2`
- Query: `Attention-deficit hyperactivity disorder (ADHD) is a multifactorial, neurodevelopmental disorder that often persists into adolescence and adulthood and is characterized by inattention, hyperactivity and impulsiveness.`
- Trace: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/traces/23f7f7f880220f3e2dd98e1784c42237

This is a genuine ranking problem, not a benchmark-construction or ingest
problem.

## What changed

- Canonical paper titles now drive the optimization benchmark.
- The benchmark now uses the largest currently covered paper set instead of a
  paper-disjoint curated subset.
- Langfuse dataset item ids are stable per `benchmark_key + corpus_id + query_family`,
  so future refreshes update the benchmark cleanly instead of accumulating stale
  cases.
- `rag_benchmark.py` now has `--review-live` for run-scoped Langfuse review.

## Next optimization target

1. Fix the single ADHD `sentence_global` rank-2 miss. Accuracy loss is now
   concentrated in one passage-ranking case.
2. Reduce the remaining `sentence_global` long-tail latency, starting with the
   DCA/nomogram trace at `6217.1 ms`.
3. Only after that, update the `docs/map/*` current-state docs for this session.
