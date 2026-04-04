# 2026-04-03 RAG Pipeline Critical Analysis + Evaluation Infrastructure

## Scope

- Repo: `/workspaces/SoleMD.Graph`
- Target: RAG evaluation infrastructure, benchmark integrity, observability tooling
- Goal: Critical analysis of the RAG pipeline's evaluation posture, followed by concrete infrastructure to close the identified gaps (Langfuse integration, runtime eval metrics, benchmark hardening, documentation).

## Findings

### Architectural Strengths

1. **Extractive baseline is the right default.** Snippet selection from real papers avoids the hallucination surface area of generative answers entirely. The `baseline-extractive-v1` mode is live and grounded.
2. **Route signatures are first-class.** Every runtime eval case records the full retrieval route (`retrieval_profile`, `search_plan`, channel provenance), making regression attribution tractable.
3. **Proof-first routing.** The retrieval policy gates dense/entity/relation channels on actual query signal rather than speculative classification, keeping the hot path lean.
4. **Paper-first retrieval spine.** Retrieving papers (not passages) as the primary unit keeps ranking stable and grounding auditable.

### Identified Gaps

1. **Benchmark overfit risk.** Three frozen benchmarks (`sentence_hard_v1`, `clinical_actionable_v1`, `evidence_intent_v1`) share a small corpus. Without disjointness enforcement, a ranking tweak that helps one benchmark could silently game another. **Fixed:** paper-disjointness CI test added.
2. **`/clean` compliance: B+.** The runtime eval path was well-modularized after the A-series ledger work, but benchmark prep scripts lived alongside app code and the eval-to-observability bridge was missing.
3. **Evidence applicability gaps.** The system retrieves and grounds papers but did not yet surface thin typed flags for species applicability, null findings, or passage support quality at the API layer. **Fixed:** evidence applicability flag schema added.
4. **No external score ledger.** Runtime eval produced JSON artifacts in `.tmp/` but had no durable experiment-comparison surface. **Fixed:** Langfuse v4 integration added with dataset sync, metric adapters, and experiment runner.

## Tool Stack Decisions

| Tool | Decision | Rationale |
|------|----------|-----------|
| Langfuse v4 | **Adopted** | Score ledger, experiment runner, dataset management. Self-hostable, fits non-profit constraint. |
| RAGAS | **Adapt patterns** | Context precision/recall metrics adapted as deterministic IR metrics rather than importing the full framework. |
| Patronus Lynx 8B | **Planned** | Faithfulness scoring for future generative answers. Ollama-hosted. Not needed until LLM synthesis is live. |
| TruLens | **Patterns only** | Adapted GroundedAnswerRate metric pattern. Did not adopt the framework. |
| DeepEval | **Skipped** | Overlaps with RAGAS/Langfuse; no unique capability for paper-first IR. |

## Implementation Summary

### Implemented (this pass)

- **P0a**: `eval_metrics.py` — deterministic IR metric functions (HitAt1, HitAtK, MRR, NDCG, GroundedAnswerRate)
- **P0b**: `eval_langfuse.py` — Langfuse experiment bridge (dataset sync, score submission, experiment runner)
- **P0c**: Evidence applicability flag schema in `schemas.py` + serialization in `response_serialization.py`
- **P0d**: Paper-disjointness CI test in `test_rag_runtime_benchmarks.py`
- **P0e**: `runtime_eval.py` metric integration — eval summary now computes and attaches IR metrics
- **P0f**: `sync_benchmarks_to_langfuse.py` — one-shot script to push frozen benchmarks into Langfuse datasets
- **P6**: Runtime contract documentation at [`docs/map/rag-info.md`](../map/rag-info.md)

### Deferred

- **Patronus Lynx integration**: blocked on LLM synthesis being live; no faithfulness to score yet
- **RAGAS context precision/recall**: needs passage-level ground truth annotations not yet in benchmarks
- **Adversarial router benchmark**: planned after router rescue-path frequency exceeds 5%
- **Neuropsych safety benchmark**: planned after domain taxonomy coverage is validated against entity_rules

## Priority Rationale

1. Metrics and Langfuse bridge first (P0a-b) — without a score ledger, no experiment is reproducible
2. Evidence flags (P0c) — thin typed signals that ship without LLM dependency
3. Benchmark integrity (P0d) — overfit guard must exist before adding more benchmarks
4. Eval integration (P0e) — wire metrics into the existing eval path rather than a parallel surface
5. Dataset sync (P0f) — makes frozen benchmarks available in Langfuse for experiment runs
6. Documentation (P6) — captures the current contract so future passes start from shared ground truth

## Verification

- `cd engine && uv run pytest test/test_rag_runtime_benchmarks.py -x` — benchmark integrity + disjointness
- Langfuse sync: `cd engine && uv run python scripts/sync_benchmarks_to_langfuse.py` (requires Langfuse credentials)
- Runtime contract: `docs/map/rag-info.md`

## Notes

- This ledger complements the A-series runtime ledger at `2026-04-01-solemd-graph-rag-runtime-ledger.md`.
- Benchmark case counts: `sentence_hard_v1` (14), `clinical_actionable_v1` (15), `evidence_intent_v1` (15) = 44 total frozen cases.
- All three benchmarks are paper-disjoint as of this pass.
