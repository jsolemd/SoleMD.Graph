# RAG Handoff

Updated: 2026-04-11

## Purpose

This document is a transfer-grade overview of the live SoleMD.Graph RAG system as it exists now. It is meant for another agent to read once, orient quickly, and then move directly into analysis or implementation without reconstructing the full thread history.

This is not a speculative design doc. It distinguishes:
- what is live now
- what was tried and rejected
- what the benchmark numbers actually mean
- what the next implementation order should be

Companion docs:
- `docs/map/rag.md`: stable current-state runtime map
- `docs/map/benchmark.md`: benchmark policy and current benchmark status
- `docs/agentic/2026-04-10-rag-expert-language-canonicalization-handoff.md`: working ledger of the expert-canonicalization campaign
- `docs/investigations/2026-04-11-biomedical-expert-canonicalization-warehouse-audit.json`: warehouse coverage audit

---

## Executive Summary

The current SoleMD.Graph RAG system is real, benchmarkable, and grounded, but it is not yet strong enough on the hard expert biomedical retrieval surface that matters most.

The live truth is:
- the broad runtime floor is stable, fast, and grounded
- the difficult expert benchmark is still weak on retrieval quality
- the old `no_target_signal` canonicalization failures have now been converted into ontology-backed concept matches upstream of retrieval
- the dominant remaining problem is not basic canonicalization anymore; it is turning recovered concepts into stronger shortlist formation, parent-child recall, and top-rank conversion

The most important current benchmark denominator is **not** the raw 64-case expert suite. It is the **61 structure-complete cases** inside that suite. Those are the cases with full `chunks_entities_sentence` warehouse depth and therefore the only fair surface for retrieval evaluation.

Current accepted ranking mainline on the 61-case gate:
- run: `expert-structure61-general-direct-priority-2026-04-11`
- `hit@1 = 0.164`
- `hit@k = 0.279`
- `grounded_answer_rate = 0.951`
- `target_in_answer_corpus = 0.230`
- `p95_duration_ms = 298.6`

Current live upstream canonicalization pass on the same 61-case gate:
- run: `expert-structure61-composite-ontology-phrases-underresolved-2026-04-11`
- `hit@1 = 0.164`
- `hit@k = 0.279`
- `grounded_answer_rate = 1.000`
- `target_in_answer_corpus = 0.230`
- `p95_duration_ms = 324.4`

Current miss taxonomy on the same denominator:
- `no_target_signal = 0`
- `target_visible_not_top1 = 7`
- `top1_miss = 44`

Interpretation:
- upstream expert-language canonicalization is no longer the cleanest failure bucket
- ranking and parent-child evidence promotion are now the main bottlenecks
- the system is usually grounded in some evidence, but it is often not grounded in the right target evidence on the hard suite

---

## Core Objective

The target is first-class biomedical RAG for expert users:
- medical students
- residents
- attending physicians
- neuroscientists
- biomedical researchers

This is not a consumer lay-language translation product.

The retrieval target is therefore **expert-language canonicalization**, not consumer rephrasing. The system must handle queries such as:
- `rebound panic after stopping SSRIs`
- `can't sit still from antipsychotics`
- `mania after high-dose dex`
- `prednisone neuropsychiatric symptoms`
- `anti-NMDAR encephalitis psychosis first episode`

That means the system has to bridge:
- shorthand clinical phrasing
- relation-heavy biomedical phrasing
- syndrome-level canonicalization
- parent paper recall plus child evidence grounding

The long-term shape is OpenEvidence-like in spirit:
- paper recall first
- child evidence recall second
- grounded extractive citation support now
- future generative synthesis on top of a trustworthy retrieval surface later

---

## Current Runtime Architecture

### High-Level Flow

```text
User query
  -> request normalization and routing
  -> upstream entity and concept enrichment
  -> multi-lane paper retrieval
  -> candidate fusion
  -> ranking and arbitration
  -> evidence bundle assembly
  -> grounded answer construction
  -> Langfuse trace + benchmark scoring
```

### Runtime Request Boundary

Live entrypoint:
- `engine/app/rag/service.py`

The service orchestrates:
- repository access
- query embedding
- optional biomedical reranking
- execution of the search pipeline
- grounded answer construction
- Langfuse trace updates

Relevant orchestration excerpt:

