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
- Covered papers: `99`
- Cases: `297`
- Families: `99 title_global`, `99 title_selected`, `99 sentence_global`
- Source mix: `99 biocxml`

This is the current fully covered benchmark surface. It is still not
corpus-wide. It is the covered full-text subset we can optimize against
without ingest confounding.

## Authoritative Langfuse dataset sync

`biomedical_optimization_v3` and `biomedical_holdout_v1` are now published as
authoritative Langfuse datasets instead of append-only snapshots.

- `benchmark-biomedical_optimization_v3`: `297` live items
- `benchmark-biomedical_holdout_v1`: `48` live items
- stale dataset items are pruned during publish
- oversized dataset metadata is stripped before experiment execution

This matters because the earlier live optimization dataset had accumulated stale
items. The current Langfuse runs below are against the real benchmark
population, not a polluted superset.

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

## Current-map scope optimization

The next remaining tail was not a model issue. It was a database scope issue.

The entity and relation seed queries were rebuilding the current corpus scope
from `solemd.graph_points` on every request:

- `graph_scope AS MATERIALIZED (SELECT DISTINCT corpus_id FROM solemd.graph_points ...)`

On the live warehouse, that meant materializing roughly `2.45M` current-map
papers before the actual entity or relation join work began. The clean fix was
to use the already published current-map membership in `solemd.corpus` and
route current-graph searches through `is_in_current_map` instead of rebuilding
the same scope from `graph_points`.

Live `EXPLAIN ANALYZE` on April 9, 2026:

- exact entity search (`Alzheimer disease`): `1798.3 ms -> 14.9 ms`
- relation search (`positive_correlate`): `2235-2515 ms -> 689-892 ms`

The improvement also showed up in the real RAG service:

- `Transgenic mice overexpressing the 695-amino acid isoform ...`
  - prior `search_entity_papers`: roughly `1.5–1.7 s`
  - current `search_entity_papers`: `70.4 ms`
  - current `retrieve_search_state`: `121.9 ms`

This is a structural change, not a title-specific heuristic. It removes
redundant current-graph scope reconstruction from the entity and relation lanes.
No schema change was needed because `solemd.idx_corpus_current_map` already
existed in the live warehouse.

### Current best optimize run

- Run name: `biomedical-optimization-v3-current-map-currentgraph-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/21ff7a4a-95b7-4867-8d45-ddd3b602a9e8

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `target_in_answer_corpus`: `1.000`
- `p50_duration_ms`: `49.5`
- `p95_duration_ms`: `117.1`
- `p99_duration_ms`: `184.9`

Family breakdown:

- `sentence_global`: `1.000 hit@1`, `p50 96.6 ms`, `p95 159.9 ms`
- `title_global`: `1.000 hit@1`, `p50 41.8 ms`, `p95 107.1 ms`
- `title_selected`: `1.000 hit@1`, `p50 40.3 ms`, `p95 56.3 ms`

Relative to the prior best optimize run (`passage-tier-v4-citation-terms`),
this kept the same perfect accuracy while collapsing the optimize tail from
`p99 482.3 ms -> 184.9 ms`. The median and p95 stayed in the same steady-state
band, but the old entity/title outlier class disappeared from the top of the
Langfuse review.

### Holdout confirmation

- Run name: `biomedical-holdout-v1-current-map-currentgraph-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/6f835888-4fa5-41af-8a12-84738a897c9f

Overall:

- `cases`: `48`
- `distinct_papers`: `48`
- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `99.1`
- `p95_duration_ms`: `368.6`
- `p99_duration_ms`: `565.6`

This is the key anti-overfitting check. The same structural DB change that
improved the `297`-case optimize set held on a paper-disjoint holdout set with
no accuracy loss. The current slow holdout traces are now a different
sentence/title class, not the old current-graph entity-scope pathology.

## Chunk-title anchor recovery

The next latency class was a route-resolution gap, not a reranker problem.

Langfuse showed exact title-like queries could still stay in `passage_lookup`
when the paper first surfaced through chunk lexical retrieval instead of
paper-level lexical retrieval. The runtime already treated chunk hits as direct
support for selected-paper anchoring, but title-anchor promotion only inspected
`lexical_hits`.

That asymmetry caused title-like queries such as:

- `Health-Related Quality of Life is Impacted by Proximity to an Airport in Noise-Sensitive People`

to miss precise title resolution even when chunk retrieval had already found the
right paper. The runtime then paid dense, rerank, and finalize cost for what
should have been a cheap title resolution.

The fix is structural:

- exact/strong title anchors recovered from chunk lexical paper hits now count
  the same way as paper-level lexical anchors for route promotion and dense/seed
  suppression

Local replay of the airport title case after the change:

- `retrieval_profile: passage_lookup -> title_lookup`
- `precise_title_resolution: False -> True`
- `dense_query_hits: 0`
- `duration: 121.9 ms -> 55.2 ms`

### Holdout run

- Run name: `biomedical-holdout-v1-chunk-title-anchor-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/710335bf-3f90-4240-9230-02b37d79d293

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `89.8`
- `p95_duration_ms`: `154.4`
- `p99_duration_ms`: `291.4`

Family breakdown:

- `title_global`: `24/24` now route as `title_lookup`, `p50 49.0 ms`, `p95 82.5 ms`
- `sentence_global`: `p50 110.0 ms`, `p95 154.4 ms`

Relative to the prior current-map holdout run, this kept perfect accuracy while
moving holdout `routing_match` from `0.625 -> 1.000` and cutting holdout
latency from `p95 368.6 ms -> 154.4 ms`.

### Optimize run

- Run name: `biomedical-optimization-v3-chunk-title-anchor-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/6f1d4678-5be3-4801-8b26-0de9bd855450

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `49.4`
- `p95_duration_ms`: `117.9`
- `p99_duration_ms`: `194.8`

Optimize did not materially change overall steady-state latency, but it did fix
the remaining title-family routing leakage:

- `title_global`: `98/99` `title_lookup`, `p95 60.9 ms`
- optimize `routing_match`: `0.995`

At this point the title-family work is in a good state. The slow surface has
shifted again into sentence-style cases.

## Exact-title rescue

One title-family false-negative class still remained after chunk-title anchor
recovery: long canonical biomedical titles that looked too sentence-like for
the old exact-title precheck.

The old gate rejected some real titles because it required a tighter
title-shape heuristic around punctuation and prose-clause signals. That kept
queries such as:

- `Health-Related Quality of Life is Impacted by Proximity to an Airport in Noise-Sensitive People`
- `Lifetime and 12-month prevalence of DSM-III-R psychiatric disorders in the United States. Results from the National Comorbidity Survey.`

out of the cheap exact-title path even though exact-title lookup was the right
native route.

The fix is structural:

- exact-title precheck now accepts longer canonical biomedical titles with
  terminal punctuation and clause-like wording instead of forcing them through
  passage or dense recovery first

### Holdout run

