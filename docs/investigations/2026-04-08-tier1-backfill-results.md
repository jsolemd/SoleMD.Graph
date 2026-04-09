# 2026-04-08 Tier 1 BioCXML Backfill and Benchmark Results

## Scope

Tier 1 was the live benchmark target set behind the three active hard suites:

- `benchmark-entity_relation_v2` (`13` items)
- `benchmark-passage_retrieval_v2` (`15` items)
- `benchmark-semantic_recall_v2` (`13` items)

Total unique target papers: `41`.

Artifacts produced during execution:

- `docs/investigations/2026-04-08-tier1-targets.json`
- `docs/investigations/2026-04-08-tier1-pre-state.json`
- `docs/investigations/2026-04-08-tier1-post-state.json`
- `docs/investigations/2026-04-08-tier1-backfill-report.json`
- `docs/investigations/2026-04-08-tier1-archive-repair-report.json`
- `docs/investigations/2026-04-08-tier1-coverage-diff.json`
- `docs/investigations/2026-04-08-tier1-benchmark-comparison.json`

Shared Langfuse run family: `post-bioc-tier1-2026-04-08`.

Exact Langfuse dataset runs used for comparison:

| Suite | Baseline run | Post-Tier-1 run |
|-------|--------------|-----------------|
| `benchmark-entity_relation_v2` | `post-router-narrow-2026-04-07 - 2026-04-07T22:45:04.676131Z` | `post-bioc-tier1-2026-04-08 - 2026-04-08T16:00:27.685513Z` |
| `benchmark-passage_retrieval_v2` | `post-router-narrow-2026-04-07 - 2026-04-07T22:44:34.402399Z` | `post-bioc-tier1-2026-04-08 - 2026-04-08T16:01:06.008373Z` |
| `benchmark-semantic_recall_v2` | `post-router-narrow-2026-04-07 - 2026-04-07T22:45:00.635608Z` | `post-bioc-tier1-2026-04-08 - 2026-04-08T16:01:39.769063Z` |

## Coverage Outcome

Target-set warehouse coverage before Tier 1:

| Metric | Before |
|-------|--------|
| BioCXML source rows | `0/41` |
| Entity mentions | `0/41` |
| Blocks | `16/41` |
| Sentences | `16/41` |
| `default-structural-v1` chunks | `16/41` |

Execution path:

1. PubTator3 API targeted ingest repaired `17/41` papers.
2. The API did not return `22` PMIDs that still existed in the local BioCXML release.
3. A manifest-guided archive-member repair ingested `22/24` remaining papers and
   chunk-backfilled those repaired papers.
4. Two manifest-covered papers were low-value parse outputs and remained
   intentionally unrepaired.

Target-set warehouse coverage after Tier 1:

| Metric | After |
|-------|-------|
| BioCXML source rows | `39/41` |
| Entity mentions | `39/41` |
| Blocks | `39/41` |
| Sentences | `39/41` |
| `default-structural-v1` chunks | `39/41` |

Per-suite repair coverage:

| Suite | Repaired |
|-------|----------|
| `entity_relation_v2` | `12/13` |
| `passage_retrieval_v2` | `15/15` |
| `semantic_recall_v2` | `12/13` |

Low-value unrepaired targets:

- `32736596` (`Research diagnoses for tardive dyskinesia.`)
- `35677096` (`RESPONSE OF ANTI-NMDA RECEPTOR ENCEPHALITIS WITHOUT TUMOR TO IMMUNOTHERAPY INCLUDING RITUXIMAB`)

## Benchmark Comparison

Comparison baseline: `post-router-narrow-2026-04-07`.

| Suite | hit@1 | hit@k | target_in_answer_corpus | grounded_answer_rate | p50 (ms) | p95 (ms) |
|-------|-------|-------|--------------------------|----------------------|----------|----------|
| `entity_relation_v2` | `7.7% → 7.7%` | `7.7% → 15.4%` | `7.7% → 7.7%` | `15.4% → 15.4%` | `950 → 1760` | `1457 → 10628` |
| `passage_retrieval_v2` | `20.0% → 20.0%` | `46.7% → 46.7%` | `26.7% → 26.7%` | `46.7% → 46.7%` | `117 → 1077` | `1460 → 6784` |
| `semantic_recall_v2` | `0.0% → 23.1%` | `0.0% → 23.1%` | `0.0% → 23.1%` | `38.5% → 46.2%` | `108 → 664` | `830 → 4987` |

Case-level lift:

- `entity_relation_v2`: `1` paper improved from miss to hit@k.
- `passage_retrieval_v2`: `0` net case improvements.
- `semantic_recall_v2`: `3` papers improved from miss to hit@1.

Improved semantic cases:

- `semantic_recall_v2:20543885` — `confused elderly patient who just had surgery`
- `semantic_recall_v2:2693021` — `memory loss after surgery in elderly patients`
- `semantic_recall_v2:3470330` — `acting out dreams during sleep and hitting bed partner`