```python
from app.rag.search_execution import execute_search
from app.rag.grounded_runtime import build_grounded_answer_from_runtime

class RagService:
    def __init__(
        self,
        repository: RagRepository | None = None,
        warehouse_grounder=None,
        query_embedder: RagQueryEmbedder | None = None,
        biomedical_reranker: RagBiomedicalReranker | None = None,
    ):
        self._repository = repository or PostgresRagRepository()
        self._query_embedder = query_embedder or get_query_embedder()
        self._biomedical_reranker = (
            biomedical_reranker or get_runtime_biomedical_reranker()
        )
```

Important current-state constraints:
- retrieval unit is still **paper-first**
- grounding unit is **chunk-backed cited spans when answer-linked papers are fully covered**
- current answer mode is still `baseline-extractive-v1`
- `generate_answer` does not yet mean unrestricted generative synthesis
- dense chunk ANN is not in the live path
- chunk retrieval is lexical over `solemd.paper_chunks`
- MedCPT reranking exists but remains bounded and selective

### Query Routing

The runtime uses retrieval profiles to shape the active lanes and the ranking policy:
- `title_lookup`
- `question_lookup`
- `passage_lookup`
- `general`

Current policy decision:
- keep concept and chunk recovery enabled for recall
- do not mutate a recovered query into a different profile mid-flight
- use ranking, not route mutation, as the main arbitration surface

This is deliberate. Mid-retrieval route mutation caused regressions and was parked.

---

## Upstream Canonicalization and Concept Bridge

### What Problem This Layer Solves

The expert-suite failure mode was originally upstream: expert shorthand often failed to resolve into actionable biomedical concepts before retrieval. That produced `no_target_signal` misses.

The current canonicalization layer is meant to:
- keep ordinary exact biomedical queries on the fast path
- only perform supplemental vocab rescue when the initial entity resolution is under-resolved
- map expert shorthand into ontology-backed concept packages before retrieval begins

### Main Runtime Enrichment Hook

Live file:
- `engine/app/rag/search_retrieval.py`

Current enrichment path:

```python
query_phrases = build_runtime_entity_resolution_phrases(
    query.focused_query or query.query,
    retrieval_profile=query.retrieval_profile,
    normalized_query=query.normalized_query,
)

resolved = repository.resolve_query_entity_terms(
    query_phrases=query_phrases,
    limit=5,
)
query.entity_terms = resolved.all_terms
query.high_confidence_entity_terms = resolved.high_confidence_terms
query.resolved_entity_concepts = resolved.resolved_concepts
query.vocab_concept_matches = resolved.vocab_concept_matches
```

This is important because `vocab_concept_matches` now appears in live Langfuse traces and therefore became benchmark-visible rather than invisible debug state.

### Composite Phrase Generation

Live file:
- `engine/app/rag/_query_enrichment_phrases.py`

Recent live addition:

```python
if has_discontinuation_cue and has_antidepressant_cue:
    derived.extend(
        [
            "antidepressant discontinuation syndrome",
            "withdrawal syndrome",
        ]
    )

if has_antipsychotic_cue and has_restlessness_cue:
    derived.extend(
        [
            "drug induced akathisia",
            "akathisia",
            "antipsychotics",
        ]
    )

if has_corticosteroid_cue and has_neuropsych_cue:
    derived.extend(
        [
            "corticosteroid psychiatric effects",
            "steroid psychosis",
        ]
    )
```

This is **not** meant as an ever-growing list of hand-authored queries. The scalable unit is the biomedical event frame, not the surface phrase.

These current frames are only the first proof of shape:
- discontinuation syndrome frame
- akathisia frame
- corticosteroid neuropsychiatric frame

### Repository Resolution and Supplemental Vocab Rescue

Live file:
- `engine/app/rag/repository_seed_search.py`

Relevant live logic:

```python
concepts = self._resolve_query_entity_concepts(
    query_phrases=query_phrases,
    limit=limit,
)
trusted_concepts = self._trusted_query_resolution_concepts(concepts)
supplemental_query_phrases = (
    self._supplemental_vocab_query_phrases(
        query_phrases=query_phrases,
        concepts=trusted_concepts,
    )
    if self._should_query_supplemental_vocab_rows(trusted_concepts)
    else []
)
supplemental_vocab_rows = (
    self._resolve_vocab_concept_rows(...)
    if supplemental_query_phrases
    else []
)
vocab_concept_matches = self._build_vocab_concept_matches(...)
```

The critical policy here is the gating condition around supplemental vocab lookup.

Rejected variant:
- broad global widening of the entity lane with exact vocab matches
- result: benchmark-negative and severe latency regression

Accepted live variant:
- only trigger supplemental vocab rescue when initial entity resolution is under-resolved
- preserve the old exact-query fast path for ordinary biomedical questions

### Concept Bridge Helpers

