# RAG Scalability Review Addendum: Evidence-Serving Center of Gravity

Superseded as the primary handoff by:

- [rag-future-info.md](/home/workbench/SoleMD/SoleMD.Graph/docs/rag-future-info.md)

Date: 2026-04-13

## Purpose

This addendum evaluates a follow-up critique of the earlier scalability review comparison in:

- [2026-04-13-rag-scalability-review-comparison.md](/home/workbench/SoleMD/SoleMD.Graph/docs/investigations/2026-04-13-rag-scalability-review-comparison.md)

The new critique materially shifts the center of gravity from:

- storage / partitioning / externalizing retrieval

to:

- evidence-serving read models
- child-first retrieval
- MedCPT-class biomedical retrieval
- claim-local citations

This addendum assesses which parts of that shift are well-supported by the current SoleMD.Graph codebase and live measurements, and which parts remain architectural hypotheses rather than repo-grounded conclusions.

## Executive Assessment

The new critique improves the roadmap more than it changes the architecture.

Its strongest contribution is not a new storage design. Its strongest contribution is a better prioritization of what matters next:

- SoleMD.Graph already has a better provenance and grounding spine than many systems ever achieve.
- The near-term weakness is now shortlist formation, parent-child promotion, and clinician-facing evidence assembly.
- That means the next architectural target should be an evidence-serving read model, not another round of warehouse-centric refinement.

I agree with that shift.

I do not think it overturns the earlier conclusions about scale:

- PostgreSQL still should not be the first-stage global chunk retriever.
- chunk-level ANN still should not be implemented inside the canonical warehouse tables.
- cold or rebuildable text still should not remain indefinitely on the hot PostgreSQL heap.

What changes is the implementation order and the framing:

- first solve child evidence retrieval and parent-child promotion
- then solve longer-horizon storage and partition stress

That is a better fit to the current repo state.

## What the New Critique Gets Right

### 1. It correctly re-centers the problem on the miss surface the repo is already reporting

The repo’s own runtime docs already say the expert-suite miss surface is no longer basic concept recovery.

In [docs/map/rag.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/rag.md:117):

- `hit@1 = 0.164`
- `hit@k = 0.279`
- `grounded_answer_rate = 1.000`
- `target_in_answer_corpus = 0.230`
- `0 no-target-signal misses`
- `7 target-visible-not-top1 misses`
- `44 top1 misses`
- and explicitly: `stronger parent-child evidence promotion after recall` is needed

That strongly supports the new critique’s main claim:

- the current frontier is not provenance
- the current frontier is retrieval-stage candidate formation and promotion

That is exactly the right center of gravity for the next phase.

### 2. “Paper-first UI, child-first retrieval” is a better target than “paper-first everywhere”

The current runtime is explicitly paper-first in live docs:

- [docs/map/rag.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/rag.md:23) says the retrieval unit is paper-first.

The current code also merges all lanes into `PaperEvidenceHit` candidates early:

- [retrieval_fusion.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/retrieval_fusion.py:55) merges lexical, chunk, dense, entity, relation, citation, and semantic channels into paper-level objects keyed by `corpus_id`.

At the same time, the repo already contains signs that child evidence matters:

- [search_plan.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/search_plan.py:54) gives `QUESTION_LOOKUP` both paper lexical and chunk lexical
- [search_plan.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/search_plan.py:68) gives `PASSAGE_LOOKUP` chunk lexical priority
- [ranking_support.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking_support.py:501) explicitly scores child evidence corroboration
- [ranking.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking.py:118) adds child evidence into final ranking

So the new critique is not asking for a conceptual reversal. It is asking for the current partial child-evidence lane to become the primary retrieval spine for passage-like evidence queries.

I agree with that direction.

The right refinement is:

- keep paper-first identity in the UI and top-level API
- move passage/question and clinical-evidence retrieval to child-first candidate generation internally
- keep title lookup and some metadata lookups paper-first

### 3. The MedCPT recommendation is stronger than my earlier generic “external dense retrieval” framing

The repo already has MedCPT components in-tree:

- `MedCPTQueryEncoder` in [biomedical_models.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/biomedical_models.py:298)
- `MedCPTArticleEncoder` in [biomedical_models.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/biomedical_models.py:321)
- `MedCPTReranker` in [biomedical_models.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/biomedical_models.py:344)
- the live biomedical reranker is already MedCPT-backed in [biomedical_reranking.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/biomedical_reranking.py:154)

But the live dense query path is still SPECTER2-aligned:

- [query_embedding.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/query_embedding.py:46) uses the `Specter2AdhocQueryEmbedder`
- [docs/map/rag.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/rag.md:33) documents dense retrieval as SPECTER2 ad-hoc query encoding against `solemd.papers.embedding`

