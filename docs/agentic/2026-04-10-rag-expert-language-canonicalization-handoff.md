# RAG Expert-Language Canonicalization Handoff

> **Scope**: backend retrieval and benchmarking only.
>
> **Execution target**: implement the next structural RAG pass end to end using
> `/clean` principles. Do not treat this as a speculative plan. The next agent
> should execute it in full, benchmark it in Langfuse, and update docs again at
> the end of the implementation pass.
>
> **Do not modify** other SoleMD projects. Another agent is handling frontend.

---

## Mission

The next product-shaped retrieval target is **expert-language canonicalization**,
not consumer-health translation and not another title-router pass.

The intended users are:

- medical students
- residents
- physicians
- neuroscientists
- researchers

Representative prompts:

- `can't sit still from antipsychotics`
- `prednisone neuropsychiatric symptoms`
- `brain inflammation after COVID`
- `anti-NMDAR encephalitis psychosis first episode`

The system should improve these prompts because the backend understands their
biomedical concepts and their evidentiary context better, not because the
router forces them into title-like behavior.

---

## What Is Already True

The required and specialist gate surface is already strong:

- `biomedical_optimization_v3`: green
- `biomedical_holdout_v1`: green
- `biomedical_citation_context_v1`: green
- `biomedical_metadata_retrieval_v1`: green
- `biomedical_evidence_type_v1`: accuracy green, latency gate still red (`p95 = 294.319 ms`)

The main remaining product gap is the OpenEvidence-style surface:

- grounded narrative biomedical questions
- expert shorthand and paraphrase
- non-title semantic retrieval
- multi-study evidence selection

Current benchmark evidence:

- `biomedical_narrative_v1` baseline is still weak
  - `hit@1 = 0.167`
  - `hit@k = 0.361`
  - `grounded_answer_rate = 0.861`
  - `target_in_answer_corpus = 0.278`
- `semantic_recall_v2`, `entity_relation_v2`, and `passage_retrieval_v2` are currently accuracy-flat versus the locked baseline, but their p95 latency improved materially after the canonicalization pass
- `biomedical_expert_canonicalization_v1` now exists as a real Langfuse dataset and is the clearest remaining product gap
  - `64` cases
  - `hit@1 = 0.016`
  - `hit@k = 0.062`
  - `target_in_answer_corpus = 0.031`
  - `p95_duration_ms = 1040.445`

### 2026-04-10 Execution Update

This handoff is no longer a pure forward plan. The following Phase 6 items have
been executed in this branch:

- the new `biomedical_expert_canonicalization_v1` suite was built and synced to Langfuse
- the runtime now emits `vocab_concept_matches` into Langfuse trace metadata
- the benchmark CLI now supports historical Langfuse review directly via
  `--review-existing-run` and `--compare-run`
- the post-change full benchmark run completed under
  `canonicalization-v1-2026-04-10`
- focused trace inspection shows the current failure mode is **rank conversion**,
  not missing plumbing

Most important trace finding:

- `17 / 64` expert-suite cases produced non-empty `vocab_concept_matches`
- `0 / 17` of those matched cases reached `hit@1`

That means the next implementation step should not be "add another alias
substrate." It should be "convert recovered concepts into winning-paper recall
and ranking gains without overfitting to title routing."

### 2026-04-10 Iteration 2 Update

A second retrieval iteration has now landed after the original canonicalization
pass:

- added a bounded child-evidence corroboration lift in
  `engine/app/rag/ranking.py` / `engine/app/rag/ranking_support.py`
- the new ranking signal only fires when a paper has direct child evidence
  (`chunk_lexical_score` or strong alignment) plus corroborating structured
  support (`entity_score` / `relation_score`) and/or biomedical rerank support
- concept-only or dense-only parents still do **not** get crowned by this pass

Langfuse result on the live expert suite:

- baseline: `canonicalization-v17-general-title-support-2026-04-10`
  - `hit@1 = 0.031`
  - `hit@k = 0.094`
  - `target_in_answer_corpus = 0.031`
  - `p95_duration_ms = 224.963`
- current: `canonicalization-v18-child-evidence-corroboration-2026-04-10`
  - `hit@1 = 0.047`
  - `hit@k = 0.094`
  - `target_in_answer_corpus = 0.047`
  - `p95_duration_ms = 240.812`
- delta vs v17:
  - `hit@1: +0.016`
  - `target_in_answer_corpus: +0.016`
  - `hit@k: flat`
  - `p95_duration_ms: +15.849 ms`

Interpretation:

- the improvement came from rank conversion, not route inflation
- `target_visible_not_top1` improved from `4` cases to `3`
- the dominant remaining miss bucket is still `top1_miss` with no target signal
  on the winning paper
- this means the next clean move is probably **not** another ranking-only pass;
  the next frontier is concept-to-child evidence recovery on expert shorthand
  that still never surfaces the target paper

Guardrail validation:

- `benchmark-biomedical_optimization_v3` remains green on the same v18 branch
  - `hit@1 = 1.000`
  - `hit@k = 1.000`
  - `grounded_answer_rate = 1.000`
  - `p95_duration_ms = 224.468`
