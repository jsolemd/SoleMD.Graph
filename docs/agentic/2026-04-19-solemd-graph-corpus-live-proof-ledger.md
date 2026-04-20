# Corpus Live Proof Ledger

Date: 2026-04-19
Repo: SoleMD.Graph
Target: corpus-live-proof
Status: complete

## Scope

Execute the post-refactor corpus stack end-to-end against the local warehouse
environment:

- resolve live DSN/runtime wiring
- apply and verify warehouse migrations
- run worker readiness checks
- execute a real corpus selection
- execute a bounded evidence-wave dispatch
- inspect outputs and record any remaining policy/runtime blockers

## Ranked Themes

1. Environment readiness matters first: no live proof exists until Redis and the
   warehouse cluster are reachable from the worker runtime.
2. The code contract is already green under integration tests; the main unknowns
   are migration state, local service health, and real release-pair availability.
3. Policy calibration for `mapped` and `evidence` should be informed by the first
   real ranked cohorts, not synthetic fixtures.

## Completed Batches

1. Opened a fresh `/agentic` ledger for the live execution pass.
2. Sourced `.env.example` defaults and verified `python -m app.main check`
   succeeds against:
   - Redis `127.0.0.1:57379`
   - warehouse `127.0.0.1:54432`
   - serve read/admin `127.0.0.1:56432` / `55432`
3. Cleared migration drift and applied missing warehouse migrations:
   - fixed checksum drift caused by stray post-apply edits in
     `20260419020000_warehouse_ingest_raw_surfaces.sql`
   - fixed transition ordering in
     `20260419204500_warehouse_corpus_mapped_evidence_contract.sql`
   - added `20260419210000_warehouse_corpus_runtime_grants.sql`
   - added `20260419220000_warehouse_paper_citations_surface.sql`
4. Verified warehouse migration state is clean:
   - `uv run scripts/schema_migrations.py verify --cluster warehouse --dsn "$WAREHOUSE_DSN_ADMIN" --check`
   - `ready: true`, `missing_migrations: []`, `checksum_mismatches: []`
5. Ran a real audit-pair corpus selection against live rows:
   - run id: `019da750-61b7-7a4a-92b7-8eaac35634be`
   - release pair: `s2 2026-03-10-audit` + `pt3 2026-03-21-audit`
   - selector: `selector-v2-live-proof-audit-r2`
   - result: published with one `corpus` paper and no newly `mapped` papers
6. Found and fixed a canonical-identity bug in corpus admission:
   - stale/wrong raw `corpus_id` assignments now yield to canonical identity
     matches by `s2_paper_id`, `pmid`, `doi_norm`, and normalized `pmc_id`
   - added regression coverage for the failed live PMID-reuse case
7. Found and fixed a runtime enqueue bug in direct evidence-wave dispatch:
   - `dispatch_evidence_wave()` now bootstraps the Dramatiq broker before
     enqueueing `hot_text.acquire_for_paper`
   - resumed the previously stuck debug wave run
     `019da756-5cbd-7c1c-97ca-75614f98ab68` to terminal `published`
8. Added the missing canonical `solemd.paper_citations` surface and wired
   corpus materialization to replace it set-wise from
   `solemd.s2_paper_references_raw`.
9. Ran a fresh warehouse-local sample ingest -> selection -> evidence-wave proof:
   - sample root: `/tmp/codex-corpus-e2e-mmh43dwp`
   - S2 release: `codex-e2e-s2-af6c4bed`
   - PT3 release: `codex-e2e-pt3-af6c4bed`
   - S2 ingest run: `019da763-b2d5-7594-9be4-1c79fb004758`
   - PT3 ingest run: `019da763-b31b-7db1-9ffc-6dbcc4a7c876`
   - selection run: `019da763-b361-7c8d-9f83-3bf54608b92a`
   - wave run: `019da763-b569-7edc-b2fd-18d17fbd4b20`
   - canonical counts:
     - `raw_paper_count = 3`
     - `raw_with_corpus_id = 3`
     - `papers_count = 3`
     - `paper_text_count = 3`
     - `paper_authors_count = 3`
     - `paper_citations_count = 3`
     - `entity_annotations_count = 2`
     - `relations_count = 2`
   - selection outcomes:
     - `710101 -> mapped -> journal_and_vocab`
     - `710102 -> mapped -> pattern_match`
     - `710103 -> corpus -> vocab_entity_match`
   - evidence-wave member:
     - `710101`, ordinal `1`, `was_enqueued = true`
10. Re-ran the focused worker suite after the runtime and citation-surface
    fixes:
    - `17 passed, 2 warnings`

## Blockers

- No runtime/mechanical blocker remains for A/B.
- Real-release policy is still the open product question:
  the live audit pair currently produces a broad `corpus` paper but no newly
  `mapped` paper, so evidence-wave volume depends on mapped-promotion tuning,
  not on worker/runtime correctness.

## Follow-on Work

- Decide and codify the stronger `mapped` gate for real releases:
  journal-only, pattern-only, vocab+relation, or another weighted rule family.
- Decide whether `paper_citations` should remain the current narrow
  release-backed edge surface or be expanded toward the richer future schema in
  `docs/rag/02-warehouse-schema.md`.
- Decide whether real evidence-wave policy should remain
  `evidence_missing_pmc_bioc` or split into warm/evidence rollout policies.

## Next Recommended Passes

1. Finalize the real mapped-promotion policy with explicit rule families and
   thresholds.
2. Add the first durable warm-wave contract on top of `paper_selection_summary`
   if warm remains a separate serving/indexing phase.
3. Reconcile the warehouse docs so `paper_citations` reflects the narrow live
   implementation versus the fuller future design.
4. Start the chunk/evidence slice with the now-explicit parent universe:
   `corpus -> mapped -> evidence`.