That means the new critique is stronger than my earlier recommendation in one important way:

- it does not just say “externalize dense retrieval”
- it says “the runtime biomedical retrieval model should probably stop being SPECTER2-first”

I think that is right.

My updated recommendation is:

- keep SPECTER2 for graph build, paper proximity, and graph/neighbor priors
- run a direct runtime comparison of:
  - current SPECTER2 paper retrieval
  - MedCPT dual-encoder paper retrieval
  - MedCPT child-evidence retrieval
  - MedCPT cross-encoder reranking on the shortlist

The codebase is already prepared for that experiment. It just has not made MedCPT the mainline runtime dense lane yet.

### 4. The “two-plane first, more engines later” implementation order is better

The earlier comparison argued for a final architecture with:

- PostgreSQL
- lexical search engine
- vector engine
- object storage

I still think that is the most plausible end state at `15–20M` hot papers.

But the new critique is right that the first major serving refactor does not need all of that at once.

A cleaner first implementation target is:

- canonical PostgreSQL for grounding and provenance
- one evidence-serving engine for lexical + hybrid + rerank-capable retrieval

OpenSearch can do more of that first cut than my earlier framing emphasized:

- lexical retrieval
- hybrid retrieval
- weighted RRF / score-ranker pipelines
- filtered k-NN
- bounded reranking

So as an implementation sequence, the new critique is better:

1. PostgreSQL + OpenSearch evidence-serving plane
2. only split ANN into Qdrant later if OpenSearch vector retrieval becomes the bottleneck

That is a meaningful refinement.

### 5. Claim-local citation states are a strong product-contract improvement

The current answer contract is still whole-answer oriented:

- [answer.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/answer.py:87) builds a single baseline answer payload
- [grounded_runtime.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/grounded_runtime.py:84) defines `GroundedAnswerRuntimeStatus` with `fully_covered` and `has_any_coverage`
- [grounded_runtime.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/grounded_runtime.py:184) gates coverage at the paper-set level

The new critique’s suggestion:

- `direct_span`
- `indirect_review_or_background`
- `not_rendered`

is not primarily a scale change. It is a better clinician-facing answer contract.

I think that is right if the target behavior is:

- passage-level evidence
- explicit source labels
- “why cited” style explanation
- claim-local trust semantics

This is an important next-step recommendation.

## What the New Critique Overstates or Needs Tightening

### 1. Weighted RRF is not missing; it is already in the repo

The critique says the current ranking stack should move to weighted RRF.

That is directionally fair but not repo-accurate as written.

The repo already uses weighted RRF:

- [ranking_support.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking_support.py:26) defines `RRF_K`
- [ranking_support.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking_support.py:27) defines weighted RRF channel profiles
- [ranking.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking.py:140) computes the cross-channel RRF contribution directly

The real issue is not “RRF is absent.”

The real issue is:

- weighted RRF is only the first layer
- after that, the score becomes a long additive combination of title similarity, chunk lexical, title anchor, citation, entity, relation, dense, metadata, publication type, evidence quality, clinical prior, intent, MedCPT rerank, passage alignment, passage structure, child evidence, and direct-match adjustment in [ranking.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/ranking.py:172)

So the better reformulation is:

- keep weighted RRF as the first-stage fusion
- simplify or compartmentalize the second-stage additive scoring
- make child-to-parent promotion and claim-evidence arbitration more explicit

That is more precise than saying the repo needs to “move to RRF.”

### 2. “Paper-first UI, child-first retrieval” should not be universal

I agree with the direction, but not as a blanket rule for every query class.

The repo’s query profiles already differentiate intent:

- title lookup
- question lookup
- passage lookup
- general lookup

as seen in [search_plan.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/rag/search_plan.py:40)

I would apply child-first retrieval to:

- `PASSAGE_LOOKUP`
- `QUESTION_LOOKUP`
- some clinician-oriented `GENERAL` queries that are obviously evidence seeking

I would not force child-first retrieval into:

- exact title lookup
- citation-style metadata retrieval
- some graph-selected or scope-restricted paper discovery flows

So the target should be:

- child-first evidence retrieval where the user is asking for evidence
- paper-first retrieval where the user is asking for papers

### 3. The “do not focus on partition surgery” point is correct near-term, but weaker for the original scale question

For the next product-improvement cycle, I agree:

- do not make repartitioning the headline project

For the original architecture question, the storage and partition analysis still matters:

- if a large hot grounding surface remains in PostgreSQL
- if chunk versions accumulate
- if sentence and chunk-member tables approach the projected billions of rows

then partition count and hot/cold surface reduction still become real operational concerns.