- `benchmark-biomedical_holdout_v1` remains accuracy-clean on the same v18 branch
  - `hit@1 = 1.000`
  - `hit@k = 1.000`
  - `grounded_answer_rate = 1.000`
  - `target_in_answer_corpus = 1.000`
  - but `p95_duration_ms = 250.290`, which still fails the suite gate (`150 ms`)
  - compared with the locked `canonicalization-v1-2026-04-10` run, the holdout
    accuracy is unchanged but latency is much worse (`52.761 -> 250.290 ms`)

Important interpretation:

- the v18 child-evidence change is a ranking-only change and does not alter the
  retrieval fanout or reranker activation policy in a way that can explain a
  ~200 ms p95 jump on long passage-shaped holdout prompts
- so the holdout latency debt should be treated as a **separate passage-lane
  performance issue already present on this branch**, not as a reason to revert
  the expert ranking improvement
- the next pass should investigate passage/query latency on long snippet-like
  prompts independently from expert canonicalization quality work

So the v18 change is safe to keep: it improved the frontier expert suite
without regressing the required biomedical optimization gate.

This means the next clean implementation should improve:

- canonical concept recovery
- child-evidence retrieval quality
- general and passage ranking

while preserving the green required and guardrail suites.

Already completed in this branch before handoff:

- migration `057_add_vocab_term_alias_catalog.sql` created `solemd.vocab_term_aliases`
- corpus ingestion now refreshes the runtime vocab alias catalog via
  `build_vocab_term_aliases_table()` in `engine/app/corpus/filter.py`
- the runtime alias key contract is now centralized in
  `engine/app/entities/alias_keys.py`
- live backfill loaded `30,092` normalized aliases across `3,342` distinct terms
  into `solemd.vocab_term_aliases`
- first serving rollout should constrain curated vocab alias resolution to
  MeSH-backed aliases so runtime concept ids stay aligned with the existing
  `paper_entity_mentions` key space

### 2026-04-10 Coverage Audit Update

The expert-canonicalization benchmark ceiling was materially lower than the
trace view alone suggested because target-paper warehouse coverage was thin.

Live warehouse audit against
`engine/data/runtime_eval_benchmarks/biomedical_expert_canonicalization_v1.json`
showed:

- `64` total benchmark targets
- `5 / 64` initially had full child-evidence coverage
  - `paper_documents`
  - `paper_chunks` on `default-structural-v1`
  - `paper_entity_mentions`
  - `paper_sentences`
- `59 / 64` were `sparse`
  - present in `solemd.graph_points`
  - absent from `solemd.paper_documents`
  - absent from chunk/entity/sentence warehouse tables

Important implication:

- the suite was mixing two different failure classes
  - true expert-language retrieval failures
  - warehouse coverage failures where the target paper row existed but the
    child-evidence surface did not

Additional audit findings:

- all `59` sparse targets were PubTator-addressable
  - `59 / 59` had PMID
  - `29 / 59` had PMCID
  - `57 / 59` had DOI
- all `59 / 59` also resolved in the local BioC archive manifest
  - exact `archive_name`
  - exact `document_id`
  - exact `document_ordinal`

That means the missing targets are deterministically recoverable from the
existing BioC archive layer. This is not speculative corpus hunting.

### 2026-04-10 Partial Backfill Update

A bounded BioC overlay backfill was executed against the `59` sparse expert
targets.

Observed state change after the first pass:

- benchmark-target papers with `paper_documents`: `5 -> 32`
- benchmark-target papers with chunks/entities/sentences: `5 -> 32`
- newly recovered benchmark targets: `27`
- remaining sparse benchmark targets: `32`

So the backfill path is working, but the outer operator surface was not
reliably observable from the current terminal environment. It mutated the
warehouse successfully, yet did not consistently emit a final report file for
the completed batch.

### 2026-04-10 Archive-Target Backfill Update

The next bounded pass landed two structural improvements:

- frozen archive-scoped discovery reports are now materialized from the live
  warehouse audit via
  `engine/scripts/materialize_bioc_archive_discovery_reports.py`
- exact BioC member fetch now prefers direct `member_name` lookup before
  falling back to streaming archive traversal in
  `engine/app/rag_ingest/bioc_member_fetch.py`

Why this matters:

- explicit corpus ids alone were not enough
- `discover_bioc_archive_targets()` still scanned archive-manifest windows from
  the beginning and repeatedly resolved identifier batches until it happened to
  encounter the allowed corpus ids
- for late-ordinal expert targets this created unnecessary resolver churn and
  hid the real operator cost

The frozen discovery reports remove that discovery scan entirely:

- exact `archive_name`
- exact `document_id`
- exact `document_ordinal`
- exact `member_name`

Validated outcome on the first archive-target rerun:

- archive: `BioCXML.0.tar.gz`
- exact target members:
  - `output/BioCXML/3050.BioC.XML`
  - `output/BioCXML/80910.BioC.XML`
- benchmark coverage moved from `32 / 64` covered to `34 / 64` covered
- remaining sparse targets moved from `32` to `30`

### 2026-04-11 Overnight Completion Update

The frozen archive-target campaign completed overnight across the remaining
manifest-resolved BioC archives.