Live file:
- `engine/app/rag/search_retrieval_concepts.py`

These helpers are the next major leverage point because they already convert recovered concepts into expansion and rescue material, but they are not yet strong enough in the live shortlist.

Relevant excerpt:

```python
def dense_query_text(query: PaperRetrievalQuery) -> str:
    base_query = query.focused_query or query.query
    expansion_terms = concept_query_expansion_terms(query)
    if not expansion_terms:
        return base_query
    return "; ".join([base_query, *expansion_terms])


def concept_paper_rescue_queries(query: PaperRetrievalQuery) -> list[str]:
    source_query = query.focused_query or query.query
    expansion_terms = concept_query_expansion_terms(query)
    ...
```

This file should be treated as the current bridge between ontology-backed concept recovery and actual retrieval behavior.

---

## Retrieval Lanes

The live runtime uses multiple cheap structural signals rather than a single retrieval channel.

Active or partially active retrieval assets include:
- paper lexical retrieval
- chunk lexical retrieval
- dense paper retrieval via SPECTER2 ad-hoc query encoding against `solemd.papers.embedding`
- entity seed retrieval
- relation seed retrieval
- citation-context support
- semantic-neighbor retrieval
- bounded MedCPT reranking for specific clinician-intent passage conditions

The important architectural point is that these are already cheap, precomputed, or bounded signals. The current evidence does **not** support adding live graph traversal before these are being used well.

### Current Retrieval Philosophy

The live philosophy is:
- use multiple paper-level candidate lanes
- prefer precomputed structure over live graph exploration
- keep query-time costs bounded
- keep benchmarks honest by separating warehouse coverage problems from retrieval problems

---

## Ranking and Arbitration

Live file:
- `engine/app/rag/ranking.py`

The ranker uses fused channel scores plus a set of structured priors:
- title similarity
- chunk lexical support
- title anchor score
- citation support
- entity support
- relation support
- dense score
- metadata support
- evidence quality
- clinical priors
- biomedical reranker score
- passage alignment / structure
- child evidence corroboration
- direct-match adjustment

Relevant excerpt:

```python
hit.fused_score = (
    channel_fusion_score
    + (hit.title_similarity * score_profile.title_similarity_weight)
    + (hit.chunk_lexical_score * score_profile.chunk_lexical_weight)
    + (hit.title_anchor_score * score_profile.title_anchor_weight)
    + (hit.selected_context_score * score_profile.selected_context_weight)
    + (hit.cited_context_score * score_profile.cited_context_weight)
    + (hit.citation_boost * score_profile.citation_weight)
    + (hit.citation_intent_score * score_profile.citation_intent_weight)
    + (hit.entity_score * score_profile.entity_weight)
    + (hit.relation_score * score_profile.relation_weight)
    + (hit.dense_score * score_profile.dense_weight)
    + (hit.metadata_score * score_profile.metadata_weight)
    + (hit.publication_type_score * score_profile.publication_type_weight)
    + (hit.evidence_quality_score * score_profile.evidence_quality_weight)
    + (hit.clinical_prior_score * score_profile.clinical_prior_weight)
    + (hit.intent_score * score_profile.intent_weight)
    + (hit.biomedical_rerank_score * score_profile.biomedical_rerank_weight)
    + (hit.passage_alignment_score * score_profile.passage_alignment_weight)
    + (hit.passage_structure_score * score_profile.passage_structure_weight)
    + child_evidence_score
    + _direct_match_adjustment(...)
)
```

Current accepted general-profile sort behavior:

```python
return (
    _general_direct_signal_priority(item),
    item.fused_score,
    item.biomedical_rerank_score,
    item.chunk_lexical_score,
    item.semantic_score,
    item.lexical_score,
    item.selected_context_score,
    item.cited_context_score,
    item.citation_count or 0,
    item.corpus_id,
)
```

What this means operationally:
- the system already has a decent set of structural ranking features
- recent accepted changes improved rank conversion only incrementally
- the main ranking bottleneck now appears after canonical concepts are recovered, not before

---

## Grounding and Answer Assembly

Current answer mode remains grounded and extractive.

Live expectations:
- return evidence bundles from ranked papers
- ground the answer against retrieved evidence
- preserve cited spans when warehouse coverage is complete
- avoid moving into freeform generative synthesis before retrieval quality is stronger

This distinction matters because current `grounded_answer_rate` values are high even when `hit@1` is weak. The system is often grounded in some evidence, but not reliably in the correct target evidence on the difficult expert suite.

---

## Observability and Langfuse

The system is instrumented deeply enough that retrieval diagnostics are now actionable.