So the right synthesis is:

- for retrieval quality: the new critique is right to deprioritize partition work
- for long-horizon scale: partitioning still matters, just not first

### 4. OpenSearch-only is the best next step, not necessarily the final state

I agree that OpenSearch-first is the best next implementation step.

I am less confident that it remains the whole answer at the far end of the target range.

At `15–20M` hot papers with explicit child evidence units, the evidence-unit count can become very large:

- sentence windows
- paragraph surfaces
- captions
- table rows
- other specialized evidence units

If vector-heavy child retrieval becomes dominant, a dedicated ANN plane may still be the cleaner final state.

So my revised recommendation is:

- implementation next step: PostgreSQL + OpenSearch
- plausible later split: PostgreSQL + OpenSearch + Qdrant if child ANN becomes its own scale or latency wall

That is closer to the evidence than treating either architecture as mandatory from day one.

### 5. `pg_lake` should stay demoted

The new critique correctly pushes back on putting `pg_lake` or a remote lake bridge in the hot path too early.

I agree.

Object storage for cold or rebuildable text still makes sense. What I would not commit to yet is:

- a specific remote SQL bridge as part of the latency-sensitive runtime contract

That remains an implementation option, not the default answer.

## Revised Synthesis

This is the synthesis I would now recommend after considering the new critique.

### Architectural target

- PostgreSQL remains the canonical provenance, grounding, and alignment store.
- PostgreSQL stops being the first-stage global chunk retriever.
- The next major build target is an evidence-serving read model, not another warehouse-first refinement.
- Passage/question evidence retrieval becomes child-first internally.
- The user-facing result identity remains paper-first.

### Retrieval target

- lexical and hybrid first-stage retrieval should move to an evidence-serving engine
- weighted RRF remains the first-stage lane fusion primitive
- the second-stage score should shift away from broad additive feature soup and toward explicit child-to-parent promotion plus bounded reranking
- MedCPT should become the primary biomedical retrieval experiment path for runtime dense retrieval
- SPECTER2 should likely remain for graph and paper-proximity use, not as the dominant online biomedical evidence retriever

### Grounding target

- grounded packet assembly remains in PostgreSQL
- stable evidence IDs should round-trip into PostgreSQL for authoritative offsets, citations, and lineage
- the answer contract should evolve from whole-answer grounded status toward claim-local evidence states

### Storage target

- do not keep scaling PostgreSQL chunk FTS
- do not keep all rebuildable runtime text on the hot PostgreSQL heap forever
- but do not make remote lake access part of the hot path until it is proven under production latency constraints

## Recommended Implementation Order

This is the implementation order I would now recommend.

1. Build an evidence-serving index around child evidence units with stable IDs.
2. Route passage/question retrieval through that child evidence surface first.
3. Compare current SPECTER2 runtime dense retrieval with MedCPT paper and child retrieval on the existing benchmark suites.
4. Keep weighted RRF, but simplify post-RRF arbitration and make child-to-parent promotion explicit.
5. Add claim-local citation and source-label states to the answer contract.
6. Only then decide whether:
   - OpenSearch vector is enough
   - a Qdrant split is needed
   - repartitioning and hot/cold text migration need to move from planned to urgent

## Questions for a Next External Reviewer

1. Given the current miss surface in [docs/map/rag.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/rag.md:154), should the next optimization budget go first to child evidence indexing and promotion, or to dense model migration?
2. Is OpenSearch alone sufficient as the next evidence-serving plane for both lexical and hybrid retrieval, or should the team plan a near-term ANN split?
3. What is the right evidence-unit ontology for SoleMD.Graph:
   - sentence
   - sentence window
   - paragraph
   - results paragraph
   - abstract conclusion
   - figure caption
   - table row
4. Should claim-local grounding states become the primary answer contract before any large storage migration?
5. What is the cleanest benchmark design for measuring child recall, parent promotion quality, and citation precision separately from whole-answer groundedness?

## Final Judgment

The new critique is a meaningful upgrade in roadmap quality.

It does not invalidate the earlier scalability conclusions. It improves the prioritization of what should happen next.

My final position after considering it is:

- keep the earlier architecture split
- adopt the new critique’s evidence-serving center of gravity
- treat child-first retrieval as the main next runtime direction for evidence-seeking queries
- treat MedCPT as the main candidate to replace SPECTER2 in the online biomedical retrieval lane
- treat OpenSearch-first as the best next serving-plane move
- keep PostgreSQL as the authoritative grounder
- defer partition surgery and lake-bridge decisions until after the evidence-serving refactor is underway

That is the strongest combined reading of:

- the repo contracts
- the live measurements
- the existing benchmark miss surface
- and the new critique