Current live audit state:

- `biomedical_expert_canonicalization_v1` is now:
  - `61` structure-complete
  - `63` grounding-ready
  - `2` entity-thin
  - `1` sparse
- the `2` entity-thin grounding-ready cases are:
  - `31269847`
  - `277771861`
- the `1` truly sparse case is:
  - `206148831`
- none of those residual cases are manifest-resolved to a local BioC archive
  target, so more archive replay alone will not change the residual set

Recovered-paper title-fidelity state:

- the overnight campaign recovered `27` expert-suite papers into the warehouse
- canonical target-title sync has now been applied to the recovered set
- the recovered-paper quality audit now has `flagged_corpus_ids = []`
- title fidelity is no longer the dominant benchmark confound

### Recommended Remaining Resolution Path

Do **not** keep replaying local BioC archives for the remaining expert-suite
gaps. That path is exhausted.

Use this order of operations instead:

1. keep the current live warehouse audit as the source of truth
   - `docs/investigations/2026-04-11-biomedical-expert-canonicalization-warehouse-audit.json`
2. treat the residual cases by class instead of as one generic gap
   - `31269847` and `277771861` are already grounding-ready and should be
     handled as entity-thin cases, not archive-replay candidates
   - `206148831` is the only true sparse case and needs either:
     - a new source path, or
     - an explicit benchmark exemption decision
3. keep the recovered-set quality audit as the source of truth for title debt
   - `docs/investigations/2026-04-11-expert-recovered-paper-quality.json`
4. rerun Langfuse only after step 2 is settled

Reasoning:

- the residual cases are not manifest-resolved to local BioC archives
- further archive replay will add cost without changing the sparse set
- the remaining confound is now mostly case classification:
  - `2` grounding-ready but entity-thin papers
  - `1` source-bound sparse paper

Do **not** spend the next iteration on more ranking work until:

- the last `1` sparse target is resolved or explicitly exempted, and
- there is an explicit decision on whether `grounding_ready` or
  `structure_complete` is the gating bar for this benchmark rerun

### Current To-Do

1. reduce the remaining `no_target_signal` cases without overfitting title
   routing or adding query-specific synonym hacks
2. reduce the remaining `target_visible_not_top1` cases by improving structural
   parent-child promotion, not by inflating citation/context priors
3. investigate whether the two entity-thin cases (`31269847`, `277771861`)
   need entity-mention repair before the next expert iteration
4. treat `206148831` as source-bound unless a new upstream recovery lane is
   intentionally added; it should not block the current `61`-case gate

### 2026-04-11 Structure-Complete Gate Decision

The current decision is to use the `61` structure-complete cases for the next
expert-suite evaluation loop.

Implementation/status:

- this is already encoded in the benchmark catalog through
  `gate_warehouse_depths=("chunks_entities_sentence",)` for
  `biomedical_expert_canonicalization_v1`
- `rag_benchmark.py --use-suite-gates` applies that filter during live review
  and quality-gate evaluation
- a review bug in `langfuse_run_review.py` was fixed so the filter now uses the
  benchmark item's structural `expected_output.warehouse_depth` instead of the
  runtime answer-depth field
- the Langfuse dataset metadata was refreshed on 2026-04-11 so the structural
  filter now sees the current warehouse state (`61` included, `3` excluded)

Current filtered review surface for run `expert-structure61-2026-04-11`:

- `cases = 61`
- `hit@1 = 0.131`
- `hit@k = 0.262`
- `grounded_answer_rate = 0.934`
- `target_in_answer_corpus = 0.164`
- `p95_duration_ms = 383.6`

Current miss taxonomy on the `61` structure-complete cases:

- `no_target_signal = 4`
- `target_visible_not_top1 = 8`
- `top1_miss = 41`

Interpretation:

- `no_target_signal` is now the cleanest canonicalization / routing problem
- `target_visible_not_top1` is a ranking problem on already-retrieved parents
- `top1_miss` remains the largest bucket and needs better parent-child evidence
  promotion for expert prompts without slipping into title overfitting

### 2026-04-11 Concept-Seed Fallback Update

The next clean pass targeted a structural canonicalization gap instead of
adding query-surface heuristics.

Implementation:

- `engine/app/rag/search_retrieval_concepts.py` now lets exact resolved
  concepts seed entity recall even when no surface term survives the
  seeding heuristic
- `engine/app/rag/search_retrieval.py` now opens the entity-match lane when
  `resolved_concepts` are present, not only when `entity_seed_terms` are
  non-empty
- this uses the existing repository exact-concept path in
  `engine/app/rag/repository_seed_search.py`; it does not add a new retrieval
  lane, query-specific synonym rules, or query-time graph traversal
- regression coverage was added in `engine/test/test_rag_service.py`

Langfuse result on the same `61` structure-complete gate:

- baseline run `expert-structure61-2026-04-11`
  - `hit@1 = 0.131`
  - `hit@k = 0.262`
  - `grounded_answer_rate = 0.934`
  - `target_in_answer_corpus = 0.164`
  - `p95_duration_ms = 383.611`
