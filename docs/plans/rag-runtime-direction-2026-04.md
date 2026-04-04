# SoleMD.Graph RAG Runtime Direction

Status: active runtime direction  
Updated: 2026-04-04  
Scope: post-ledger runtime retrieval, grounding, evaluation, and answer-path work  
Companion docs:
- `docs/map/rag.md` for current live state
- `docs/agentic/2026-04-01-solemd-graph-rag-runtime-ledger.md` for the full improvement record through A53
- `docs/plans/full-evidence-system-plan.md` for the broader historical buildout plan

## Why This File Exists

The runtime is no longer in the "design the first vertical slice" phase. The
repo now has a working paper-first RAG service, a grounded-answer runtime, a
large evaluation surface, and a long agentic ledger. That made the old
all-in-one evidence plan too broad to serve as the short operational answer to
"what is live now, what is next, and what should not be changed."

This file is the short future-state plan that starts from the current repo
truth, not from the pre-runtime buildout phase.

Everything below this point is future work, current gaps, or non-live seams. If
it is not reflected in `docs/map/rag.md`, do not treat it as live behavior.

## Current Baseline

The current live baseline is:

- paper-first, release-scoped retrieval
- extractive answer assembly via `baseline-extractive-v1`
- optional chunk-backed grounded answers when answer-linked papers are fully
  covered by `default-structural-v1`
- local graph resolution in DuckDB after backend paper selection
- optional biomedical reranker available but default-off

The broad current-release sampled cohort is healthy on the latest code:

- `.tmp/rag-runtime-eval-current-all-families-v30-recheck.json`
- `96` sampled papers / `288` cases
- `hit_at_1_rate = 1.0`
- `grounded_answer_rate = 1.0`
- `target_in_grounded_answer_rate = 1.0`
- `p95_service_duration_ms = 83.229`
- `p99_service_duration_ms = 99.443`

That broad cohort is not the whole story. The frozen targeted benchmarks still
define the remaining weak classes:

- `engine/.tmp/eval-title_global_v1-20260403.json`
  - retrieval is strong, grounding is weak on the targeted title set
- `engine/.tmp/eval-title_selected_v1-20260403.json`
  - selected-title retrieval is strong, grounded cited output is still thin
- `engine/.tmp/eval-adversarial_router_v1-20260403.json`
  - acronym-heavy and ambiguous sentence queries remain a hard failure class
- `engine/.tmp/eval-neuropsych_safety_v1-20260403.json`
  - grounding can be present on the retrieved papers while the retrieved papers are still wrong

## Live Invariants To Preserve

- Keep the result identity paper-level. Chunk search is a lane, not the result spine.
- Keep retrieval release-scoped through the active graph release.
- Keep grounded answers coverage-gated. Do not claim cited-span grounding when the
  answer-linked set is not fully covered.
- Keep DuckDB as the local graph resolver, not the evidence retriever.
- Keep future generation grounded and citation-backed. No free-form answer mode.
- Prefer extending the existing runtime seams over adding a second parallel path.

## What Exists But Is Not Yet Live

- `QUESTION_LOOKUP` is live in the query classifier and planner.
- `cited_corpus_ids` now crosses the web -> engine boundary, but retrieval and
  ranking do not yet enforce it.
- `engine/app/rag/answer_generation.py` exists, but `search_finalize.py` still
  builds only the extractive baseline answer in the live hot path.
- `engine/app/rag/answer_verification.py` exists, but serving-path
  faithfulness gating is not wired into the hot path.

The practical rule is simple: do not document these seams as live behavior until
the request path actually uses them.

## External Tools To Prefer Over New Custom Infrastructure

The runtime already has a strong custom retrieval and grounding core. The next
tooling work should prefer standard external systems for evaluation,
benchmarking, and experiment management rather than growing a second bespoke
platform around the runtime.

Recommended adoption order:

- keep **Langfuse** as the primary hosted evaluation and experiment surface
  because it already covers the core workflow the runtime needs: traces,
  scores, metrics dashboards, datasets, and experiments on versioned datasets
- use **Ragas** for synthetic RAG testset generation and offline RAG metrics
  such as context precision, context recall, faithfulness, and answer
  relevance; this is the best fit for growing the frozen benchmark matrix
  without building a custom synthetic testset generator
- use **ir_measures** with **pytrec_eval** and/or **ranx** underneath for
  standard retrieval metrics such as MRR, NDCG, precision@k, recall@k, run
  comparison, and fusion experiments instead of maintaining bespoke metric math
- evaluate **Patronus** only when generated answers become a real serving-path
  concern, because its strongest fit is evaluator-driven checks such as
  retrieval answer relevance, retrieval context relevance, retrieval context
  sufficiency, and retrieval hallucination