Live file:
- `engine/app/rag/service.py`

Important trace metadata already captured:
- retrieval profile
- clinical intent
- entity terms
- resolved entity concepts
- vocab concept matches
- stage durations
- candidate counts
- session flags
- evidence bundles and rank features

Relevant excerpt:

```python
client.update_current_generation(
    metadata={
        "retrieval_profile": str(query.retrieval_profile),
        "clinical_intent": str(query.clinical_intent),
        "entity_terms": query.entity_terms[:10],
        "resolved_entity_concepts": [...],
        "vocab_concept_matches": [...],
        "stage_durations_ms": debug.get("stage_durations_ms", {}),
        "candidate_counts": debug.get("candidate_counts", {}),
        "session_flags": debug.get("session_flags", {}),
        "duration_ms": result.duration_ms,
    },
)
```

This is what made the current campaign possible. The system is no longer flying blind.

---

## Corpus and Knowledge Assets

The large-scale knowledge substrate already exists. The current challenge is making better use of it.

Relevant assets:
- PubTator entities
- PubTator relations
- MeSH-backed vocabulary concepts and aliases
- UMLS-linked alias information
- Semantic Scholar citation structure
- semantic-neighbor signals
- paper -> chunk -> sentence warehouse hierarchy
- graph release scoping through `solemd.graph_points`

This matters for planning because the project does **not** need a wholesale new extraction system to begin acting more graph-aware or more ontology-aware. It already has the ingredients.

---

## Benchmark and Evaluation Architecture

### Two Different Truths in the Repo

There are two evaluation truths at once.

1. Broad sampled runtime floor.
2. Hard expert benchmark surface.

Broad sampled runtime floor:
- artifact: `.tmp/rag-runtime-eval-current-all-families-v30-recheck.json`
- `96` sampled papers / `288` cases
- `hit@1 = 1.0`
- `grounded_answer_rate = 1.0`
- `target_in_grounded_answer_rate = 1.0`
- `p95_service_duration_ms = 83.229`

This is operationally useful, but it is not the right surface for judging expert biomedical retrieval quality.

The hard surface is `biomedical_expert_canonicalization_v1`.

### Why the 61-Case Gate Exists

The raw expert suite has 64 cases. Those 64 cases are not equally warehouse-complete.

Current audit state:
- `61` structure-complete
- `63` grounding-ready
- `2` entity-thin
- `1` sparse

Operational benchmark policy now uses the `61` structure-complete cases via suite gating:
- `rag_benchmark.py --use-suite-gates`
- benchmark catalog gate: `gate_warehouse_depths=("chunks_entities_sentence",)`

This is the only denominator that should be used for clean retrieval comparisons right now.

### Why Coverage Was a Major Confound

Before the backfill campaign:
- only `5 / 64` expert-suite targets had full child-evidence coverage
- `59 / 64` were present in `graph_points` but absent from documents, chunks, entity mentions, or sentence seeds

After the backfill and audit work:
- the suite moved to `61` structure-complete / `63` grounding-ready / `1` sparse
- title-fidelity debt on recovered papers was cleared
- the benchmark stopped conflating missing warehouse rows with true retrieval failure at the same scale as before

---

## Current Benchmark Status

### Structure-Complete Expert Surface

Current review surface:
- `61` included / `3` excluded

Baseline on that denominator:
- run: `expert-structure61-2026-04-11`
- `hit@1 = 0.131`
- `hit@k = 0.262`
- `grounded_answer_rate = 0.934`
- `target_in_answer_corpus = 0.164`
- `p95_duration_ms = 383.6`

Previous accepted run:
- run: `expert-structure61-rerank-direct-mainline-2026-04-11`
- `hit@1 = 0.148`
- `hit@k = 0.279`
- `grounded_answer_rate = 0.951`
- `target_in_answer_corpus = 0.213`
- `p95_duration_ms = 315.8`

Current accepted ranking run:
- run: `expert-structure61-general-direct-priority-2026-04-11`
- `hit@1 = 0.164`
- `hit@k = 0.279`
- `grounded_answer_rate = 0.951`
- `target_in_answer_corpus = 0.230`
- `p50_duration_ms = 153.0`
- `p95_duration_ms = 298.6`

Current live canonicalization run:
- run: `expert-structure61-composite-ontology-phrases-underresolved-2026-04-11`
- `hit@1 = 0.164`
- `hit@k = 0.279`
- `grounded_answer_rate = 1.000`
- `target_in_answer_corpus = 0.230`
- `p50_duration_ms = 153.3`
- `p95_duration_ms = 324.4`