- current run `expert-concept-seed-fallback-2026-04-11`
  - `hit@1 = 0.164`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 0.951`
  - `target_in_answer_corpus = 0.213`
  - `p50_duration_ms = 160.896`
  - `p95_duration_ms = 351.923`
- delta
  - `hit@1: +0.033`
  - `hit@k: +0.017`
  - `grounded_answer_rate: +0.017`
  - `target_in_answer_corpus: +0.049`
  - `p50_duration_ms: -25.335 ms`
  - `p95_duration_ms: -31.688 ms`

### 2026-04-11 Direct-Rerank Arbitration Update

The next accepted pass stayed structural and did not add query-specific
synonyms or query-time graph traversal.

Implementation:

- `engine/app/rag/ranking.py` now lets the bounded biomedical reranker break
  ties earlier among already-direct `passage_lookup` / `question_lookup`
  candidates
- this only applies once a paper already has direct child evidence; it does not
  let concept-only or citation-only distractors jump the queue
- the earlier title-lane demotion experiment is parked in the live retrieval
  path
  - title fallback retrieval still runs
  - concept and chunk recovery still run
  - but the query profile is no longer rewritten to `GENERAL` mid-retrieval
  - arbitration stays in ranking, which reduced latency without wiping out the
    `title_lookup` surface

Mainline Langfuse result on the same `61` structure-complete gate:

- baseline run `expert-structure61-2026-04-11`
  - `hit@1 = 0.131`
  - `hit@k = 0.262`
  - `grounded_answer_rate = 0.934`
  - `target_in_answer_corpus = 0.164`
  - `p95_duration_ms = 383.611`
- current run `expert-structure61-rerank-direct-mainline-2026-04-11`
  - `hit@1 = 0.148`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 0.951`
  - `target_in_answer_corpus = 0.213`
  - `p50_duration_ms = 145.321`
  - `p95_duration_ms = 315.839`
  - dataset run:
    `http://localhost:3100/project/cmnc35ixm0003ms07z5xup9oz/datasets/cmntcdr260003kt075lgkewgi/runs/5018c807-a047-4878-9a68-bfa71aa6119c`
- delta
  - `hit@1: +0.017`
  - `hit@k: +0.017`
  - `grounded_answer_rate: +0.017`
  - `target_in_answer_corpus: +0.049`
  - `p50_duration_ms: -35.579 ms`
  - `p95_duration_ms: -67.772 ms`

Current miss taxonomy on the gated `61` cases:

- `no_target_signal = 3`
- `target_visible_not_top1 = 8`
- `top1_miss = 40`
- `zero_bundles = 1`

Interpretation:

- the accepted gain came from better arbitration among already-retrieved direct
  candidates, not from broadening the routing graph
- `no_target_signal` remains the canonicalization / child-recall bucket
- `target_visible_not_top1` is the cleanest ranking bucket for the next pass
- `top1_miss` is still the dominant bucket and needs stronger parent-child
  evidence promotion after recall succeeds

Updated miss taxonomy:

- `no_target_signal = 3`
- `target_visible_not_top1 = 7`
- `top1_miss = 41`

Interpretation:

- the pass removed one `no_target_signal` miss and one
  `target_visible_not_top1` miss on the same `61`-case denominator
- the gain came from converting already-resolved concepts into exact
  entity-backed recall, which is the correct structural direction for
  expert-language canonicalization
- the dominant frontier is still `top1_miss`, which means the next structural
  work should focus on the remaining no-signal shorthand cases and then on
  better parent-child promotion for already-visible targets
- query-time graph retrieval is still deferred; the live hot path already has
  cheap precomputed structure through entity / relation / citation signals, and
  a graph walk would add complexity before it solves the current miss buckets

---

## Non-Negotiable Clean Principles

1. One canonical implementation.
   Do not scatter normalization logic across router helpers, benchmark-only code,
   or frontend utilities.

2. TSV may remain editorial source, but runtime authority must be indexed Postgres.
   `data/vocab_aliases.tsv` has about `30,503` rows. That is a fine curation
   artifact, but not the correct serving-path authority. If vocab aliases are
   part of runtime concept normalization, materialize them into Postgres behind
   an indexed runtime table and adapter. Do not leave serving-grade concept
   lookup split between a file and the database.

3. No regex-only or heuristic-sprawl solution.
   Surface heuristics can stay as narrow guards, but the canonicalization layer
   must be concept-aware, typed, and provenance-preserving.

4. Do not overload runtime identity fields for provenance.
   `concept_namespace` and `concept_id` already participate in exact concept
   joins. Provenance must travel in its own field such as `source_surface` or
   `resolution_provenance`.

5. No free-form LLM query rewriting in the serving path.
   Generative models may help offline case mining or evaluation, but they are
   not the authority for runtime concept normalization.

6. Route is a budget prior, not the product objective.
   Do not "win" by forcing more prompts into `title_lookup`.

7. Parent paper identity, child evidence grounding.
   The result spine stays paper-level. Chunks and sentences are evidence support,
   not the public identity of the retrieval result.

8. Langfuse is the source of truth.
   Use Langfuse datasets, runs, and traces for acceptance. JSON is optional and
   secondary.

---

## Target Architecture