- Run name: `biomedical-holdout-v1-exact-title-rescue-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/5aff445b-c60a-45f3-a941-791faaf8edac

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `82.0`
- `p95_duration_ms`: `130.9`
- `p99_duration_ms`: `358.6`

This kept the paper-disjoint holdout perfect while tightening the title-family
tail further:

- `title_global`: `24/24` `title_lookup`, `p95 76.1 ms`

### Optimize run

- Run name: `biomedical-optimization-v3-exact-title-rescue-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/d0e7087a-078a-4291-b20e-0ab33deafc43

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `49.6`
- `p95_duration_ms`: `124.1`
- `p99_duration_ms`: `234.3`

The title-family route is now in good shape. The remaining latency surface is
mostly sentence-style passage work and title-like sentence fragments that still
need disambiguation.

## Biomedical reranker ambiguity gate

The next structural issue was in `sentence_global`, not titles.

Holdout inspection on April 9, 2026 showed that the live biomedical reranker
was still firing on `23/48` holdout cases even though those cases were already
resolved by direct passage support:

- all `23` were `sentence_global`
- all `23` already had the target at rank `1`
- all `23` had a chunk-backed top paper
- `22/23` had a dense-only runner-up

That is not a ranking-quality problem. It is redundant work. The reranker was
being activated because the candidate pool was large enough, even when there was
already a stable direct-support leader and no competing direct-support rival.

The fix is structural:

- passage/question reranking now checks whether the top shortlist already has a
  single tier-2 direct-support leader
- if the nearest top-window competitors are weaker dense/alignment papers, the
  reranker is skipped
- Langfuse/debug traces now record `biomedical_rerank_reason` so this decision
  is visible in runtime reviews

Representative local replay:

- corpus `220883733`
  - before: reranker ran on a chunk-backed winner with dense-only runner-ups
  - after: `biomedical_rerank_reason=stable_direct_passage_leader`
  - service time: `83.7 ms -> 70.1 ms`
- corpus `4919542`
  - reranker still runs because a second direct-support competitor remains
  - `biomedical_rerank_reason=candidate_ambiguity`

### Optimize run

- Run name: `biomedical-optimization-v3-rerank-ambiguity-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/8abc4249-cdd1-46f1-8772-19c051b12d6b

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `45.7`
- `p95_duration_ms`: `97.3`
- `p99_duration_ms`: `162.0`

Family breakdown:

- `sentence_global`: `1.000 hit@1`, `p50 76.4 ms`, `p95 142.6 ms`
- `title_global`: `1.000 hit@1`, `p50 40.6 ms`, `p95 60.7 ms`
- `title_selected`: `1.000 hit@1`, `p50 38.9 ms`, `p95 52.8 ms`

### Holdout run

- Run name: `biomedical-holdout-v1-rerank-ambiguity-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/644d247b-61a1-4b88-812e-c152cade5003

Overall:

- `cases`: `48`
- `distinct_papers`: `48`
- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `69.1`
- `p95_duration_ms`: `110.8`
- `p99_duration_ms`: `233.5`

This is the current best holdout run and the current best optimize run. The
change improved both datasets without giving back accuracy, which is the signal
we want for a structural backend policy fix.

## Support-aware dense gate

The next structural question was whether passage-style sentence queries were
still paying for dense ANN even after cheap direct-support retrieval had already
resolved the shortlist.

Local replay and holdout review showed that the answer was yes:

- the stable passage case `220883733` had one chunk-backed target and no real
  direct-support rivals, but still opened dense ANN before the gate existed
- the dense lane then widened the candidate frontier and sometimes created
  work for the reranker and finalize stages that the chunk-backed winner did not
  need

The fix is structural:

- dense ANN is now gated by the same direct-support principle used for reranking
- passage/question queries only open dense ANN when cheap lexical/chunk support
  is weak or ambiguous
- traces now record `dense_query_reason` for the runtime decision

Representative local replay:

- corpus `220883733`
  - before: `dense_query_hits=10`, service `~83.7 ms`
  - after: `dense_query_requested=False`, `dense_query_reason=stable_direct_passage_leader`, service `49.5 ms`
- corpus `4919542`
  - dense stays enabled because there are multiple direct-support candidates
  - `dense_query_reason=candidate_recovery`

### Optimize run

- Run name: `biomedical-optimization-v3-dense-ambiguity-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/a2f440f1-56f1-49b5-afa4-8b1e85c9182c

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `44.2`
- `p95_duration_ms`: `63.5`
- `p99_duration_ms`: `251.3`

Family breakdown:

- `sentence_global`: `1.000 hit@1`, `p50 50.3 ms`, `p95 115.4 ms`
- `title_global`: `1.000 hit@1`, `p50 40.0 ms`, `p95 57.0 ms`
- `title_selected`: `1.000 hit@1`, `p50 39.0 ms`, `p95 52.6 ms`

This is the current best optimize run.

### Holdout runs

- Run name: `biomedical-holdout-v1-dense-ambiguity-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/20ecb5ce-181d-4836-a334-a70f684503cf
- Recheck run: `biomedical-holdout-v1-dense-ambiguity-recheck-2026-04-09`
- Recheck dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/0acbcc8e-3ff2-4e8e-a7f5-3b373d3d663d

Holdout remained perfect in both runs:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`

Latency profile:

- first run: `p50 49.5 ms`, `p95 118.4 ms`, `p99 1193.7 ms`
- recheck: `p50 46.6 ms`, `p95 118.2 ms`, `p99 740.5 ms`

Interpretation:

- the dense gate is accepted because optimize improved materially and holdout
  kept perfect accuracy with a much better median latency
- the holdout p95 stayed in the same band as the pre-change reranker-gate run
- one title-like sentence case (`32419070`) remains a volatile outlier and is
  now the clearest next structural target

## Dense-query HNSW split

The next cleanup target was architectural rather than algorithmic.

Dense ANN query search and semantic-neighbor search were both using the same
session-level HNSW settings even though they are different retrieval lanes with
different latency and recall constraints. That coupling was not clean:

- semantic neighbors are selected-paper adjacency probes
- dense query search is broad candidate recovery for free-form query text

The code path had both lanes sharing:

- `rag_semantic_neighbor_hnsw_ef_search`
- `rag_semantic_neighbor_hnsw_max_scan_tuples`
- `rag_semantic_neighbor_exact_parallel_workers`

The fix is structural:

- dense query search now has its own HNSW and exact-search settings
- semantic neighbors keep the existing semantic-neighbor settings
- Langfuse trace flags now record the dense ANN session knobs alongside
  `dense_query_route` and `dense_query_candidate_limit`

Accepted dense-query defaults:

- `rag_dense_query_hnsw_ef_search=32`
- `rag_dense_query_hnsw_max_scan_tuples=8000`
- `rag_dense_query_exact_parallel_workers=4`

### What the DB timing showed

The key result from direct DB profiling on April 9, 2026 is that the shared
HNSW settings were not the root cause of the `32419070` holdout outlier.

Direct `EXPLAIN (ANALYZE)` on the ANN SQL for the `32419070` sentence query:

- `ef_search=60`, `max_scan_tuples=20000`: `~3.3 ms` average after warmup
- `ef_search=40`, `max_scan_tuples=12000`: `~1.0 ms`
- `ef_search=32`, `max_scan_tuples=8000`: `~0.7 ms`
- `ef_search=24`, `max_scan_tuples=6000`: `~0.7 ms`
- `ef_search=16`, `max_scan_tuples=4000`: `~0.6 ms`

Full repository-path timing on the same query:

- warm path: `~4-5 ms` across all tested settings
- cold path after `db.close_pool()`: `~689-705 ms` across all tested settings

Interpretation:

- the dense ANN operator is already cheap once the DB/session path is warm
- lower dense HNSW settings are a valid cleanup and slightly reduce the warm
  path cost
- the persistent `32419070` p99 spike is not explained by the old shared HNSW
  knobs; it remains a query-class/runtime-path issue

### Optimize run

- Run name: `biomedical-optimization-v3-dense-hnsw-split-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/4815f697-ed16-4612-9aa9-f595ce4888fc

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `44.2`
- `p95_duration_ms`: `65.3`
- `p99_duration_ms`: `250.3`