Delta from accepted ranking mainline to live canonicalization pass:
- `hit@1: flat`
- `hit@k: flat`
- `grounded_answer_rate: +0.049`
- `target_in_answer_corpus: flat`
- `p50_duration_ms: +0.322 ms`
- `p95_duration_ms: +25.779 ms`

### What These Numbers Mean

These numbers are weak for the target standard.

Interpretation:
- `hit@1 = 0.164` means the exact target paper is ranked first in about `10 / 61` cases
- `hit@k = 0.279` means the target paper appears somewhere in the retrieved set in about `17 / 61` cases
- `target_in_answer_corpus = 0.230` means the final answer actually uses the target paper in about `14 / 61` cases
- `grounded_answer_rate` being high means the system is usually grounded in retrieved evidence, but often not the right target evidence

So the current system is:
- operational
- grounded
- benchmarkable
- but still poor on the hard expert retrieval surface

### Current Miss Taxonomy

Current live miss taxonomy on the 61-case gate:
- `no_target_signal = 0`
- `target_visible_not_top1 = 7`
- `top1_miss = 44`

This is the single most important diagnosis in the system right now.

Interpretation:
- `no_target_signal = 0`: the canonicalization layer now successfully surfaces ontology-backed concepts for the old no-signal cases
- `target_visible_not_top1 = 7`: ranking still fails to promote the correct paper even when it is visible in the shortlist
- `top1_miss = 44`: the dominant remaining problem is broader shortlist formation and parent-child evidence conversion

---

## What Was Tried Recently

### Accepted: General Direct Priority in Ranking

Accepted and live:
- preserve fused ordering
- let rerank-confirmed multi-lane direct evidence outrank citation-context-only winners in `GENERAL`

Result:
- improved `hit@1` from `0.148 -> 0.164`
- improved `target_in_answer_corpus` from `0.213 -> 0.230`
- reduced `p95` from `315.8 -> 298.6`

This was modest, but positive.

### Accepted: Composite Expert-Language Canonicalization with Under-Resolved Rescue

Accepted as a structural live improvement:
- composite phrase generation for discontinuation, akathisia, and corticosteroid neuropsychiatric frames
- tightened supplemental vocab lookup so it only fires when the initial entity resolution is under-resolved

Result:
- removed the `no_target_signal` bucket
- kept top-line retrieval flat
- added a small but acceptable p95 cost

This is important because it cleaned the failure surface even though it did not yet improve top-line retrieval.

### Rejected: Broad Entity-Lane Augmentation

Rejected run:
- `expert-structure61-entity-lane-augment-2026-04-11`

Outcome:
- `hit@1` regressed
- `target_in_answer_corpus` regressed
- `p95` exploded to about `1178 ms`

Conclusion:
- do not widen the entity lane indiscriminately just because exact ontology matches exist

### Rejected: Additional Passage/Question Local Corroboration Sort Change

A narrower passage/question ordering experiment was also tried and rejected because it was benchmark-flat on the accepted surface. The correct `/clean` decision was to revert it.

---

## What the Current Canonicalization Layer Actually Changed

The most recent live canonicalization pass now resolves the former `no_target_signal` examples into ontology-backed concepts before retrieval.

Examples observed in live traces or resolver output:

- `rebound panic after stopping SSRIs`
  - `Antidepressant Discontinuation Syndrome`
  - `Withdrawal Syndrome`
  - `Selective Serotonin Reuptake Inhibitor (SSRI)`

- `can't sit still from antipsychotics`
  - `Akathisia`
  - `Drug-Induced Akathisia`

- `mania after high-dose dex`
  - `Steroid Psychosis`
  - `Corticosteroid Psychiatric Effects`

This is a real structural improvement. It means the system is no longer failing at the level of concept recovery for these query shapes.

It also sharpens the diagnosis: the recovered concepts are not yet turning into winning paper rank.

---

## Why This Is Still Scalable

A common objection is that this looks like hand-authoring phrase families forever.

That would not scale.

The scalable unit is **not** the query string. The scalable unit is the **biomedical event schema** or **concept package**.

The intended architecture is:
- ontology substrate at scale
- compact event-frame layer on top of it
- bounded proposal assistance from AI
- deterministic retrieval behavior after grounding

That means the manual part is measured in reusable schema families, not millions of phrases.

Examples of scalable frame families:
- treatment -> adverse effect
- treatment discontinuation -> syndrome
- disease -> manifestation
- biomarker or genotype -> risk or response
- infection or immune state -> neuropsychiatric sequelae
- autoimmune process -> psychiatric presentation