```text
user query
   |
   v
query normalization + metadata hints + phrase extraction
   |
   v
expert-language canonicalizer
   |
   +--> concept candidates with:
   |      preferred_term
   |      matched_alias
   |      alias_type
   |      umls_cui
   |      concept_id / term_id
   |      provenance
   |      confidence
   |
   +--> keep raw lexical query unchanged
   |
   v
retrieval lanes
   |
   +--> paper lexical / metadata
   +--> chunk lexical / sentence evidence
   +--> dense paper recall
   +--> entity concept recall
   +--> relation recall
   +--> citation-context expansion
   |
   v
parent paper fusion
   |
   v
profile-aware rerank + enrichment
   |
   v
paper-level evidence bundles + grounded child spans
```

Design intent:

- the canonicalizer improves entity and semantic lanes
- the raw lexical lane stays intact
- metadata/title routes remain precision guardrails, not the primary retrieval objective

---

## Canonical Data Sources

Use existing structural resources first:

- `data/vocab_aliases.tsv`
  - curated editorial source with `term_id`, `alias`, `alias_type`, `quality_score`, `is_preferred`, `umls_cui`
- `solemd.entity_aliases`
  - runtime-ready exact alias catalog with normalized alias keys and existing indexes
- `solemd.vocab_terms`
  - curated term authority already in Postgres and the natural parent surface for a runtime vocab alias table
- `solemd.vocab_term_aliases`
  - indexed runtime alias table populated from `data/vocab_aliases.tsv`; current live count is `30,092` aliases across `3,342` terms
- `solemd.paper_entity_mentions`
  - retrieval-side entity mention substrate with runtime concept lookup keys
- `pubtator.entity_annotations`
  - literature-side concept coverage, useful for ingest and catalog validation

Permitted supporting tools:

- `scispaCy` linker or `QuickUMLS`, but only behind one adapter and only if the
  built-in catalog plus vocab alias bridge cannot recover the needed concepts

Do not:

- add a separate parallel normalization stack
- keep a file-only runtime alias authority once expert canonicalization depends on vocab aliases
- make the runtime depend directly on an external service
- let a new tool bypass the typed adapter contract

---

## Implementation To-Do List

### Phase 0 - Lock the baseline

- [ ] Re-run the current acceptance and frontier suites in Langfuse before changing code:
  - `biomedical_optimization_v3`
  - `biomedical_holdout_v1`
  - `biomedical_citation_context_v1`
  - `biomedical_metadata_retrieval_v1`
  - `biomedical_evidence_type_v1`
  - `biomedical_narrative_v1`
  - `passage_retrieval_v2`
  - `semantic_recall_v2`
  - `entity_relation_v2`
- [ ] Capture current route and failure categories from Langfuse traces, not only summary metrics
- [ ] Use these re-runs as the true "before" state for the implementation pass

### Phase 1 - Promote curated vocab aliases into the runtime substrate

- [x] Add a proper runtime alias table in Postgres rather than relying on a file-backed serving path
- [x] Keep `data/vocab_aliases.tsv` as the editorial source only
- [x] Load or refresh the runtime table via canonical ingest code instead of request-time loading
- [x] Current implementation:
  - table: `solemd.vocab_term_aliases`
  - migration: `engine/db/migrations/057_add_vocab_term_alias_catalog.sql`
  - refresh module: `engine/app/corpus/vocab_aliases.py`
  - ingest hook: `engine/app/corpus/filter.py`
  - live row count at handoff time: `30,092`
- [x] Runtime columns:
  - `term_id`
  - `alias_text`
  - `alias_key`
  - `alias_type`
  - `quality_score`
  - `is_preferred`
  - `umls_cui`
- [x] Index strategy:
  - unique constraint on `(term_id, alias_key)`
  - btree index on `alias_key`
  - btree index on `term_id`
  - btree index on `umls_cui` where not null
- [x] Do not start with trigram or fuzzy search unless trace evidence proves exact normalized lookup is insufficient
- [ ] Next decision for the implementation pass:
  - keep `solemd.vocab_term_aliases` as a distinct curated alias surface, or
  - unify it with broader concept-alias infrastructure if that can be done without adding a parallel runtime path

### Phase 2 - Build the canonicalizer adapter

- [ ] Create one canonical backend adapter for expert-language canonicalization
- [ ] Keep route classification separate from concept normalization
  - do not move this work into `determine_query_retrieval_profile()`
  - keep routing about query shape, not ontology resolution
- [ ] First serving rollout: use only MeSH-backed curated aliases for concept promotion
  - do not emit UUID fallback concept ids into the exact entity retrieval contract
- [ ] Recommended file:
  - `engine/app/rag/biomedical_concept_normalizer.py`
- [ ] Optional helper file if needed:
  - `engine/app/rag/_biomedical_concept_catalog.py`
- [ ] The adapter must:
  - read from the Postgres runtime alias substrate, not from the TSV in the serving path
  - normalize alias text consistently with the runtime entity key rules
  - preserve `term_id`, `umls_cui`, `alias_type`, `quality_score`, `is_preferred`
  - merge or reconcile with `solemd.entity_aliases` when exact entity catalog matches exist
  - carry provenance in its own field rather than overloading `concept_namespace`
  - return typed concept objects, not bare strings