Family breakdown:

- `sentence_global`: `1.000 hit@1`, `p50 50.1 ms`, `p95 117.8 ms`
- `title_global`: `1.000 hit@1`, `p50 39.7 ms`, `p95 60.1 ms`
- `title_selected`: `1.000 hit@1`, `p50 39.5 ms`, `p95 53.3 ms`

This kept optimize perfect and stayed in the same latency band as the accepted
dense-gate run, with a small `p99` improvement.

### Holdout run

- Run name: `biomedical-holdout-v1-dense-hnsw-split-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/aa01274c-e484-4c15-a082-4f0cea652b86

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `45.5`
- `p95_duration_ms`: `113.6`
- `p99_duration_ms`: `898.8`

Interpretation:

- the split is accepted because it is the clean architecture for the dense lane
  and it preserved perfect optimize + holdout accuracy
- holdout `p50` and `p95` improved slightly
- holdout `p99` remained dominated by the same `32419070` outlier, which
  confirms that the next fix needs to target the title-like sentence ambiguity
  path rather than shared ANN session settings

## What changed

- Canonical paper titles now drive the optimization benchmark.
- The benchmark now uses the largest currently covered paper set instead of a
  paper-disjoint curated subset.
- Langfuse dataset publishing is now authoritative: stable item ids, stale-item
  pruning, and stripped oversized metadata.
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
- Current-graph entity and relation search now use `solemd.corpus.is_in_current_map`
  instead of reconstructing graph scope from `solemd.graph_points` on every request.
- Exact/strong title anchors recovered through chunk lexical paper hits now
  trigger title-route promotion and suppress unnecessary dense/seed expansion.
- Exact-title precheck now admits canonical long biomedical titles that were
  previously misclassified as prose-like queries.
- Passage/question reranking now only runs when the shortlist remains ambiguous
  among direct-support candidates, and runtime traces expose the rerank reason.
- Passage/question dense ANN now only runs when cheap direct-support retrieval
  is weak or ambiguous, and runtime traces expose the dense-gating reason.
- Dense query ANN now has its own HNSW and exact-search settings instead of
  inheriting the semantic-neighbor session knobs, and traces expose the dense
  ANN session configuration used for each run.

## Next optimization target

1. Move title-like sentence disambiguation toward shortlist-local entity and
   citation scope, starting with the `32419070` class.
2. Review the remaining title-family outliers such as `81621267` and
   `222319232` to confirm whether they are true pathologies or runtime variance.
3. Keep optimize and holdout Langfuse runs paired for every structural change.
4. Only after the backend optimization session stabilizes, update the
   `docs/map/*` current-state docs.

## 2026-04-09 grounded-answer packet simplification

The next accepted backend improvement was not another retrieval-route tweak. It
was a grounded-answer warehouse change.

### Problem

For exact-title and other entity-only grounded answers, the runtime was still
executing the heavier entity packet query shape:

- requested packet CTE
- exact packet entity branch
- fallback packet branch
- `UNION ALL`

That shape is correct when citation packet keys exist, but it is unnecessary
when citation lookup returns zero packet keys. In those cases the runtime only
needs the fallback entity packet branch.

Local traces showed this clearly on exact-title cases such as `13826013` and
`219104019`:

- before: `grounded_answer_fetch_chunk_packets` about `14-17 ms`
- after: `grounded_answer_fetch_chunk_packets` about `7.4-7.6 ms`

This is a structural backend improvement because it reduces planner and query
work for the whole `no citation packets` class instead of adding a title-shaped
special case.

### Implementation

- `app/rag/chunk_grounding.py`
  - added `CHUNK_ENTITY_FALLBACK_PACKET_SQL`
  - `fetch_chunk_grounding_rows()` now dispatches to the fallback-only entity
    query whenever citation packet lookup returns no packet keys
- `test/test_rag_grounded_runtime.py`
  - added regression coverage for both branches:
    - fallback-only entity packet query when citations are absent
    - full requested-packet entity query when citations are present

### Langfuse runs

Optimize:

- Run name: `biomedical-optimization-v3-grounded-entity-fallback-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/8a41eb94-2a8c-4c7b-854d-0a0af311451c

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `35.4`
- `p95_duration_ms`: `54.7`
- `p99_duration_ms`: `172.4`

Important slices:

- `sentence_global`: `1.000 hit@1`, `p50 41.6 ms`, `p95 113.9 ms`
- `title_global`: `1.000 hit@1`, `p50 32.5 ms`, `p95 45.8 ms`
- `title_selected`: `1.000 hit@1`, `p50 30.0 ms`, `p95 44.3 ms`

Holdout:

- Run name: `biomedical-holdout-v1-grounded-entity-fallback-2026-04-09`
- Dataset run: http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/3daeff76-825e-4bc1-8af3-2645d13524c6

Overall:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `grounded_answer_rate`: `1.000`
- `p50_duration_ms`: `40.5`
- `p95_duration_ms`: `61.7`
- `p99_duration_ms`: `248.2`

Important slices:

- `sentence_global`: `1.000 hit@1`, `p50 43.7 ms`, `p95 122.8 ms`
- `title_global`: `1.000 hit@1`, `p50 36.9 ms`, `p95 54.2 ms`

### Title lookup interpretation

Title lookup remains important, but only as a precision guardrail:

- copied citation titles
- guideline titles
- quoted paper headings
- near-exact article-name lookups

It should not be the main product optimization target. The main biomedical
product slice is still non-title retrieval:

- passage lookup
- entity/relation-seeded retrieval
- dense recovery
- shortlist reranking

To keep that distinction explicit in the tooling:

- `langfuse_run_review.py` now emits `title_queries` and `non_title_queries`
  focus buckets
- `rag_benchmark.py` now exposes those numeric review metrics to quality gates

That makes it possible to gate future work on metrics such as:

- `non_title_hit_at_1`
- `non_title_grounded_answer_rate`
- `non_title_p95_duration_ms`

without weakening title-route safety.

### Current next target

The remaining meaningful latency work is in real product traffic:

1. `sentence_global` ambiguity cases such as `4919542`
2. occasional live variance on long sentence queries
3. further grounded-answer simplification only if it benefits the broader
   non-title path, not just title guardrails

## 2026-04-09 metadata spine priors and observability

The next accepted improvement promoted underused study metadata from passive
fields into bounded runtime signals and observability.

### Problem

The runtime already carried several structurally useful paper fields:

- `influential_citation_count`
- `reference_count`
- `text_availability`
- `is_open_access`
- `publication_types`
- `fields_of_study`

But most of that information was effectively inert:

- ranking mostly only used `citation_count` as a weak tie-break
- API serialization dropped several of the richer paper fields
- Langfuse top-bundle traces did not expose enough metadata to explain why a
  paper won

This was not a retrieval-benchmark miss yet, but it was a real architectural
gap relative to the biomedical RAG quality target.

### Implementation

- `app/rag/ranking_support.py`
  - added low-weight citation/reference spine and grounding-readiness priors
    inside evidence quality scoring
  - guarded those new priors away from `title_lookup` so exact-title precision
    stayed title-first
- `app/rag/schemas.py`
- `app/rag/response_serialization.py`
  - surfaced richer paper metadata through the API response
- `app/rag/service.py`
  - extended Langfuse `top_bundles` metadata with journal, publication type,
    citation/reference counts, text availability, and per-bundle structural
    counts
- `test/test_rag_ranking.py`
- `test/test_rag_response_serialization.py`
  - added regression coverage for both the bounded metadata prior and the
    richer serialization surface

### Langfuse runs

First pass with the metadata priors applied globally:

- Optimize run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/fb116a52-aaf7-4bbd-9681-5693a5086d1d
- Result:
  one `title_global` regression (`14975420`, rank 2)

That regression was useful, not incidental. It showed that citation/reference
authority priors should not interfere with exact-title precision. The accepted
version therefore kept the metadata priors for non-title ranking only.

Accepted optimize run:

- Run name:
  `biomedical-optimization-v3-metadata-spine-v2-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/bba0aa17-297e-40fd-94a6-cb66a4943265

Accepted holdout run:

- Run name:
  `biomedical-holdout-v1-metadata-spine-v2-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/40d55373-d3b0-4d39-b112-610a64454864

Accepted results:

- optimize: `297/297`, `hit@1 1.000`, `grounded 1.000`, `non_title hit@1 1.000`,
  `p50 36.2 ms`, `p95 54.7 ms`
- holdout: `48/48`, `hit@1 1.000`, `grounded 1.000`, `non_title hit@1 1.000`,
  `p50 42.8 ms`, `p95 64.8 ms`

### Interpretation

This change is accepted because it is structural and general:

- it promotes citation/reference/full-text metadata into bounded ranking priors
- it improves Langfuse observability for why papers win
- it preserves the rule that title lookup should be driven by title evidence,
  not authority drift

## 2026-04-09 section-aware passage scoring

The next accepted improvement promoted section role and block kind into
passage-time ranking.

### Problem

The warehouse and chunk model already knew whether a matching chunk came from:

- `results`
- `discussion`
- `conclusion`
- `methods`
- `front_matter`
- `reference`

and whether it was a narrative paragraph versus a caption/table surface.

The runtime passage ranker ignored that structure. In practice that means a
methods table caption and a results paragraph could compete on lexical signal
alone even though they are not equally useful evidence surfaces.

### Implementation

- `app/rag/_queries_chunk_search.py`
  - now carries `chunk_section_role` and `chunk_primary_block_kind` through the
    chunk-search result rows
- `app/rag/models.py`
- `app/rag/repository.py`
- `app/rag/schemas.py`
- `app/rag/response_serialization.py`
  - now preserve those chunk-structure fields end to end
- `app/rag/ranking_support.py`
  - added bounded passage/question-only structure priors:
    - positive for evidence-bearing sections such as `results`, `discussion`,
      `conclusion`
    - negative for low-evidence surfaces such as `methods`, `reference`,
      `front_matter`, and non-narrative table/caption blocks
- `app/rag/ranking.py`
  - now incorporates `passage_structure_score` into passage/question fused
    ranking
- `app/rag/bundle.py`
  - now emits `passage_structure` in bundle rank features
- `test/test_rag_ranking.py`
  - added a direct regression case showing results/narrative passage evidence
    outranks methods/table evidence when lexical support is otherwise similar

### Langfuse runs

Accepted optimize run:

- Run name:
  `biomedical-optimization-v3-section-aware-v1-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/30719eb6-f4c8-4a77-8513-e25e65da0c43

Accepted holdout run:

- Run name:
  `biomedical-holdout-v1-section-aware-v1-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/c4dd61f5-7e24-4562-8a9e-662b0261366e

Accepted results:

- optimize: `297/297`, `hit@1 1.000`, `grounded 1.000`, `non_title hit@1 1.000`,
  `p50 35.5 ms`, `p95 56.5 ms`
- holdout: `48/48`, `hit@1 1.000`, `grounded 1.000`, `non_title hit@1 1.000`,
  `p50 41.5 ms`, `p95 68.7 ms`

### Interpretation

This is the kind of structural improvement the biomedical RAG literature
supports:

- section role becomes a first-class ranking input
- narrative evidence-bearing chunks are preferred over low-information surfaces
- the change stays bounded to passage/question retrieval rather than bleeding
  into title disambiguation

### Next structural targets

The remaining clean backend gaps are now clearer:

1. make `cited_corpus_ids` a real retrieval prior instead of dead request shape
2. promote `references` beyond display-only bundle metadata
3. bring `authors` into the runtime model and retrieval surface
4. consider using section role inside chunk candidate selection itself, not only
   final paper ranking

## 2026-04-09 study metadata coverage instrumentation

The author/journal/year surface had already been promoted into the response and
answer layers, but Langfuse did not measure whether those fields were actually
present on the evidence bundles users would see.

### Implementation

- `app/langfuse_config.py`
  - added score keys for `display_author_coverage`,
    `display_journal_coverage`, `display_year_coverage`, and
    `display_study_metadata_coverage`
- `app/rag_ingest/eval_langfuse.py`
  - registered the new numeric score configs and cleaned the score-config
    builder layout
- `app/rag_ingest/experiment.py`
  - now computes coverage across the displayed top evidence bundles and emits
    the four new per-item Langfuse scores
- `app/rag_ingest/langfuse_run_review.py`
  - now aggregates those metrics globally and inside the existing family /
    partition / focus slices
- `test/test_rag_langfuse_benchmark_plumbing.py`
- `test/test_rag_langfuse_run_review.py`
  - added regression coverage for emission and review aggregation

### Langfuse runs

Accepted optimize run:

- Run name:
  `biomedical-optimization-v3-study-metadata-metrics-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/a2be1065-ab82-47be-bbac-4c80d1c8219c

Accepted holdout run:

- Run name:
  `biomedical-holdout-v1-study-metadata-metrics-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/ffe8c346-c995-4c44-bdf6-276c4d0b5e88

Accepted results:

- optimize: `297/297`, `hit@1 1.000`, `grounded 1.000`,
  `display_study_metadata 1.000`, `non_title display_study_metadata 1.000`
- holdout: `48/48`, `hit@1 1.000`, `grounded 1.000`,
  `display_study_metadata 1.000`, `non_title display_study_metadata 1.000`

### Interpretation

This was not a retrieval change. It was the measurement needed to enforce an
OpenEvidence-style presentation bar inside Langfuse itself:

- returned studies should carry enough identity metadata to cite cleanly
- that guarantee should be visible on optimize and holdout, not inferred
- title lookup remains a guardrail, but study metadata coverage is now measured
  directly on the displayed evidence surface

## 2026-04-09 long-query chunk retrieval cleanup

The remaining hot-path latency was concentrated in non-title `sentence_global`
retrieval. Local traces showed that `_run_chunk_search()` stops on the first
chunk query that returns hits, so chunk-query ordering was directly controlling
steady-state latency.

### Problem

The original fallback policy always put the full normalized sentence first, then
sorted 3-4 token phrase windows. That left clear latency on the table for long
biomedical sentences where a shorter high-information phrase could land the
target immediately.

The first attempt at reordering exposed two real failure modes:

1. discourse-heavy lead-ins such as `these results suggest that` were being
   treated as specific
2. fragmented acronym windows from dotted surfaces such as `M.I.N.I.` were
   being surfaced as low-quality chunk fallbacks

Those failures were useful. They forced the accepted version to be more
structural:

- prioritize phrase-first search only for genuinely long, non-statistical
  passage/question queries
- penalize discourse-heavy phrases in fallback ordering
- drop fragmented acronym shard phrases from the fallback list entirely
- preserve the full normalized query first when the normalized surface itself
  contains a broken single-character acronym run

### Implementation

- `app/rag/retrieval_policy.py`
  - added long-query phrase-first chunk retrieval for bounded passage/question
    cases
  - added discourse penalties for low-information lead-in phrases
  - added fragmented-acronym guards to both prioritization and fallback phrase
    generation
- `test/test_rag_retrieval_policy.py`
  - added regression coverage for:
    - long biomedical sentence phrase-first retrieval
    - discourse lead-in demotion
    - fragmented acronym shard suppression
    - clinical comparator phrase prioritization

### Local profiling notes

Representative hot-run improvements after warming:

- `The maturity of secretory and target cells ... influence glial proliferation`
  - from the earlier `~154-184 ms` hot path to `~33-49 ms`
  - chunk search now lands on the first high-information phrase:
    `influence glial proliferation activation`
- `These results suggest that the plateau amplitude in TEA ...`
  - discourse phrase cleanup moved the hot run to `~50 ms`
  - chunk search now starts at `amplitude in tea reflects`
- `Other potential mechanisms, such as the differential modulation of
  neurotoxicity ...`
  - hot run moved to `~34 ms`
  - chunk search now starts at `differential modulation of neurotoxicity`
- `The authors describe the development of the M.I.N.I. ...`
  - the fragmented acronym cleanup restored the correct target paper and
    removed `m i n i` shard prioritization from the chunk fallback path

### Langfuse runs

Rejected first pass:

- Run name:
  `biomedical-optimization-v3-long-query-chunk-priority-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/5b7067b5-0bc0-405d-bbd6-11348836f67a
- Result:
  quality stayed perfect, but optimize `p95` remained too loose (`~89.8 ms`)
  and several sentence traces still prioritized narrative lead-ins

Rejected second pass:

- Run name:
  `biomedical-optimization-v3-long-query-chunk-priority-v2-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/5055b91c-75ab-4c2f-be1f-0155668e7c41
- Result:
  optimize latency improved (`p95 ~69.4 ms`) but one real sentence miss
  appeared on the `M.I.N.I.` case, which exposed the fragmented-acronym
  fallback defect

Accepted optimize run:

- Run name:
  `biomedical-optimization-v3-long-query-chunk-priority-v3-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/f7edc1dc-e06d-4a78-91cc-2194f355e1c6

Accepted holdout run:

- Run name:
  `biomedical-holdout-v1-long-query-chunk-priority-v3-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/1ffa7166-7d11-43a8-bb2b-6c5ac2f4caf0

Accepted citation-context run:

- Run name:
  `biomedical-citation-context-v1-long-query-chunk-priority-v3-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnrsj7fr00ngkt078aqv47he/runs/c8a18e07-cc7e-40e2-9da5-c75a8a5ad386

Accepted results:

- optimize: `297/297`, `hit@1 1.000`, `grounded 1.000`, `p50 36.2 ms`,
  `p95 59.9 ms`, `p99 204.1 ms`, `sentence_global p95 112.4 ms`
- holdout: `48/48`, `hit@1 1.000`, `grounded 1.000`, `p50 40.3 ms`,
  `p95 103.8 ms`
- citation context: `24/24`, `hit@1 1.000`, `grounded 1.000`,
  `target_cited_context 1.000`, `p50 48.2 ms`, `p95 116.0 ms`

### Interpretation

This change is accepted because it is a true retrieval-policy improvement:

- it uses compact high-information phrases only where long narrative queries
  actually benefit
- it explicitly rejects low-information discourse scaffolding
- it explicitly rejects tokenizer-generated acronym shards
- it improves non-title biomedical retrieval latency without sacrificing
  optimize, holdout, or citation-context quality

It also clarifies the role of title lookup in this system:

- title lookup is a precision and citation-resolution guardrail
- the main product target remains non-title biomedical evidence retrieval
- long-sentence chunk retrieval now has cleaner, more medically meaningful
  candidate generation before dense/rerank stages

## 2026-04-09 grounded exact-first packet selection

The next accepted backend change simplified grounded-answer packet fetch again,
but this time for the mixed exact/fallback entity path.

### Problem

When citation packet keys existed, the runtime was still using a single SQL shape
that combined:

- exact entity rows for the requested citation packets
- fallback entity packets for every covered answer paper
- a `UNION ALL` over both branches

That was broader than necessary. For grounded answers we only need fallback
entity packets for papers that still do not have a grounded entity packet after
the exact pass. Keeping fallback enabled for already-grounded citation papers
adds query work without improving answer support.

This mattered for two reasons:

- it kept the exact-title/entity-only fast path heavier than necessary
- it made the SQL harder to reason about and less faithful to the actual
  grounding contract

### Implementation

- `app/rag/chunk_grounding.py`
  - added scalar-vs-array corpus filter rendering so single-paper grounded
    answers use `corpus_id = %s`
  - simplified `CHUNK_ENTITY_PACKET_SQL` to the exact-packet branch only
  - `fetch_chunk_grounding_rows()` now:
    - runs citation packet lookup
    - runs exact entity packet lookup for the requested packets
    - runs fallback entity packet lookup only for corpus ids that still have no
      exact grounded entity rows
- `test/test_rag_grounded_runtime.py`
  - added regression coverage for:
    - scalar single-corpus citation/entity/structural query shapes
    - preserved array filters for multi-corpus paths
    - exact-first then targeted fallback on mixed-coverage answers
- `test/test_rag_runtime_perf.py`
  - added a live performance guardrail for the exact-title grounded fast path
    on holdout corpus `219104019`

### Local validation

Representative local runtime replays after the change:

- holdout `13826013` (`title_global`)
  - `duration ~23.1 ms`
  - `grounded_answer_fetch_chunk_packets ~5.2 ms`
  - `build_grounded_answer ~8.2 ms`
- holdout `219104019` (`title_global`)
  - `duration ~26.0 ms`
  - `grounded_answer_fetch_chunk_packets ~5.5 ms`
  - `build_grounded_answer ~8.8 ms`
- holdout `4919542` (`sentence_global`)
  - remained an ambiguous two-paper case
  - local `grounded_answer_fetch_chunk_packets` stayed in the mid-teens to
    mid-twenties depending on run variance

That last point is important: the change clearly helps the exact grounded path,
but it does not eliminate the remaining multi-paper sentence tail by itself.

### Langfuse runs

Accepted optimize run:

- Run name:
  `biomedical-optimization-v3-grounded-exact-first-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnqqft3x00iakt07eukgzrem/runs/616319c5-8123-49fc-8100-68e8f8e34af1

Accepted holdout run:

- Run name:
  `biomedical-holdout-v1-grounded-exact-first-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnr07zum00s4kt07ok8203mm/runs/7092ccd3-6504-4332-ad1c-d141b1ccc72e

Accepted citation-context run:

- Run name:
  `biomedical-citation-context-v1-grounded-exact-first-2026-04-09`
- Dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnrsj7fr00ngkt078aqv47he/runs/c09e684f-90d9-4e80-9608-192cc2dab359

Accepted results:

- optimize: `297/297`, `hit@1 1.000`, `grounded 1.000`, `p50 30.2 ms`,
  `p95 71.3 ms`, live review `p95 65.4 ms`
- holdout: `48/48`, `hit@1 1.000`, `grounded 1.000`, `p50 36.4 ms`,
  `p95 101.2 ms`
- citation context: `24/24`, `hit@1 1.000`, `grounded 1.000`,
  `target_cited_context 1.000`, `p50 37.3 ms`, `p95 113.3 ms`

### Interpretation

This change is accepted because it is a cleaner grounding implementation and it
matches the biomedical RAG quality bar more closely:

- exact citation/entity packet support is treated as primary evidence
- fallback entity packets are only used when exact grounded packets are absent
- metadata and entity packets still enrich display and support discovery, but
  the answer remains grounded in direct text spans rather than neighboring
  paper metadata

This also matches the external biomedical RAG guidance used for this pass:

- metadata should steer retrieval and display, not replace grounding
- citation-style resolution and fielded lookup should stay precise
- claim support should remain sentence/packet anchored

### Current next target

The remaining non-title tail is still the ambiguous sentence class, not the
exact-title grounded path:

- holdout `263489171`
- holdout `4919542`
- optimize/citation-context cold outliers such as `15624616` and `21133978`

Those cases still spend meaningful time in a mix of:

- chunk search
- dense recovery
- biomedical rerank
- grounded-answer packet fetch

so the next accepted improvement should target the ambiguous sentence path
rather than further title-guardrail tuning.

## Benchmark expansion: narrative, metadata, and evidence type

### Why these suites were added

The original optimize/holdout/citation stack is strong for title resolution,
covered-paper sentence retrieval, and cited-study preservation, but it does not
fully exercise OpenEvidence-style use cases such as:

- narrative biomedical questions
- author/journal/year-driven lookup
- study-design-aware retrieval

Three new Langfuse datasets were added to cover that gap:

- `benchmark-biomedical_narrative_v1`
- `benchmark-biomedical_metadata_retrieval_v1`
- `benchmark-biomedical_evidence_type_v1`

The benchmark catalog now distinguishes three gate modes:

- `required`: release blocker
- `guardrail`: specialist benchmark that should not regress when the change
  touches the relevant retrieval surface
- `shadow`: forward-looking benchmark tracked in Langfuse, but not yet a
  release blocker because the warehouse or scoring surface is not mature enough

### Exact current suite sizes

- `biomedical_narrative_v1`
  - `36` cases
  - gate mode: `shadow`
  - source mix: `27 s2orc_v2`, `9 biocxml`
  - focus: product-shaped narrative prompts such as
    `Tell me about prednisone neuropsychiatric symptoms and the evidence base for management.`
- `biomedical_metadata_retrieval_v1`
  - `36` cases
  - gate mode: `guardrail`
  - composition: `18` covered papers x `2` query variants
    - `metadata_variant:author_year`
    - `metadata_variant:journal_year`
- `biomedical_evidence_type_v1`
  - `16` cases
  - gate mode: `guardrail`
  - composition: `4` covered papers per study-design bucket
    - `study_type:clinical_trial`
    - `study_type:meta_analysis`
    - `study_type:review`
    - `study_type:study`

The evidence-type suite is `16`, not `24`, because the current covered-paper
warehouse only has `4` eligible covered papers in both the `clinical_trial` and
`meta_analysis` buckets. The benchmark contract now follows the real covered
pool instead of an aspirational count.

### Cross-suite overlap policy

The benchmark builder previously enforced a global no-overlap rule across every
suite. That was too strict for specialist benchmarks.

The current policy is:

- keep the existing overlap semantics for:
  - `biomedical_optimization_v3`
  - `biomedical_holdout_v1`
  - `biomedical_citation_context_v1`
- allow intentional cross-suite reuse for:
  - `biomedical_narrative_v1`
  - `biomedical_metadata_retrieval_v1`
  - `biomedical_evidence_type_v1`

This is the correct end state for now. The specialist suites are testing
orthogonal behaviors, so starving them for disjointness only hides real
retrieval defects.

### What each suite should gate

- `biomedical_optimization_v3`
  - primary release gate for covered-paper quality
  - changes are not accepted if overall `hit@1`, grounding, or non-title
    sentence retrieval regresses
- `biomedical_holdout_v1`
  - anti-overfitting release gate
  - changes are not accepted if optimize improves but disjoint holdout papers
    regress
- `biomedical_citation_context_v1`
  - cited-study preservation release gate
  - changes are not accepted if prompt-supplied study context is not preserved
- `biomedical_metadata_retrieval_v1`
  - specialist guardrail for author/journal/year lookup
  - changes that touch query parsing, routing, retrieval, or ranking should not
    be accepted if this suite regresses
- `biomedical_evidence_type_v1`
  - specialist guardrail for study-design-aware retrieval
  - changes that touch routing, ranking, publication-type priors, or evidence
    display should not be accepted if this suite regresses
- `biomedical_narrative_v1`
  - shadow benchmark for product-shaped narrative QA
  - track progress toward grounded discussion-quality, but do not use as a hard
    release gate until narrative coverage and answer scoring mature

### Live baseline runs

Narrative shadow baseline:

- run name:
  `biomedical-narrative-v1-baseline-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1p9w200ofkt07aba9r6z1/runs/347f2b13-823d-467e-8eca-84a2e0a10479
- results:
  - `36/36`
  - `hit@1 0.083`
  - `hit@k 0.194`
  - `grounded 0.833`
  - `target_in_answer 0.167`
  - `p50 285.5 ms`
  - live review `p95 426.2 ms`

Metadata retrieval guardrail baseline:

- run name:
  `biomedical-metadata-retrieval-v1-baseline-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1pahw00pikt07lxo887px/runs/9c24bb35-88ee-4932-bea7-14150e85baa3
- results:
  - `36/36`
  - `hit@1 0.583`
  - `hit@k 0.667`
  - `grounded 0.833`
  - `target_in_answer 0.639`
  - `display_study_metadata 0.997`
  - `p50 281.0 ms`
  - live review `p95 686.7 ms`

Evidence-type guardrail baseline:

- run name:
  `biomedical-evidence-type-v1-baseline-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1xw2r00y2kt0700m14dpu/runs/92cddfb8-2c2c-4dbc-b34d-9ca7b82cece2
- results:
  - `16/16`
  - `hit@1 0.438`
  - `hit@k 0.500`
  - `grounded 0.562`
  - `target_in_answer 0.500`
  - `display_study_metadata 1.000`
  - `p50 257.2 ms`
  - live review `p95 468.5 ms`

### Interpretation

These three baselines are intentionally not normalized down to current
performance. The thresholds in the benchmark catalog remain target-state
thresholds for the specialist suites.

The live results show three different structural gaps:

- `biomedical_narrative_v1`
  - this is still mostly a warehouse and benchmark-maturity problem
  - the suite is dominated by `s2orc_v2` cases and `warehouse_depth=none`
  - keeping it as `shadow` is correct
- `biomedical_metadata_retrieval_v1`
  - display metadata is already excellent
  - retrieval is not field-aware enough
  - most misses route through `title_lookup` instead of a true metadata-aware
    path
- `biomedical_evidence_type_v1`
  - the current runtime is not honoring study-design language strongly enough
  - `clinical trial evidence ...` and `meta-analysis evidence ...` prompts also
    collapse into `title_lookup` behavior

The key implication is that the next optimization pass should not focus on
title-guardrail speed. It should build a native field-aware and study-design-
aware retrieval path for non-title biomedical prompts.

## 2026-04-09 metadata and evidence-type route pass

### What changed

- `query_metadata.py`
  - single-token year prefixes now default to `author` rather than `journal`
  - this removed the pathological `author+journal` ambiguity on prompts like
    `Vadivel 2021 ...`
- `_queries_metadata_search.py`
  - author FTS was aligned with the existing `idx_paper_authors_name_fts` GIN
    expression by querying `to_tsvector('simple', COALESCE(name, ''))`
  - added a dedicated `PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_*` route so
    publication-type prompts no longer go through the generic metadata SQL
- `repository_paper_search.py`
  - publication-type-only prompts now use
    `paper_search_publication_type_{current_map,global,in_selection}`
- migration `051_add_runtime_author_exact_lookup_index.sql`
  - added `idx_paper_authors_name_lower` to support exact author lookup across
    all author positions

### DB validation

Representative `EXPLAIN ANALYZE` results after the route split:

- metadata author-year example:
  - query: `Vadivel 2021 mental health post-covid-19 era challenges way`
  - route: `paper_search_metadata_current_map`
  - execution time: `82.785 ms`
  - important plan change:
    - author FTS now uses `idx_paper_authors_name_fts`
    - the useless journal branch is gone because the prompt is no longer parsed
      as `journal=Vadivel`
- evidence-type example:
  - query: `clinical trial evidence predictors treatment response first episode schizophrenia`
  - route: `paper_search_publication_type_current_map`
  - execution time: `13.534 ms`
  - important plan change:
    - the planner now intersects `publication_types` and `topic` directly inside
      one dedicated branch instead of materializing a broad publication-type
      candidate pool and refining it later

### Langfuse results

Metadata retrieval guardrail:

- run name:
  `metadata-native-author-journal-route-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1pahw00pikt07lxo887px/runs/e627c959-c0c4-46bf-bace-ad6ead3cb827
- results:
  - `36/36`
  - `hit@1 0.944` from `0.583`
  - `hit@k 0.944` from `0.667`
  - `grounded 1.000` from `0.833`
  - `target_in_answer 0.944` from `0.639`
  - `display_study_metadata 1.000`
  - `p50 710.6 ms`
  - live review `p95 7260.9 ms`
- low-concurrency confirmation:
  - run name:
    `metadata-native-author-journal-route-lowconcurrency-2026-04-09`
  - dataset run:
    http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1pahw00pikt07lxo887px/runs/98cd3e83-d366-4da3-8d91-9906b7100450
  - results:
    - `hit@1 0.944`
    - `grounded 1.000`
    - `p50 411.7 ms`
    - live review `p95 7358.7 ms`
- interpretation:
  - lower concurrency improves the center of the latency distribution
  - the long-tail remains journal-route dominated, so this is not just ETL noise
- remaining misses:
  - `Neurology 2018 score that predicts 1-year functional status`
    - now misses because single-token journal strings default to the author lane
  - `Revista de Sa de 2020 covid-19 pandemic fear reflections mental health`
    - accent/diacritic normalization miss against `Revista de Saúde Pública`
- interpretation:
  - quality is now close to target-state
  - the remaining work is explicit journal handling, not more title work

Evidence-type guardrail:

- run name:
  `evidence-type-native-publication-route-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1xw2r00y2kt0700m14dpu/runs/0b842e2c-6896-4dd3-a683-6cc9bb0068fd
- results:
  - `16/16`
  - `hit@1 0.938` from `0.438`
  - `hit@k 0.938` from `0.500`
  - `grounded 1.000` from `0.562`
  - `target_in_answer 0.938` from `0.500`
  - `display_study_metadata 1.000`
  - `p50 320.9 ms`
  - live review `p95 509.1 ms`
- remaining miss:
  - `meta-analysis evidence analysis brain derived neurotrophic factor val66met`
- interpretation:
  - publication-type prompts are now genuinely study-design-aware
  - the dominant remaining miss class is semantic specificity inside the
    matched study-design bucket, not route selection

### Narrative suite status

The narrative benchmark is still coverage-confounded.

Current state of the `25` missing target subset being backfilled:

- `with_chunks = 3`
- `with_entities = 3`
- `with_biocxml = 3`

The dedicated narrative backfill is still running:

- PID `1271201`
- elapsed `42+ minutes`

An older broad runtime-eval backfill is also still running and consuming CPU:

- PID `2812978`
- elapsed `20+ hours`

Because of that, `biomedical_narrative_v1` should still be treated as a shadow
suite until coverage finishes and the warehouse is no longer the dominant
confounder.

### Next clean targets

- build a dedicated journal-year metadata route rather than sending journal
  prompts through the generic metadata SQL
- add accent-insensitive venue normalization so
  `Revista de Sa de ...` resolves cleanly to `Revista de Saúde Pública`
- evaluate whether single-token journal strings should use a bounded journal
  fallback instead of author-only parsing
- finish the narrative BioC/chunk backfill before using
  `biomedical_narrative_v1` as anything stronger than shadow coverage tracking

## 2026-04-10 follow-up: serving-grade metadata and evidence routes

The `2026-04-09` specialist route pass fixed the quality floor, but it did not
yet produce serving-grade latency. Two separate structural issues were still
present:

- normalized-title rescue in metadata/evidence search was using an inline
  `regexp_replace(...)` FTS expression with no matching runtime index
- author-year prompts still routed through the generic metadata path because
  single-token prefixes were being duplicated into both the author and journal
  slots

Both were fixed directly in the runtime path rather than hidden behind
benchmark-only workarounds.

### Normalized-title serving fix

What changed:

- `_queries_metadata_search.py`
  - normalized title rescue now uses the canonical database function
    `solemd.normalize_title_key(...)` instead of an inline regexp expression
- migration `054_add_runtime_normalized_title_fts_index.sql`
  - adds `idx_papers_runtime_normalized_title_fts`
  - analyzes `solemd.papers` after the concurrent build

Why this mattered:

- the earlier metadata/evidence quality recovery depended on normalized-title
  token rescue
- without a matching GIN index, publication-type prompts could still devolve
  into broad scans even though the route was logically correct

Representative DB validation:

- evidence-type query
  - prompt:
    `meta-analysis evidence analysis brain derived neurotrophic factor val66met`
  - route: `paper_search_publication_type_current_map`
  - `EXPLAIN ANALYZE`: `~1983 ms -> 17.6 ms`
- journal/year query
  - prompt:
    `Acta Neuropathologica 2009 p62 sqstm1 overexpressed prominently accumulated inclusions`
  - route: `paper_search_journal_year_current_map`
  - `EXPLAIN ANALYZE`: `~10.9 ms`

Accepted evidence-type specialist run after the index landed:

- run name:
  `evidence-type-v2-indexed-token-rescue-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1xw2r00y2kt0700m14dpu/runs/8f8dcb07-298a-4e7e-a59b-083d1e0cf728
- results:
  - `16/16`
  - `hit@1 1.000`
  - `hit@k 1.000`
  - `grounded 1.000`
  - `target_in_answer 1.000`
  - `display_study_metadata 1.000`
  - `p50 51.9 ms`
  - live review `p95 88.7 ms`

This is the first evidence-type specialist run that is clean on both quality
and latency.

### Author-year route split

The normalized-title index removed the evidence-type tail, but metadata
retrieval still had a long `p95` because author-year prompts were using the
generic metadata route.

Langfuse made the failure mode obvious:

- `author_year` cases had median latency well above `journal_year`
- the worst metadata tail cases were all author-year prompts:
  - `Balu 2018 ...`
  - `Slooter 2020 ...`
  - `Silva 2020 ...`
  - `Ma 2023 ...`
- paired journal-year variants for the same targets were already fast

What changed:

- `_queries_metadata_search.py`
  - added dedicated `PAPER_AUTHOR_YEAR_SEARCH_*` SQL
  - author/year search now uses an author-specific branch plus a year/topic
    fallback when no author match exists
- `repository_paper_search.py`
  - removed the single-token `author -> journal` duplication
  - added `paper_search_author_year_{current_map,global,in_selection}`
    routing

Why this is the correct structural fix:

- it keeps true author-year prompts on a narrow path
- it preserves recovery for ambiguous single-token prefixes such as
  `Neurology 2018 ...` by allowing a year/topic fallback inside the
  author-year route
- it does not overfit to explicit titles

Representative DB validation:

- prompt:
  `Balu 2018 score that predicts 1-year functional status`
  - route: `paper_search_author_year_current_map`
  - `EXPLAIN ANALYZE`: `90.5 ms`
- prompt:
  `Breschi 2013 different permeability potassium salts across blood-brain`
  - route: `paper_search_author_year_current_map`
  - `EXPLAIN ANALYZE`: `26.0 ms`

Indexed-only metadata run before the author-year split:

- run name:
  `metadata-aware-general-v5-indexed-tail-audit-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1pahw00pikt07lxo887px/runs/ce6493d8-d8a7-499c-a33b-aef0402da829
- results:
  - `36/36`
  - `hit@1 1.000`
  - `grounded 1.000`
  - `p50 82.0 ms`
  - live review `p95 398.6 ms`

Accepted metadata run after the author-year route split:

- run name:
  `metadata-aware-general-v7-author-year-route-fixed-2026-04-09`
- dataset run:
  http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmns1pahw00pikt07lxo887px/runs/97f93102-d6f4-49de-a5ca-2d805bfcc35f
- results:
  - `36/36`
  - `hit@1 1.000`
  - `hit@k 1.000`
  - `grounded 1.000`
  - `target_in_answer 1.000`
  - `display_study_metadata 0.997`
  - `p50 57.5 ms`
  - live review `p95 129.4 ms`

This closes the metadata specialist suite as a serving-grade gate. The
remaining `display_study_metadata` gap is marginal and does not affect answer
grounding or target retrieval.

### Current specialist benchmark state

- `biomedical_metadata_retrieval_v1`
  - now passes quality and latency
- `biomedical_evidence_type_v1`
  - now passes quality and latency
- `biomedical_narrative_v1`
  - still shadow only
  - the dominant confounder is warehouse coverage, not routing quality

## Benchmark buildout backlog

The current acceptance catalog is still too title-heavy for a clinical
evidence product. The next Langfuse datasets to add or promote should be:

- `benchmark-passage_retrieval_v2`
  - `24` cases
  - gate chunk retrieval, passage alignment, sentence anchoring, and grounded
    evidence extraction
- `benchmark-semantic_recall_v2`
  - `36` cases
  - gate paraphrase robustness, dense retrieval, and hybrid fusion
- `benchmark-entity_relation_v2`
  - `36` cases
  - gate entity/relation retrieval and biomedical reranker behavior
- `benchmark-biomedical_citation_anchor_v2`
  - `36` cases
  - gate cited-paper anchoring and adjacent-paper confounder resistance
- `benchmark-biomedical_evidence_family_v1`
  - `40` cases
  - gate `evidence_intent`, publication-type scoring, and study-design-aware
    retrieval
- `benchmark-biomedical_narrative_synthesis_v1`
  - `60` cases
  - keep as `shadow` first
  - gate grounded multi-study narrative synthesis once warehouse coverage is
    reliable

The priority order is passage retrieval, semantic recall, and entity/relation
first. Metadata precision should remain a guardrail, not the primary KPI.