The current three live frames are just proof-of-shape, not the final scope.

---

## Role of Generative AI

Generative AI should be used, but not as unconstrained runtime authority.

### Good Uses

Use AI to:
- analyze Langfuse misses offline
- propose candidate concept packages
- propose additional grounded expansions
- help cluster new failure families into reusable schema patterns

### Bad Uses

Do not use AI to:
- freely rewrite every live query into arbitrary biomedical prose
- invent ungrounded concepts
- become the authoritative runtime source of truth for retrieval routing

### Why the Constraint Exists

The current evidence and literature suggest that unconstrained LLM query expansion can hurt retrieval on ambiguous or unfamiliar queries. That risk is higher, not lower, in biomedical retrieval.

The bounded design should be:
- AI proposes
- ontology validates
- retrieval executes deterministically

---

## Graph: Where It Helps and Where It Does Not

### Decision

Do **not** replace the current retrieval stack with LightRAG or GraphRAG wholesale.

Do **add** a precomputed biomedical graph read-model that feeds retrieval and reranking.

### Why

The project already has stronger raw structure than most GraphRAG users:
- PubTator entities
- PubTator relations
- MeSH and UMLS-backed aliases
- citation structure
- semantic-neighbor signals
- paper -> chunk -> sentence hierarchy

A wholesale GraphRAG replacement would mostly spend compute rebuilding a noisier graph from text that is already structurally available.

### Right Use of Graph in This Repo

Use graph as an offline or precomputed read-model for:
- candidate expansion
- shortlist priors
- concept-paper relation support
- relation-aware rerank support
- narrative or multi-hop evidence support

Do **not** default to live query-time graph walks in the hot path.

### Where Graph Likely Helps Most

Graph support is most promising for:
- broad narrative questions
- relation-heavy biomedical explanation questions
- mechanism or pathway style retrieval

It is less likely to be the immediate fix for:
- direct adverse-effect evidence questions
- direct syndrome targeting
- exact target-paper ranking on already recovered concept packages

---

## Current Architectural Decisions

Accepted:
- keep the hybrid paper-first parent-child RAG backbone
- keep ontology-backed expert canonicalization upstream of retrieval
- keep title and chunk recovery for recall
- keep ranking, not route mutation, as the main arbitration surface
- use suite-gated benchmark review on the 61 structure-complete expert cases
- treat graph as a precomputed support layer, not a default live traversal engine

Rejected or deferred:
- broad entity-lane widening
- indiscriminate supplemental vocab rescue
- title-profile demotion after fallback recovery in the hot path
- unconstrained LLM query rewriting
- live graph traversal as default serving behavior

---

## External Repo Review: What To Borrow

This section summarizes the external repos reviewed during the current pass:
- `NirDiamant/agents-towards-production`
- `agentset-ai/agentset`
- `NirDiamant/RAG_Techniques`

Operational note:
- `gh` was attempted first, but the local `gh` client is unauthenticated in this environment and returned `401 Bad credentials`
- review was therefore done through the public repo pages, raw GitHub files, and public documentation

### 1. `agents-towards-production`

Repo:
- <https://github.com/NirDiamant/agents-towards-production>

What it is:
- mainly an agent platform, deployment, tracing, security, and evaluation tutorial collection
- useful for production-agent ergonomics
- not primarily a retrieval-science repo

What is relevant to SoleMD.Graph:
- evaluation scenario generation and behavioral testing mindset from the IntellAgent tutorial
- strong observability emphasis from the LangSmith tutorial
- reminder that document parsing, chunking, retrieval, reranking, and evaluation matter more than generic agent orchestration in RAG systems

What is not the right near-term fit:
- multi-agent orchestration as a core retrieval strategy
- generic memory systems like Mem0 or Cognee as a substitute for biomedical evidence retrieval
- additional tracing frameworks, since Langfuse already fills that role here

Takeaway:
- borrow the evaluation mindset, not the agent runtime stack

### 2. `agentset`

Repo:
- <https://github.com/agentset-ai/agentset>

Relevant docs:
- Search: <https://docs.agentset.ai/search-and-retrieval/search>
- Ranking: <https://docs.agentset.ai/search-and-retrieval/ranking>
- Citations: <https://docs.agentset.ai/search-and-retrieval/citations>
- Filtering: <https://docs.agentset.ai/search-and-retrieval/filtering>
- Agentic RAG with AI SDK: <https://docs.agentset.ai/search-and-retrieval/ai-sdk-integration>
- Tabular data: <https://docs.agentset.ai/data-ingestion/tabular-data>

