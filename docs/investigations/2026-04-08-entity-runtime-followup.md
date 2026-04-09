# 2026-04-08 Entity Runtime Follow-Up

## Scope

This note records the live Langfuse runtime optimization work done after the
Tier 1 BioC backfill. `docs/map/*` is intentionally not updated here; this is a
session-level investigation note only.

## Source of truth

All conclusions below come from live Langfuse dataset runs and trace inspection,
not from cached JSON exports.

- Entity benchmark dataset: `benchmark-entity_relation_v2`
- Title benchmark dataset: `benchmark-title_retrieval_v2`
- Langfuse UI: `http://localhost:3100`

## Accepted change

### Canonical entity mention normalization

Code:

- `engine/app/rag/queries.py`
- `engine/test/test_rag_repository.py`

Fix:

- Normalize `solemd.entities` and `solemd.paper_entity_mentions` joins across
  `entity_type` case and `concept_id` `MESH:` prefix differences.

Observed effect in Langfuse:

- Post-BioC baseline:
  `post-bioc-tier1-2026-04-08 - 2026-04-08T16:00:27.685513Z`
- After normalization:
  `entity-seed-normalization-2026-04-08 - 2026-04-08T17:48:49.878495Z`

Delta:

- `hit@k`: `0.154 -> 0.231`
- `target_in_answer_corpus`: `0.077 -> 0.154`
- Entity-positive cases increased from effectively dead to trace-visible.

### TITLE_LOOKUP direct support from entity and relation lanes

Code:

- `engine/app/rag/retrieval_policy.py`
- `engine/test/test_rag_retrieval_policy.py`
- `engine/test/test_rag_ranking.py`

Fix:

- Treat `entity_score > 0` and `relation_score > 0` as direct support in the
  `TITLE_LOOKUP` sort key path.

Current accepted entity run:

- Run name:
  `entity-title-direct-support-reconfirm-2026-04-08 - 2026-04-08T18:15:01.319601Z`
- Dataset run URL:
  `http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnmqbp0b0017kt07f13i017x/runs/5ee984ab-c257-4126-9754-160e99483c97`

Current accepted metrics:

- `hit@1`: `0.385`
- `hit@k`: `0.385`
- `target_in_answer_corpus`: `0.385`
- `grounded_answer_rate`: `0.538`
- `mean target_entity_score`: `0.414`
- `mean duration_ms`: `8316.5`

Confirmed wins:

- `entity_relation_v2:15285970` moved `4 -> 1`
- `entity_relation_v2:16038098` moved `miss -> 1`
- `entity_relation_v2:2466571` moved `miss -> 1`
- `entity_relation_v2:2748365` moved `2 -> 1`

## Rejected experiments

### Rejected: dense support as direct TITLE evidence

Code path tested:

- Temporary change in `engine/app/rag/retrieval_policy.py`

Langfuse run:

- `entity-title-dense-support-2026-04-08 - 2026-04-08T18:05:09.851770Z`
- Dataset run URL:
  `http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnmqbp0b0017kt07f13i017x/runs/e0558b00-d5b4-4460-bc40-b01797bb0b5d`

Outcome:

- `hit@1` regressed `0.385 -> 0.308`
- `grounded_answer_rate` regressed `0.538 -> 0.308`
- The trace-backed clozapine miss was not rescued.

Decision:

- Reverted. Dense-only candidates are too noisy to qualify as direct support in
  the title lane.

### Rejected: demote short biomedical relation noun phrases to GENERAL

Code path tested:

- Temporary change in `engine/app/rag/query_enrichment.py`

Langfuse run:

- `entity-relation-route-demotion-2026-04-08 - 2026-04-08T18:11:52.152814Z`
- Dataset run URL:
  `http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnmqbp0b0017kt07f13i017x/runs/f586024a-7e37-4862-b622-60e3fea444ae`

Outcome:

- `routing_match` improved `0.000 -> 0.667`
- But `hit@1` regressed `0.385 -> 0.231`
- `COMT Val158Met polymorphism and psychosis risk` regressed from a hit back to
  a miss
- The general route fell onto
  `paper_search_global_fts_only|paper_search_use_title_similarity=False|paper_search_use_title_candidate_lookup=False`

Decision:

- Reverted. The current GENERAL paper-search surface is too weak for these
  biomedical relation prompts.

## Title-lane sanity check

Current title benchmark run:

- Run name:
  `title-sanity-after-entity-fix-2026-04-08 - 2026-04-08T18:16:50.057744Z`
- Dataset run URL:
  `http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmnm9r58l00g6qv07kyi0vesp/runs/4e95f096-361a-4fa4-b374-966552378165`

Observed metrics:

- `hit@1`: `1.000`
- `hit@k`: `1.000`
- `routing_match`: `0.750`
- `error_rate`: `0.000`

Interpretation:

- The accepted entity-title support change did not break exact-title retrieval.

## Remaining failure shape

The current accepted entity run still leaves `8/13` misses. Those misses split
into two groups:

1. No target visibility at all.
   The target paper is absent from lexical, entity, dense, and citation lanes.
2. Ingest coverage gaps.
   `6/8` accepted-run misses still show `warehouse_depth=none`.

What the rejected routing experiment clarified:

- Simply moving these noun-phrase biomedical queries from `TITLE_LOOKUP` to
  `GENERAL` is not enough.
- The current `GENERAL` route relies on paper-level FTS too heavily for this
  query class.

## Next optimization target

The next high-value surface is not another sort-key tweak. It is the retrieval
surface behind these no-visibility misses:

- Evaluate whether `paper_search_global_fts_only` for short biomedical relation
  prompts should regain a candidate-lookup or title-similarity rescue path.
- Re-check ingest coverage for the remaining `warehouse_depth=none` misses before
  changing ranking again.
- Keep Langfuse as the source of truth for any follow-up experiments.