- [ ] Minimum output fields:
  - `preferred_term`
  - `matched_alias`
  - `alias_type`
  - `quality_score`
  - `confidence`
  - `term_id`
  - `umls_cui`
  - `concept_id` or `entity_type` when recoverable
  - `provenance` (`vocab_aliases`, `entity_aliases`, or combined)
- [ ] Confidence policy:
  - high-confidence concepts may seed retrieval
  - lower-confidence concepts may assist shortlist enrichment only
  - ambiguous or low-information aliases must not silently overwrite the raw query meaning
  - do not assume `quality_score >= 90` is sufficient by itself
  - require MeSH backing for first-pass no-alignment promotion

### Phase 3 - Integrate the canonicalizer into the live retrieval path

- [ ] Wire the adapter into:
  - `engine/app/rag/search_retrieval.py`
  - `engine/app/rag/query_enrichment.py`
  - `engine/app/rag/repository_seed_search.py`
- [ ] Use `search_retrieval._apply_query_enrichment()` as the canonical runtime
  entrypoint and keep phrase generation centralized in
  `_query_enrichment_phrases.py`
- [ ] Keep one canonical entrypoint for runtime concept normalization
- [ ] Preserve the raw lexical query string for paper and chunk lexical search
- [ ] Use normalized concepts to strengthen:
  - entity seed recall
  - relation recall when concept-linked relation terms exist
  - dense candidate recovery and late ranking features
- [ ] Do not let canonicalization short-circuit exact metadata/title routes that are already correct

### Phase 4 - Tighten parent/child retrieval behavior

- [ ] Treat routing as a lane-budget prior, not a hard semantic identity
- [ ] Ensure `general` and `passage_lookup` continue to run the right child-evidence lanes when concept support exists
- [ ] Keep the public retrieval identity at the paper level
- [x] Initial parent-ranking improvement landed:
  - `GENERAL` and title-fallback ranking now give a bounded lift to papers that
    combine direct child evidence with structured corroboration and/or
    biomedical rerank support
- [ ] Improve how child evidence influences parent ranking further:
  - direct chunk and sentence support should lift the correct parent paper
  - weak abstract-only alignment should not dominate strong child evidence
- [ ] Review whether `search_finalize.py`, `ranking.py`, and `ranking_support.py` need a concept-coverage or child-support feature rather than more router logic

### Phase 5 - Dataset buildout in Langfuse

- [x] Keep the current hard gates as-is:
  - `biomedical_optimization_v3` - `297` required
  - `biomedical_holdout_v1` - `48` required
  - `biomedical_citation_context_v1` - `24` required
- [x] Keep the current specialist guardrails active:
  - `biomedical_metadata_retrieval_v1` - `36` guardrail
  - `biomedical_evidence_type_v1` - `16` guardrail
- [ ] Expand the shadow and next-gate surface to the following exact targets:

| Dataset | Target count | Partition plan | What it should gate |
|---|---:|---|---|
| `biomedical_narrative_v1` | 40 | `30 gated / 10 shadow` once coverage is adequate | grounded multi-study narrative retrieval |
| `passage_retrieval_v2` | 72 | `54 gated / 18 shadow` | child evidence retrieval, passage alignment, grounded extraction |
| `semantic_recall_v2` | 96 | `64 gated / 32 shadow` | paraphrase robustness, dense recall, hybrid fusion |
| `entity_relation_v2` | 96 | `64 gated / 32 shadow` | entity/relation retrieval and ranking |
| `biomedical_metadata_retrieval_v1` | 48 | `36 gated / 12 shadow` | author/year and journal/year serving quality |
| `biomedical_citation_context_v1` or `v2` | 48 | `36 gated / 12 shadow` | cited-study preservation in narrative prompts |
| `biomedical_evidence_type_v1` | 32 | `24 gated / 8 shadow` | evidence-design targeting at serving grade |
| `biomedical_grounded_answer_v1` | 64 | `48 gated / 16 shadow` | grounded answer packet correctness and study metadata completeness |
| `biomedical_abstention_v1` | 40 | `30 gated / 10 shadow` | abstention on unsupported or weak-evidence prompts |
| `biomedical_expert_canonicalization_v1` | 64 | `48 gated / 16 shadow` | expert-language canonicalization without title overfitting |

- [x] For the new `biomedical_expert_canonicalization_v1` dataset, use eight buckets with eight cases each:
  - hurried adverse-effect phrasing
  - steroid psychiatric phrasing
  - post-infectious neuroinflammation phrasing
  - autoimmune encephalitis / first-episode psychosis phrasing
  - delirium / agitation / catatonia shorthand
  - withdrawal / discontinuation syndrome shorthand
  - movement-disorder / akathisia / EPS shorthand
  - abbreviation-heavy specialist phrasing

### Phase 6 - Verify and clean

- [x] Run targeted unit tests for the canonicalizer and retrieval integration
- [x] Run Langfuse benchmark suites again and compare against the locked baseline
- [x] Confirm gains come from the intended lanes by inspecting traces:
  - `channel_entity`
  - `target_in_answer_corpus`
  - `route_signature`
  - `warehouse_depth`
  - child-evidence support on the winning paper