Secondary options, not primary adoption targets right now:

- **TruLens** is a reasonable open-source fit if an additional local eval layer
  is needed for the RAG triad style checks of context relevance, groundedness,
  and answer relevance, but it should not become a second primary
  observability stack beside Langfuse without a clear need
- **Phoenix** and **Braintrust** are capable evaluation platforms, but adopting
  either as a peer to Langfuse would create platform overlap unless Langfuse
  datasets and experiments prove insufficient for the runtime workflow
- **DeepEval** is useful for pytest-native LLM evals and synthetic generation,
  but should be considered only if the current frozen benchmark plus Langfuse
  experiment flow still leave a real automation gap

Adoption rule:

- do not build custom benchmark registries, experiment UIs, or retrieval metric
  calculators unless the existing external tools demonstrably fail the runtime use case

## Next Phases

### Phase 0: Harden The Benchmark Matrix

The current frozen coverage is useful, but it is still too sentence-heavy and too
overlapping to be the final safety net for the runtime.

Direction:

- add frozen `title_global` cases that cover colon subtitles, question-mark
  titles, abbreviation-heavy titles, Greek-letter titles, and long exact titles
- add frozen `title_selected` cases so selected-paper title rescue is tested on a
  fixed cohort instead of only through sampled runtime runs
- add an adversarial/router benchmark family for acronym-heavy, negated,
  ambiguous, statistical, and short clinical-shorthand queries
- add a frozen `general`-profile cohort so the broad hybrid route is not judged
  only through sampled runs
- report benchmark overlap explicitly and prefer paper-disjoint reporting by
  default
- rationalize the current polarity/conflict benchmark overlap instead of keeping
  near-duplicate suites indefinitely

Success criteria:

- frozen coverage exists across `title_lookup`, `question_lookup`,
  `passage_lookup`, and `general`
- benchmark reports clearly separate paper-disjoint and paper-overlap views

### Phase 1: Close The Frozen Grounding Gap

The title benchmarks are still the clearest signal that retrieval success and
grounded cited output are not yet equivalent on the targeted frozen set.

Direction:

- use the existing `engine/db/scripts/backfill_structural_chunks.py` path rather
  than inventing a second backfill operator
- keep `default-structural-v1` as the active serving version unless a real
  chunk-policy change is justified
- identify the benchmark-target papers that still have canonical blocks but no
  chunk rows, then backfill them through the existing runtime writer seam
- keep the runtime gate semantics aligned to `GroundedAnswerRuntimeStatus.fully_covered`
  and `has_any_coverage`

Success criteria:

- improve `target_in_grounded_answer_rate` on the frozen title benchmarks, not
  only `grounded_answer_rate`
- keep the broad current-release sampled cohort at its current latency floor

### Phase 2: Fix The Remaining Frozen Retrieval Classes

The two live failure classes are now different and should not be treated as one problem.

`adversarial_router_v1`

- primary issue: title-like overclassification and poor ranking behavior on
  acronym-heavy, ambiguous, negated, or clinical-shorthand sentence queries
- expected work: more precise title demotion, better hard-case routing, and
  targeted ranking review on the frozen cohort

`neuropsych_safety_v1`

- primary issue: retrieval/ranking misses on question-like clinical queries,
  despite strong grounding on the papers that are chosen
- expected work: validate the new `QUESTION_LOOKUP` lane on the frozen cohort,
  then widen enrichment entry or high-confidence entity seeding only if the
  cohort still needs it

Success criteria:

- improve `hit_at_1_rate` and `target_in_answer_corpus_rate` on the frozen
  cohorts
- keep the broad sampled current-release cohort clean

### Phase 3: Keep Query Analysis Proof-First

The runtime should keep moving away from brittle surface-form routing whenever a
cheap structural or database-backed proof exists.

Direction:

- prefer selected-paper proofs, exact-title probes, normalized-title checks, and
  title-only FTS probes before classifier-driven route commitment
- keep heuristic routing centralized in the existing query-analysis seams rather
  than letting regex- or token-based checks spread back across the runtime
- only add a heavier structured analyzer if the centralized heuristic path stops
  meeting the frozen benchmark and latency targets
- treat rescue-path growth as a warning that the heuristic router is reaching its
  complexity ceiling

Success criteria:

- fewer benchmark fixes depend on adding one more surface-form exception
- route-signature diversity is explainable from proofs and planner choices, not
  only from lexical heuristics

### Phase 4: Strengthen Species Resolution And Evidence Priors

The runtime already has bounded clinician-facing priors. The gap is that some of
the clinically meaningful signals are too sparse or too tightly gated to carry
their intended weight.

Direction:

- investigate the current `species_unresolved` exposure on clinician-facing
  benchmark papers and fix the missing species-profile coverage
- keep species and study-type signals bounded and auditable
- evaluate whether publication-type and study-family signals should apply more
  directly, instead of being limited by coarse keyword-gated clinical intent
- preserve the current rule that priors assist ranking; they do not replace the
  retrieval substrate

Success criteria:

- clinically relevant cohorts stop wasting the human-vs-nonhuman signal through
  missing species profiles
- any expanded study-type prior improves benchmarks without hiding retrieval regressions

### Phase 5: Extend Thin Typed Safety And Applicability Signals

The runtime is still extractive, but that does not eliminate the need for thin
typed answer-state signals derived from existing evidence.

Direction:

- keep the current typed flag approach, not a new prose answer-state layer
- preserve existing flags such as `direct_passage_support`, `indirect_only`,
  `nonhuman_only`, `species_unresolved`, and `null_finding_present`
- add more typed signals only when they can be computed from the current runtime
  substrate, for example conflict presence, warehouse incompleteness, or stronger
  support/refute disagreement markers
- do not introduce synthesized clinical summaries just to expose these states

Success criteria:

- the UI and evaluation surface can distinguish retrieval success from evidence
  applicability without requiring LLM synthesis
- typed flags remain auditable from current runtime signals

### Phase 6: Decompose `search_finalize.py` Further

The runtime behavior is now stable enough that finalization can be split along
clear stage boundaries without changing the contract.

Direction:

- extract citation/context assembly, ranking/rerank application, answer assembly,
  and graph-signal packaging into focused finalization modules
- keep one public orchestration seam so call sites and tracing stay simple
- do not split for aesthetics alone; each extraction should preserve a real
  stage boundary

Success criteria:

- `search_finalize.py` becomes a narrow orchestrator
- focused tests can exercise each finalization stage directly

### Phase 7: Make Citation Steering Real

The request seam for explicit user-cited papers now exists, but the runtime
still ignores it during retrieval and finalization.

Direction:

- give `cited_corpus_ids` explicit semantics in the backend
- include cited papers in the candidate/evidence surface without blindly
  overriding ranking quality
- keep the outer request/response contract compact; do not add a second ad hoc
  citation channel

Success criteria:

- explicit cited papers reliably survive into evidence assembly when the user
  names them
- ranking quality does not regress on the existing frozen cohorts

### Phase 8: Wire Grounded Generative Answers Carefully

This phase is the answer-generation phase. It is intentionally future-only.

The end state is still a cited-evidence chat experience, but the runtime should
not skip directly from extractive answers to unguarded generation.

Direction:

- keep the current extractive answer path as the stable default
- wire generated cited answers behind a bounded opt-in path
- integrate serving-path faithfulness checks before returning generated output
- preserve the existing paper-first retrieval and grounded-span contracts

Implementation preference:

- extend the current `generate_answer` seam or add a compatible answer-mode
  evolution without breaking the existing request contract
- avoid a disruptive API rename until the serving path is genuinely live

Success criteria:

- generated answers cite only retrieved evidence bundles
- failed verification falls back cleanly to `baseline-extractive-v1`
- grounded cited output remains source-traceable

## Metrics That Actually Matter

For the next passes, use these metrics in this order:

- broad sampled current-release cohort:
  - `hit_at_1_rate`
  - `grounded_answer_rate`
  - `target_in_grounded_answer_rate`
  - `p95_service_duration_ms`
  - `p99_service_duration_ms`
- frozen targeted cohorts:
  - `target_in_answer_corpus_rate`
  - `target_in_grounded_answer_rate`
  - route signatures and stage timing for the slow or wrong cases

Do not call a pass successful because raw retrieval is strong while grounded
target coverage is still weak. The title benchmarks are the standing warning on
that point.

## Do Not Do

- Do not add a second chunk backfill pipeline if the existing script can do the work.
- Do not reframe chunk search as the canonical identity of a result.
- Do not ship an ungrounded generative answer mode.
- Do not let routing heuristics spread back out across the codebase after being centralized.
- Do not document request seams such as `cited_corpus_ids` as if they were
  already live serving behavior.
- Do not let the broad sampled cohort hide frozen benchmark regressions.

## Exit Condition For This Plan

This file should be revised once all of the following are true:

- the frozen title benchmarks are grounded at the target paper level
- the adversarial and neuropsych frozen cohorts no longer define obvious
  routing/retrieval failure classes
- frozen coverage exists across the main retrieval profiles instead of only the
  sentence-style path
- the species and typed-signal gaps are either closed or explicitly deferred with evidence
- `cited_corpus_ids` has real backend semantics
- generated cited answers are either live behind faithfulness gating or have
  been explicitly deferred with evidence