These lifts all landed on repaired papers. One of them (`3470330`) required the
archive-member repair rather than the API path.

## Trace Findings

### Entity suite

Tier 1 removed the “empty entity table” confounder for `12/13` entity-suite
targets, but the runtime entity seed lane still did not fire:

- `avg_entity_terms = 2.231`
- `entity_seed_positive_cases = 0/13`
- `relation_seed_positive_cases = 0/13`
- route signature unchanged on all `13/13` cases
- dominant route remained
  `retrieval_profile=title_lookup|paper_search_route=paper_search_global|...`

Interpretation:

- The entity benchmarks are no longer blocked primarily by missing warehouse
  entity rows.
- The remaining failure mode is runtime behavior: query enrichment / entity seed
  retrieval / route selection.
- One repaired target (`entity_relation_v2:2748365`) improved from miss to rank 3,
  but that did not change hit@1 or answer-corpus coverage.

### Passage suite

`passage_retrieval_v2` became fully repaired structurally, but the benchmark did
not move in aggregate.

Trace deltas:

- `chunk_lexical_hits_mean: 0.467 → 0.733`
- `hit@k: 46.7% → 46.7%`
- `target_in_answer_corpus: 26.7% → 26.7%`

Interpretation:

- The repaired chunk surfaces are being searched.
- The remaining gap is not missing structure. It is mostly route leakage into
  `title_lookup` plus passage ranking / fallback quality.

### Semantic suite

`semantic_recall_v2` showed the clearest benefit from Tier 1.

Trace deltas:

- `hit@1: 0.0% → 23.1%`
- `hit@k: 0.0% → 23.1%`
- `target_in_answer_corpus: 0.0% → 23.1%`
- `grounded_answer_rate: 38.5% → 46.2%`

Interpretation:

- Structural repair of previously unchunked papers directly improved semantic
  recovery on a subset of paraphrase cases.
- This is evidence that ingest quality was a real blocker for part of the suite.
- It is not evidence that ingest quality was the only blocker, because `10/13`
  cases still missed after repair.

## Performance Findings

Coverage improved, but latency worsened materially once more full-text structure
became available and searchable.

Dominant mean stage deltas:

| Suite | Dominant stage movement |
|-------|--------------------------|
| `entity_relation_v2` | `retrieve_search_state 555 → 1499`, `finalize_search_result 60 → 680`, `search_query_embedding_papers 45 → 504` |
| `passage_retrieval_v2` | `retrieve_search_state 209 → 1045`, `finalize_search_result 94 → 758`, `query_entity_enrichment 32 → 666` |
| `semantic_recall_v2` | `retrieve_search_state 78 → 613`, `finalize_search_result 119 → 442`, `search_query_embedding_papers 45 → 332` |

Interpretation:

- Tier 1 improved evidence surfaces, but it also expanded the runtime work per
  request.
- The next “quality” pass cannot be recall-only. It has to include retrieval
  and finalize-stage performance control.

## Important Trace Semantics

`source_system` on these benchmark traces is the frozen benchmark field from
`expected_output.primary_source_system`. It is **not** the actual source chosen
at runtime. Runtime diagnosis in this investigation therefore used:

- `route_signature`
- `warehouse_depth`
- retrieval-stage hit counts (`entity_seed_hits`, `chunk_lexical_hits`, `dense_query_hits`)
- case-level evidence bundles and answer-corpus membership

## Decision

Tier 1 should **not** be scaled to Tier 2 or Tier 3 yet.

Why:

1. The warehouse repair succeeded: `39/41` target papers now have the expected
   BioCXML structure, chunks, and entity mentions.
2. The semantic suite improved materially, so ingest quality clearly mattered.
3. The entity suite still has `0/13` cases with `entity_seed_hits > 0` despite
   entity-rich queries and repaired warehouse coverage.
4. Latency rose sharply after the repair, especially in `retrieve_search_state`
   and `finalize_search_result`.

## Next Steps

1. Fix runtime entity retrieval before scaling ingest further.
   Evidence: `entity_relation_v2` post-run traces carry entity terms but still
   produce zero entity-seed hits.

2. Fix title-lookup leakage for short biomedical claims.
   Evidence: `entity_relation_v2` remained `13/13` on the same title-heavy route
   signature, and `passage_retrieval_v2` still left most misses in title-like
   routing paths.

3. Profile and control the new structural latency.
   Evidence: p50 and p95 rose across all three suites after Tier 1.

4. Keep the API-first then manifest-repair operational pattern for future
   target-set repairs.
   Evidence: the PubTator3 API repaired `17` targets quickly, while the archive
   tail was bounded cleanly by the manifest and finished with `22` additional
   repairs plus `2` low-value exclusions.
