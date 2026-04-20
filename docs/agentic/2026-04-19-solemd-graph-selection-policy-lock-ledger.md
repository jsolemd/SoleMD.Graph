# Selection Policy Lock Ledger

- Date: `2026-04-19`
- Repo: `SoleMD.Graph`
- Scope: docs-only policy-lock update for the landed corpus worker contract
  under `apps/worker/app/corpus`
- Authoring surface: `docs/rag/*` plus this ledger
- Commit hashes: none in this pass

## Scope

Lock the RAG docs to the policy contract that is already implemented:

- `raw -> corpus -> mapped -> evidence`
- mapped promotion uses journal / pattern / entity / relation rule families
- noisy entity families use second-gate corroboration
- evidence dispatch runs under `wave_policy_key = 'evidence_missing_pmc_bioc'`
- `paper_selection_summary` is the durable ranking/audit surface carrying
  `publication_year`, `has_locator_candidate`, mapped-rule booleans, mapped
  rule counts, and mapped/evidence priority scores

Out of scope for this pass:

- worker or schema code changes
- migrations
- policy-threshold tuning
- chunk/evidence implementation

## Ranked Themes And Findings

1. The main doc drift was not architectural anymore. It was naming and status
   drift: older text still described `candidate` leftovers, the old evidence
   wave key, and a future-tense mapped policy even though those are now landed.
2. `05e` needed the biggest correction because it still mixed "target
   implementation" language with an already-landed runtime.
3. `02` already had some of the updated selection-summary language, but it
   still needed a clearer locked contract for the summary columns and
   evidence-wave surfaces.
4. `14` was materially stale because it still described corpus-boundary
   completion as the next major missing runtime boundary.

## Completed Batches

### Batch 1

Re-read the current doc and ledger instructions:

- `docs/agentic/README.md`
- `docs/rag/05e-corpus-selection.md`
- `docs/rag/02-warehouse-schema.md`
- `docs/rag/14-implementation-handoff.md`

### Batch 2

Validated the live implementation contract against code/schema instead of
editing from memory:

- `apps/worker/app/corpus/models.py`
- `apps/worker/app/corpus/policies.py`
- `apps/worker/app/corpus/selectors/mapped.py`
- `apps/worker/app/corpus/selectors/provenance.py`
- `apps/worker/app/corpus/wave_runtime.py`
- `apps/worker/app/actors/corpus.py`
- `db/schema/warehouse/43_tables_corpus.sql`
- `db/schema/warehouse/53_indexes_corpus.sql`
- `db/migrations/warehouse/20260419204500_warehouse_corpus_mapped_evidence_contract.sql`
- `db/migrations/warehouse/20260419233000_warehouse_selection_policy_lock.sql`

### Batch 3

Updated `docs/rag/05e-corpus-selection.md` to:

- describe the landed `raw -> corpus -> mapped -> evidence` ladder
- replace stale `dispatch_hot_text_wave` / `mapped_missing_pmc_bioc` wording
- document the locked mapped policy families and second-gate behavior
- document the evidence-wave gating contract and current CLI/phase/runtime names
- shift remaining work from "finish the selector" to policy calibration and
  evidence-source fallback

### Batch 4

Updated `docs/rag/02-warehouse-schema.md` to:

- tighten the `paper_selection_summary` contract around publication year,
  locator readiness, mapped-rule booleans/counts, and mapped/evidence priority
  scores
- document the evidence-ranking and evidence-wave scan indexes
- document `corpus_wave_runs` / `corpus_wave_members` as the current
  `evidence_missing_pmc_bioc` dispatch ledger

### Batch 5

Updated `docs/rag/14-implementation-handoff.md` to:

- mark the corpus policy contract as landed instead of future work
- replace the stale "corpus-boundary completion" follow-on with policy
  calibration and evidence readiness
- anchor the next-pass work on `paper_selection_summary` and the locked
  evidence-wave contract rather than on structural selector rewrites

## Verification

Docs were verified against the current implementation surfaces with local
search/read passes:

- actor names: `corpus.start_selection`, `corpus.dispatch_evidence_wave`
- wave key: `evidence_missing_pmc_bioc`
- mapped policy: journal/pattern/entity/relation rule families plus
  `requires_second_gate`
- summary fields: `publication_year`, `has_locator_candidate`,
  `has_mapped_pattern_match`, `has_mapped_entity_match`,
  `has_mapped_relation_match`, `mapped_entity_signal_count`,
  `mapped_relation_signal_count`, `mapped_priority_score`,
  `evidence_priority_score`

No test suite was run because this pass changed docs only.

## Blockers

- None for the docs-only lock pass.

## Newly Discovered Follow-On Work

1. The next meaningful implementation pass should preview real cohort sizes and
   threshold effects before changing policy constants.
2. Evidence readiness still needs a source-aware fallback story when PMC BioC
   is absent but an S2 full-text source is present.
3. If editorial review of mapped/evidence rules becomes frequent, the
   currently worker-owned staged rule families may need promotion into durable
   warehouse rule tables.

## Next Recommended Passes

1. Run real cohort-preview queries over published warehouse releases and record
   resulting corpus / mapped / evidence counts per selector version.
2. Lock the next evidence-policy refinements explicitly:
   recency exceptions, source quality ordering, and any stricter evidence-grade
   criteria.
3. Land source-aware canonical document fallback before chunk/evidence expands
   beyond PMC-first coverage.
