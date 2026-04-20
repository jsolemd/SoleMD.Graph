# Corpus Boundary Ledger

Date: 2026-04-19
Repo: SoleMD.Graph
Target: corpus-boundary
Status: landed

## Scope

Correct the post-ingest corpus architecture so that:

- `apps/worker/app/ingest` owns raw/stage landing only.
- `apps/worker/app/corpus` owns selected-corpus materialization.
- `apps/worker/app/hot_text` remains a child wave that acquires full text for already-selected papers.

This replaces the current partial split where raw ingest still writes canonical corpus surfaces.

## Target Model

```text
full upstream raw
  -> s2_*_raw
  -> pubtator.*_stage

selected canonical corpus
  -> solemd.corpus
  -> solemd.papers
  -> solemd.paper_text
  -> solemd.paper_authors
  -> pubtator.entity_annotations
  -> pubtator.relations

child waves
  -> warm wave
  -> hot wave
      -> hot_text.acquire_for_paper
      -> downstream parsing / chunking / grounding
```

## Correction Plan

1. Stop Semantic Scholar raw ingest from promoting directly into canonical paper tables.
2. Stop PubTator raw ingest from promoting directly into canonical PubTator tables.
3. Expand corpus selection runtime so it materializes canonical selected-corpus rows from raw/stage sources.
4. Preserve current run-table, advisory-lock, and resume semantics in the corpus lane.
5. Keep hot dispatch as an idempotent child-wave off the selected corpus, not off raw ingest side effects.
6. Rework tests so ingest proves raw landing and corpus proves canonical promotion.

## DB Todo

- Keep raw/stage tables as the warehouse ingress boundary.
- Treat `solemd.corpus_selection_runs`, `solemd.corpus_selection_signals`, and `solemd.paper_selection_summary` as the selection control plane.
- Use corpus-phase SQL to populate canonical tables with `INSERT ... SELECT`, `UPDATE ... FROM`, and release-scoped deletes where replacement semantics are required.
- Keep canonical PubTator rows keyed off selected `corpus_id` membership instead of raw-ingest PMIDs joined directly to `solemd.papers`.
- Defer any new warm-wave durable tables unless code work proves they are required for this slice.

## Code Todo

- Refactor `apps/worker/app/ingest/sources/semantic_scholar.py` so `promote_family("papers")` does not write canonical paper surfaces.
- Refactor `apps/worker/app/ingest/sources/pubtator.py` so release promotion stops at stage tables.
- Add corpus-phase canonical materialization modules or runtime phases for:
  - selected paper rows
  - selected paper text rows
  - selected paper authors rows
  - selected PubTator entity rows
  - selected PubTator relation rows
- Keep actor modules thin and continue using the existing worker root and asyncpg pools.
- Align wave dispatch to the corrected parent-universe contract after canonical materialization is complete.

## Completed Batches

- Added the corpus worker lane, actor, CLI, request models, runtime, asset loading, selection rule modules, and wave dispatch.
- Added corpus run/provenance/wave schema and tests for deterministic selection resume and idempotent dispatch.
- Added curated vocabulary warehouse tables sourced from `data/vocab_terms.tsv` and `data/vocab_aliases.tsv`.
- Corrected raw-ingest ownership so Semantic Scholar and PubTator stop publishing canonical corpus surfaces during raw ingest.
- Added `solemd.s2orc_documents_raw` so `s2orc_v2` lands on the raw side of the boundary instead of populating `paper_documents` directly.
- Added an explicit `canonical_materialization` corpus phase that populates `solemd.papers`, `solemd.paper_text`, `solemd.paper_authors`, `pubtator.entity_annotations`, and `pubtator.relations` from raw/stage inputs.
- Reworked corpus candidate admission so `corpus_id` allocation happens inside the corpus lane from journal/pattern/vocab-stage hits rather than inside raw ingest.
- Added end-to-end test coverage for ingest -> selection -> hot-wave dispatch under the corrected boundary.

## Current Findings

- Raw ingest now lands broad source data only; canonical corpus publication is corpus-owned.
- Hot dispatch still targets the mapped subset only; warm-wave orchestration remains a follow-on slice.
- `paper_citations` is still deferred because the physical warehouse table is not landed in the current schema batch.

## Next Passes

1. Land the first explicit warm-wave control tables and worker lane above the selected corpus.
2. Decide whether retired papers should trigger canonical child-surface cleanup or remain as history guarded by `solemd.corpus.domain_status`.
3. Land the physical `paper_citations` surface if citation promotion is required inside the canonical corpus layer.