What is relevant to SoleMD.Graph:
- hybrid retrieval as a first-class default rather than a side feature
- reranking by default on a bounded candidate pool
- explicit `rerankLimit` control to widen the candidate set without exploding response cost
- metadata-first narrowing and filtering to improve both relevance and latency
- citations treated as a first-class UI and response contract
- table-aware ingestion that preserves header-row relationships instead of flattening them away
- bounded agentic retrieval loops: generate query -> search -> evaluate -> optionally search again

How this maps to our current system:
- we already have a hybrid substrate, but our shortlist formation is underpowered on the hard expert benchmark
- we already have bounded MedCPT reranking, but its coverage is too narrow
- we already have grounding and citation infrastructure, so the relevant lesson is not UI polish; it is stronger child evidence selection
- the most useful operational pattern from Agentset is not their hosted product shape; it is the combination of rerank breadth, filtering, and bounded iterative retrieval

Takeaway:
- the best ideas to borrow are broader bounded reranking, metadata-aware narrowing, and adaptive retrieval only when confidence is low

### 3. `RAG_Techniques`

Repo:
- <https://github.com/NirDiamant/RAG_Techniques>

What it is:
- a much more retrieval-relevant technique catalog than the agent platform repos

Most relevant techniques for SoleMD.Graph:
- proposition chunking
- contextual chunk headers
- relevant segment extraction
- fusion retrieval
- reranking
- hierarchical indices
- adaptive retrieval
- end-to-end RAG evaluation
- Open-RAG-Eval

Why these matter for our current bottlenecks:
- `no_target_signal` is now `0`, so the next wins are less likely to come from more phrase growth
- `target_visible_not_top1 = 7` points to shortlist and rerank conversion problems
- `top1_miss = 44` points to broader parent-child evidence promotion and candidate-quality problems

The most promising near-term borrow from this repo is:
- better child evidence structure, especially contextual chunk headers, proposition-like child units, and relevant segment extraction

Takeaway:
- this repo is the best direct source of retrieval ideas among the three

### Concrete Borrow / Do Not Borrow Summary

Borrow now:
- contextual chunk headers for biomedical child evidence
- relevant segment extraction for paper sections and evidence spans
- broader bounded reranking on `GENERAL` and concept-recovered cases
- adaptive retrieval only when the first pass is weak
- stronger end-to-end evaluation and miss-bucket tracking
- table-aware handling for biomedical tables and structured result sections

Do not borrow now:
- generic multi-agent orchestration as a retrieval fix
- memory graphs as a substitute for evidence retrieval
- wholesale GraphRAG or LightRAG replacement
- unconstrained LLM query rewriting on every request
- another tracing stack

### Updated Priority Order Based On External Review

If the next agent wants the highest-probability gains, the implementation order should now be:

1. **Improve child evidence structure**
   - contextual chunk headers
   - segment extraction
   - proposition-like child evidence units where section density is high

2. **Broaden bounded reranking**
   - extend MedCPT-style reranking to stronger `GENERAL` shortlists
   - widen candidate review without exploding latency

3. **Add adaptive retrieval only for weak first-pass cases**
   - trigger extra retrieval rounds only when the shortlist is weak or concept recovery is newly introduced
   - do not make multi-query retrieval the default path

4. **Exploit metadata and structure more aggressively**
   - publication type
   - section type
   - table/figure/result context
   - relation-rich or entity-rich child segments

5. **Then add precomputed graph support**
   - candidate expansion
   - shortlist priors
   - rerank support
   - not live graph traversal

This updated order is more realistic than jumping directly to graph or agentic orchestration. It stays aligned with the current benchmark evidence.

---

## What the Next Agent Should Assume

Assume all of the following are already true:
- the expert-suite warehouse coverage problem has largely been cleared for fair benchmarking
- the old no-target-signal bucket has been eliminated by upstream canonicalization
- the dominant remaining frontier is now shortlist formation and top-rank conversion
- the next useful work is not more phrase growth for its own sake
- graph is relevant, but as a precomputed support substrate rather than a runtime traversal engine

Do **not** restart from the assumption that the current bottleneck is warehouse sparsity or that the current bottleneck is absent canonical concepts. Those were earlier truths and are now much less central.

---

## Recommended Next Implementation Order

### 1. Propagate Recovered Concepts Into Shortlist Formation

Primary files:
- `engine/app/rag/search_retrieval_concepts.py`
- `engine/app/rag/search_retrieval.py`

Goal:
- turn recovered ontology concepts into better paper candidate formation and rescue behavior
- specifically reduce `target_visible_not_top1`

