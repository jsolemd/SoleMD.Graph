# Corpus Mapped Evidence Ledger

Date: 2026-04-19
Repo: SoleMD.Graph
Target: corpus-mapped-evidence
Status: completed

## Scope

Refine the post-ingest RAG contract from the earlier `candidate -> mapped -> hot`
shape into the clearer hierarchy:

- `raw`
- `corpus`
- `mapped`
- `evidence`

Operationally:

- `mapped` is the paper-level active universe for embeddings, UMAP/Cosmograph,
  and paper-level serving.
- `evidence` is the smaller subset of mapped that receives full-text
  acquisition, document parsing, chunking, and evidence-unit retrieval.

## Goals

1. Rename current `candidate` semantics to `corpus`.
2. Preserve `mapped` as the stricter active subset.
3. Replace business `hot` semantics with `evidence`.
4. Add a stronger per-paper ranking/policy surface for:
   - corpus admission
   - mapped promotion
   - mapped rollout
   - evidence selection
5. Update the relevant RAG docs in parallel with code/schema changes.

## Open Policy Questions

- Exact corpus-admission thresholds beyond the current broad journal/pattern/entity OR gate.
- Exact mapped-promotion thresholds once reference/relation corroboration is added.
- Exact evidence-priority scoring weights after real-warehouse inspection of the first ranked cohorts.

These remain calibration questions, not blockers. The current implementation now
ships a deterministic first-pass scoring surface and wave policy so the next
iteration can tune thresholds with live warehouse rows rather than guesses.

## Planned Batches

1. Rename the durable contract from `candidate` to `corpus`.
2. Update the summary/ranking surface to reflect `corpus`, `mapped`, and evidence priorities.
3. Define and implement the first evidence child-wave policy using the revised ranking surface.
4. Keep docs aligned in the same batch.
5. Run end-to-end verification on ingest -> corpus -> mapped -> evidence dispatch.

## Parallel Work

- Docs worker A: top-level corpus/schema/handoff docs.
- Docs worker B: ingest/chunking/hot-text/opensearch docs.

## Current State

- Raw ingest boundary is already corrected.
- Corpus selection owns canonical materialization.
- Evidence dispatch is now the canonical child-wave surface and targets the existing `hot_text.acquire_for_paper` runtime.
- Warm is better represented as mapped paper-level rollout than as a separate membership status.

## Completed Batches

1. Refactored the worker/runtime/schema contract from `candidate` to `corpus`.
2. Renamed the mapped child-wave business surface from `hot` to `evidence`.
3. Added ranking columns and selection snapshots:
   - `solemd.paper_selection_summary.{has_open_access,has_pmc_id,has_abstract,reference_out_count,influential_reference_count,mapped_priority_score,evidence_priority_score}`
   - `solemd.corpus_wave_members.{priority_score,selection_detail}`
4. Added warehouse migration `20260419204500_warehouse_corpus_mapped_evidence_contract.sql` to normalize existing rows and run manifests.
5. Ran worker verification:
   - `uv run --project apps/worker pytest apps/worker/tests/test_corpus_cli.py apps/worker/tests/test_corpus_runtime.py -q`
   - `uv run --project apps/worker pytest apps/worker/tests/test_ingest_runtime.py apps/worker/tests/test_corpus_cli.py apps/worker/tests/test_corpus_runtime.py apps/worker/tests/test_hot_text_cli.py apps/worker/tests/test_hot_text_runtime.py -q`
   - Result: `16 passed`

## Next Passes

1. Tune mapped/evidence scoring weights against real warehouse distributions.
2. Add explicit mapped rollout policy surfaces once embeddings/warm indexing is wired.
3. Implement the downstream evidence/chunking slice against the now-explicit mapped/evidence boundary.