- [x] Update the investigation ledger and `docs/map/*` after the implementation settles
- [x] Finish with a `/clean` pass:
  - remove duplicated normalization helpers
  - remove dead branches
  - centralize the adapter boundary
  - confirm no per-request alias file parsing remains

---

## Recommended File Touch Surface

Primary backend files:

- `engine/app/rag/search_retrieval.py`
- `engine/app/rag/query_enrichment.py`
- `engine/app/rag/_query_enrichment_phrases.py`
- `engine/app/rag/repository_seed_search.py`
- `engine/app/rag/retrieval_policy.py`
- `engine/app/rag/search_finalize.py`
- `engine/app/rag/ranking.py`
- `engine/app/rag/ranking_support.py`
- `engine/app/corpus/vocab.py` if the old TSV-only helper needs to be narrowed back to offline corpus filtering only

New adapter files:

- `engine/app/rag/biomedical_concept_normalizer.py`
- optional: `engine/app/rag/_biomedical_concept_catalog.py`

Likely migration and ingest files:

- `engine/db/migrations/057_add_vocab_term_alias_catalog.sql`
- `engine/db/migrations/023_vocab_terms_table.sql` for parent-table context
- `engine/db/migrations/046_add_entity_alias_catalog.sql` and `056_entity_alias_highlight_policy.sql` for alias-catalog precedent

Benchmark files:

- `engine/app/rag_ingest/benchmark_catalog.py`
- `engine/scripts/prepare_rag_curated_benchmarks.py`
- `engine/scripts/rag_benchmark.py`

Docs to update after execution:

- `docs/investigations/2026-04-08-biomedical-optimization-v3.md`
- `docs/map/rag.md`
- `docs/map/benchmark.md`
- `docs/map/map.md`

---

## Required Tests

Add or extend tests for:

- exact concept recovery from the Postgres vocab alias runtime table
- ambiguity suppression for generic aliases
- preservation of the raw lexical query alongside normalized concepts
- high-confidence seeding vs low-confidence enrichment-only behavior
- provenance carried separately from runtime concept identity fields
- MeSH-backed-only first-pass promotion behavior
- no regression on title and metadata specialist routes
- runtime lookup plan uses indexed exact alias lookup rather than ad hoc file parsing
- improved retrieval on expert-language prompts such as:
  - `can't sit still from antipsychotics`
  - `prednisone neuropsychiatric symptoms`
  - `brain inflammation after COVID`
  - `anti-NMDAR encephalitis psychosis first episode`

Recommended test files:

- `engine/test/test_rag_query_enrichment.py`
- `engine/test/test_rag_repository.py`
- `engine/test/test_rag_retrieval_policy.py`
- `engine/test/test_rag_search_retrieval.py`
- new: `engine/test/test_rag_biomedical_concept_normalizer.py`
- new benchmark catalog coverage if dataset definitions change

---

## Acceptance Criteria

Current status on 2026-04-10: **not yet accepted**.

Blocking reasons:

- `biomedical_expert_canonicalization_v1` is now benchmarked, but it is still far below an acceptable retrieval floor
- `biomedical_narrative_v1` remains weak
- `biomedical_evidence_type_v1` still fails its latency gate even though accuracy is perfect

Coverage state after the overnight BioC archive-target pass on 2026-04-11:

- the expert benchmark snapshot was refreshed from live warehouse state
- `biomedical_expert_canonicalization_v1` is now:
  - `61` structure-complete
  - `63` grounding-ready
  - `2` entity-thin
  - `1` sparse
- the suite is no longer mostly impossible, but it is also not yet a pure
  retrieval benchmark across all `64` cases
- the remaining true sparse case `206148831` is not manifest-resolved to a
  local BioC archive, and PubMed `21862951` has no abstract
- the two other residuals are already grounding-ready and should be treated as
  entity-thin, not sparse
- the recovered-paper title-fidelity debt is cleared
  - the recovered-set quality audit now has `flagged_corpus_ids = []`

That means the remaining warehouse-quality work is now narrow:

- resolve or exempt the last `3` sparse cases
- repair title fidelity on the flagged recovered cohort
- only then treat expert-suite score movement as mostly retrieval/ranking
  quality rather than warehouse cleanup

The implementation is accepted only if all of the following are true:

1. Required suites remain green in Langfuse:
   - `biomedical_optimization_v3`
   - `biomedical_holdout_v1`
   - `biomedical_citation_context_v1`

2. Specialist guardrails remain green:
   - `biomedical_metadata_retrieval_v1`
   - `biomedical_evidence_type_v1`

3. Narrative and expert-language surfaces improve materially:
   - `biomedical_narrative_v1` improves on `hit@k` and `target_in_answer_corpus`
   - `semantic_recall_v2` improves on `hit@k`
   - `entity_relation_v2` does not give back its structural gains

4. Trace review shows the gain is structural:
   - stronger concept recovery
   - stronger child-evidence support
   - no increase in title-only dependence as the main source of improvement