What to look for:
- concept expansion terms currently generated but not strongly enough reflected in winning paper candidates
- opportunity to use concept packages to strengthen candidate set quality before rank fusion

### 2. Improve Parent-Child Evidence Promotion

Primary files:
- `engine/app/rag/ranking.py`
- `engine/app/rag/ranking_support.py`
- possibly `engine/app/rag/search_execution.py`

Goal:
- reduce `top1_miss`
- reward parents with corroborated child evidence more effectively
- avoid letting broad citation-rich reviews dominate direct-support papers

### 3. Build a Precomputed Graph Read-Model

Primary input assets:
- PubTator entities
- PubTator relations
- MeSH/UMLS/vocab aliases
- citation edges
- semantic-neighbor links
- paper/chunk/sentence hierarchy

Use it for:
- candidate expansion
- shortlist priors
- rerank support
- relation-aware narrative retrieval

Do **not** default to live graph traversal.

### 4. Add a Bounded AI Proposal Layer

Goal:
- use generative AI to propose grounded concept packages or relation expansions
- keep ontology validation mandatory before proposals affect retrieval

This should support development and selective runtime fallback, not replace deterministic grounding.

### 5. Expand the Benchmark Portfolio

Keep:
- the current 61-case structure-complete expert gate for continuity

Add:
- more structure-complete expert cases
- more relation-heavy narrative cases
- enough structure-complete hard cases that acceptance is not overly dependent on a single 61-case surface

---

## Reproduction and Validation Commands

Targeted backend tests used in the recent passes:

```bash
cd engine && uv run pytest \
  test/test_rag_query_enrichment.py \
  test/test_rag_repository.py \
  test/test_rag_search_retrieval.py \
  test/test_rag_service.py \
  test/test_rag_ranking.py -q
```

Compilation check:

```bash
cd engine && uv run python -m compileall \
  app/rag/_query_enrichment_phrases.py \
  app/rag/repository_seed_search.py
```

Diff hygiene:

```bash
git diff --check
```

Benchmark review with suite gating:

```bash
cd engine && uv run python scripts/rag_benchmark.py \
  --dataset biomedical_expert_canonicalization_v1 \
  --run expert-structure61-composite-ontology-phrases-underresolved-2026-04-11 \
  --review-existing-run \
  --use-suite-gates
```

Langfuse local URLs seen in recent work:
- accepted ranking run:
  `http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmntcdr260003kt075lgkewgi/runs/75cb101e-719f-4758-98e5-8e7d0d8111cf`
- live canonicalization run:
  `http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmntcdr260003kt075lgkewgi/runs/7aefc302-55d2-495d-80d8-d4900255d998`

---

## Recommended External Reading For The Next Agent

These are the papers or projects that informed the current architecture decisions:
- MedCPT: domain-specialized biomedical retrieval and reranking  
  <https://academic.oup.com/bioinformatics/article/39/11/btad651/7335842>
- RAGChecker: failure-taxonomy-driven diagnosis rather than relying on one scalar metric  
  <https://arxiv.org/pdf/2408.08067>
- LightRAG: useful as a conceptual reference for graph-supported dual-level retrieval, not as a wholesale replacement target here  
  <https://aclanthology.org/2025.findings-emnlp.568.pdf>
- Microsoft GraphRAG: useful as an indexing pattern reference, but too heavy and redundant as a full replacement given the existing structured biomedical substrate  
  <https://microsoft.github.io/graphrag/index/overview/>
- recent caution on LLM-based query expansion: unconstrained expansion can fail on ambiguous or unfamiliar queries  
  <https://arxiv.org/abs/2505.12694>

The practical reading takeaway is:
- stay ontology-first
- use graph as precomputed support
- use bounded AI second
- keep benchmark acceptance tied to concrete miss-bucket movement

---

## Bottom Line

The SoleMD.Graph RAG system is not early scaffolding anymore. It is a live, instrumented, benchmarked retrieval system with a real biomedical ontology substrate and a real parent-child evidence model.

The broad runtime floor is healthy. The expert retrieval surface is still poor.

Recent work changed the diagnosis materially:
- the expert-suite warehouse is mostly recovered
- the old no-target-signal bucket is gone
- the system now surfaces ontology-backed concepts for the formerly hardest shorthand queries
- the dominant remaining problem is using those recovered concepts better in shortlist formation and parent-child evidence promotion

The next agent should therefore treat the problem as:
- not primarily a warehouse problem
- not primarily a missing-ontology problem
- not primarily a need for freeform LLM rewriting
- but a retrieval-conversion problem on top of a now-visible concept bridge

That is the right place to push next.