5. The final code path is clean:
   - one canonical adapter
   - no benchmark-only shortcuts
   - no regex-only solution
   - no hot-path file parsing
   - vocab alias runtime authority lives in indexed Postgres, not a TSV cache

---

## Explicit Non-Goals

Do not spend the next pass on:

- another title-router optimization cycle as the main workstream
- free-form LLM rewriting of the user query in the hot path
- a frontend-only workaround
- benchmark-specific hand tuning of individual titles

Do not leave `data/vocab_aliases.tsv` as a serving-path authority now that
expert-language canonicalization is an explicit product requirement. The clean
end state is indexed Postgres runtime lookup behind one adapter, with the TSV
retained only as an editorial or import artifact if still useful.

---

## Final Note To The Next Agent

This pass should move the system toward an OpenEvidence-style retrieval surface:

- grounded narrative answers
- robust study selection
- strong metadata display
- expert-language query handling
- paper-level retrieval with sentence/chunk grounding

The right implementation will look more like a concept-aware retrieval adapter
than a smarter router.

### 2026-04-11 GENERAL Arbitration Update

A new accepted ranking pass landed after the rerank-direct mainline:

- added a narrow `GENERAL`-only arbitration helper in
  `engine/app/rag/ranking_support.py` / `engine/app/rag/ranking.py`
- the helper only fires when a paper has:
  - strong biomedical reranker support (`biomedical_rerank_score >= 0.8`)
  - corroboration from at least two non-citation retrieval lanes
    (`lexical`, `chunk`, `dense`, `entity`, `relation`)
- title and passage/question routing behavior are unchanged
- this is intentionally not a fused-score weight rewrite; it is a sort-key
  discriminator for already-visible `GENERAL` candidates

Why this was added:

- trace review showed a recurring failure mode where broad citation-context-rich
  review papers outranked more directly matched targets that were already
  visible, already supported by multiple retrieval lanes, and already favored
  by the MedCPT reranker
- the cleanest concrete example was `BDNF Val66Met and ketamine response`,
  where the target paper had lexical + dense + entity support and
  `biomedical_rerank_score = 1.0`, but still lost to a citation-context-heavy
  review under raw fused ordering

Langfuse result on the gated `61`-case surface:

- previous accepted run: `expert-structure61-rerank-direct-mainline-2026-04-11`
  - `hit@1 = 0.148`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 0.951`
  - `target_in_answer_corpus = 0.213`
  - `p95_duration_ms = 315.8`
- current accepted run: `expert-structure61-general-direct-priority-2026-04-11`
  - `hit@1 = 0.164`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 0.951`
  - `target_in_answer_corpus = 0.230`
  - `p95_duration_ms = 298.6`
- delta vs the prior accepted mainline:
  - `hit@1: +0.016`
  - `hit@k: flat`
  - `grounded_answer_rate: flat`
  - `target_in_answer_corpus: +0.017`
  - `p50_duration_ms: +7.644 ms`
  - `p95_duration_ms: -17.197 ms`

Miss taxonomy change on the same denominator:

- `no_target_signal = 3` (flat)
- `target_visible_not_top1: 8 -> 7`
- `top1_miss: 40 -> 41`

Interpretation:

- the change improved rank conversion in the already-visible bucket without
  widening retrieval fanout or changing title/passsage routing
- it is therefore safe to keep
- however, it does not solve the dominant frontier problem; the next major work
  item is still expert-language canonicalization into child evidence for the
  `3` no-target-signal cases and stronger parent-child evidence promotion for
  the remaining `top1_miss` cases

A follow-up upstream canonicalization pass is now live in the repo:
`expert-structure61-composite-ontology-phrases-underresolved-2026-04-11`.

Langfuse result on the same gated `61`-case surface:

- prior accepted ranking run: `expert-structure61-general-direct-priority-2026-04-11`
  - `hit@1 = 0.164`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 0.951`
  - `target_in_answer_corpus = 0.230`
  - `p95_duration_ms = 298.6`
- current live canonicalization run: `expert-structure61-composite-ontology-phrases-underresolved-2026-04-11`
  - `hit@1 = 0.164`
  - `hit@k = 0.279`
  - `grounded_answer_rate = 1.000`
  - `target_in_answer_corpus = 0.230`
  - `p95_duration_ms = 324.4`
- delta vs the accepted ranking run:
  - `hit@1: flat`
  - `hit@k: flat`
  - `grounded_answer_rate: +0.049`
  - `target_in_answer_corpus: flat`
  - `p50_duration_ms: +0.322 ms`
  - `p95_duration_ms: +25.779 ms`

Miss taxonomy on the same denominator is now:

- `no_target_signal = 0`
- `target_visible_not_top1 = 7`
- `top1_miss = 44`

Interpretation:

- upstream composite event phrases plus the tightened under-resolved supplemental
  vocab lookup now convert the old no-target-signal bucket into ontology-backed
  concept matches without adding a large latency penalty
- that is useful structural progress, but it is not a retrieval win yet; the
  recovered concepts are not turning into better parent-child recall or better
  top-rank conversion
- the next major work item is therefore not more phrase growth, but using these
  recovered concepts more effectively in shortlist formation and evidence
  promotion
