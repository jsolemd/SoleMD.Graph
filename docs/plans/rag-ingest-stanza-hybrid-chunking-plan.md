# RAG Ingest Stanza Hybrid Chunking Plan

## Scope

This plan governs canonical RAG ingest quality in `engine/app/rag_ingest`.

The ownership boundary is:

- `rag_ingest`: parsing, sentence segmentation, canonical block/sentence derivation, chunk derivation, warehouse QA, backfill and refresh workflows.
- `rag`: live retrieval, grounding, repository reads, ranking, answer synthesis, and serving contracts.

Shared contracts remain offset- and lineage-based. Any change here must preserve:

- canonical `paper_blocks`
- canonical `paper_sentences`
- derived `paper_chunks`
- `paper_chunk_members` lineage
- sentence/block/citation/entity offset mapping

## Current Evidence

Observed in the live warehouse on 2026-03-31:

- `solemd.paper_chunk_versions` currently records `default-structural-v1|simple|v1||256|384`
- oversize table chunks exist:
  - corpus `276778215`, chunk `31`, `table_body_text`, `847` tokens
  - corpus `276778215`, chunk `28`, `table_body_text`, `625` tokens
- low-value narrative chunk rows exist:
  - corpus `261698615`, chunk `43`, text `Not applicable.`
  - corpus `225487656`, chunk `7`, text `Our`
  - corpus `260425880`, chunk `17`, text `The`
- repeated noisy section labels exist:
  - corpus `52845261`, section label `Journal of Medicinal Chemistry` repeated `6` times

Additional row inspection shows:

- the oversize table chunks each have exactly one `paper_chunk_members` sentence member, which means old chunk assembly treated an entire table-body block as one sentence-like unit
- the tiny fragments are rooted in canonical sentence rows such as:
  - `225487656`, block `15`, sentence `0`, source `s2orc_annotation`, text `Our`
  - `260425880`, block `30`, sentence `0`, source `deterministic_fallback`, text `The`

## Design References

Primary references:

- Stanza tokenization and offsets: `https://stanfordnlp.github.io/stanza/tokenize.html`
- Stanza biomedical model usage: `https://stanfordnlp.github.io/stanza/biomed_model_usage.html`
- Docling chunking concepts: `https://docling-project.github.io/docling/concepts/chunking/`

Relevant design takeaways:

- Stanza provides sentence and token spans with character offsets and supports bulk tokenization.
- Docling HybridChunker is a good architectural reference:
  - structure first
  - tokenizer-aware split only when needed
  - merge undersized adjacent peers only when safe
  - table-specific line-preserving chunking
  - optional repeated table headers / prefix handling

## Implementation Goals

### 1. Sentence Segmentation

Use a pluggable segmentation pipeline in `rag_ingest`:

- source annotations first
- Stanza biomedical on GPU for prose/caption fallback
- syntok fallback
- deterministic fallback last

Do not use prose sentence segmentation for `table_body_text`.

### 2. Tokenization-Aware Chunking

Replace the current `simple` whitespace chunk budget with a modular token-budget layer.

Target behavior:

- use Stanza tokenization by default for canonical token budgeting
- preserve offsets and sentence membership
- split prose at sentence boundaries first
- split only oversize units further when needed
- merge undersize adjacent narrative peers only when same-section and contract-safe
- treat tables as line-preserving structured content
- repeat compact table header context across split table chunks when safe
- omit repeated header on overflow when the row fits without it

### 3. QA Fidelity

QA should reflect real warehouse usefulness, not only structural existence.

Add or tighten checks for:

- oversize chunks
- oversize table chunks
- tiny narrative chunks
- low-value narrative chunks
- repeated non-structural section labels
- segmentation/chunking provenance where possible

### 4. Validation

Validation must include:

- targeted unit tests for chunking and tokenization behavior
- sentence benchmark on real warehouse blocks
- direct inspection of the previously bad live rows

## Planned Code Changes

### A. Tokenization Module

Create a tokenization adapter under `engine/app/rag_ingest` to provide:

- Stanza token counting and token-span slicing
- optional alternate tokenizer backends later
- a deterministic fallback only as last resort

The adapter should expose tokenizer identity so chunk version metadata is true.

### B. Chunk Policy / Chunker

Refactor chunking to use tokenizer-aware budgets:

- replace `_default_token_counter` as the canonical default
- keep chunk derivation from canonical blocks and sentences
- preserve `paper_chunk_members`
- add explicit table header/row handling
- suppress worthless single-fragment narrative chunks
- avoid re-collapsing already split bounded slices

### C. Chunk Version Metadata

Update default chunk version metadata so persisted `tokenizer_name` and `tokenizer_version` describe the real default budget backend instead of `simple`.

### D. QA

Extend warehouse QA to validate the new chunking policy and suspicious repeated section labels using shared ingest policy constants.

## Success Criteria

The pass is successful when:

- the canonical contract remains valid
- existing targeted tests pass
- new tests cover tokenizer-aware chunking and table splitting
- live-style bad cases are prevented by code and tests
- QA flags the previously observed bad patterns
- chunk version metadata is truthful

## Implementation Status

Implemented on 2026-03-31.

Delivered changes:

- pluggable sentence segmentation in `engine/app/rag_ingest/sentence_segmentation.py`
  - source annotations first
  - Stanza biomedical fallback on GPU
  - syntok fallback
  - deterministic fallback last
- shared token-budget backend in `engine/app/rag_ingest/tokenization.py`
  - Stanza token spans are now reused for chunk budgeting, not only sentence splitting
  - supported embedding models now resolve to `tiktoken` for chunk-budget fidelity
  - oversize prose refinement now uses `semchunk` before falling back to plain token windows
- shared section-context helpers in `engine/app/rag_ingest/section_context.py`
  - chunk contextualization and QA now use the same section-label normalization logic
  - repeated noisy non-structural labels are suppressed before they can contaminate chunk text
- tokenizer-aware structural chunking in `engine/app/rag_ingest/chunking.py`
  - narrative chunking stays sentence-based
  - narrative chunk text can inherit canonical section-heading context when it is informative
  - narrative budgeting now accounts for heading-context token cost before chunk emission
  - adjacent narrative peers now merge by contextual heading signature instead of raw section ordinal alone
  - table-body chunking ignores prose sentence rows and chunks by structural units
  - tiny low-value narrative fragments are suppressed
  - bounded adjacent narrative peers can merge when contract-safe
  - linked table captions can merge into the first table-body chunk under structural context policy
  - compact table headers can repeat across split table chunks and drop on overflow
  - chunk member lineage is deduplicated when repeated context is emitted
- chunk QA extensions in `engine/app/rag_ingest/warehouse_quality.py`
  - optional `chunk_version_key` filtering for preview-vs-default QA
  - oversize / tiny / low-value / repeated-label checks tightened
- safe preview backfill support
  - chunk seed and backfill scripts now allow `chunk_version_key` override
  - chunk-only backfill now replaces stale rows for the same `(chunk_version_key, corpus_id)` instead of only upserting

## Validation Outcomes

Code validation:

- focused engine suite passed:
  - `79 passed`
- targeted Ruff checks on touched ingest files passed
- Stanza benchmark on real warehouse blocks loaded on `cuda`

Persisted preview validation:

- seeded preview chunk version:
  - `preview-stanza-hybrid-sample-v1`
  - `parser_version = mixed:parser-v1,parser-v2,parser-v3`
  - `tokenizer_name = stanza_biomedical_tokens`
  - `tokenizer_version = 1.11.1+craft,genia`
- backfilled audited papers under the preview key:
  - corpus ids `225487656`, `260425880`, `261698615`, `276778215`, `52845261`
  - wrote `253` chunk rows and `1062` chunk-member rows

Observed preview improvements versus `default-structural-v1`:

- `225487656`
  - default: `tiny_narrative_chunks`
  - preview: no chunk-quality flags
- `260425880`
  - default: `tiny_narrative_chunks`
  - preview: no chunk-quality flags
- `276778215`
  - default: `oversize_chunks`, `oversize_table_chunks`, `tiny_narrative_chunks`
  - preview: those chunk-quality flags cleared
- preview chunk rows no longer contain the junk rows `Our`, `The`, or `Not applicable.`

Residual quality signal intentionally preserved:

- `261698615` still has three short narrative/admin sentences flagged in preview:
  - `The online version contains supplementary material available at 10.1186/s12966-023-01493-3.`
  - `Only studies in randomized controlled trial design were included as eligible.`
  - `The authors are consent for publication.`

These are materially better than the old one-token / two-token junk fragments, but QA correctly keeps them visible as short narrative content that may still warrant policy refinement.

Docling-style preview validation:

- seeded a second preview chunk version:
  - `preview-docling-hybrid-sample-v2`
  - `parser_version = mixed:parser-v1,parser-v2,parser-v3`
  - `tokenizer_name = tiktoken:cl100k_base`
  - `tokenizer_version = 0.12.0+text-embedding-3-large`
  - `caption_merge_policy = structural_context`
  - `lexical_normalization_flags = [chunker:hybrid_structural_v2, table_header_repeat, table_header_omit_on_overflow, peer_merge_by_context]`
- backfilled the same audited papers under the Docling-style preview key:
  - corpus ids `225487656`, `260425880`, `261698615`, `276778215`, `52845261`
  - wrote `229` chunk rows and `1058` chunk-member rows
- persisted table chunks now carry structural table context:
  - first split table chunk includes the linked table caption plus table header
  - later split table chunks repeat the compact header without duplicating caption membership
  - `paper_chunk_members` confirms first table chunks include both caption and table-body block members for `Tab1`-`Tab4` in `276778215`
- the table failures remain fixed under the Docling-style preview:
  - `276778215`: `oversize_chunks = 0`
  - `276778215`: `oversize_table_chunks = 0`
- junk one-word rows remain absent:
  - no persisted `Our`, `The`, or `Not applicable.` chunks in the preview key

Residual quality signal on the Docling-style preview:

- `225487656` now has one `tiny_narrative_chunks` flag under embedding-token counting
  - the affected row is a real clinical sentence, not a junk fragment:
    - `The patient had a history of Miller Fisher syndrome, hypertension, and dyslipidemia.`
  - this is a tokenizer-count fidelity change rather than a structural fragment regression
- `261698615` still has three short narrative/admin sentences flagged
- `52845261` still flags repeated noisy non-structural section labels

Docling-style narrative-context preview validation:

- seeded a third preview chunk version:
  - `preview-docling-hybrid-narrative-v3`
  - `parser_version = mixed:parser-v1,parser-v2,parser-v3`
  - `tokenizer_name = tiktoken:cl100k_base`
  - `tokenizer_version = 0.12.0+text-embedding-3-large`
  - `caption_merge_policy = structural_context`
  - `lexical_normalization_flags = [chunker:hybrid_structural_v3, table_header_repeat, table_header_omit_on_overflow, peer_merge_by_context, section_heading_context, section_context_excludes_repeated_nonstructural_labels, semchunk_overflow_refinement]`
- backfilled the same audited papers under the narrative-context preview key:
  - corpus ids `225487656`, `260425880`, `261698615`, `276778215`, `52845261`
  - wrote `230` chunk rows and `1058` chunk-member rows
- persisted narrative chunks now inherit canonical section context when it is useful:
  - `225487656`, chunk `0`: `PAST MEDICAL HISTORY` + clinical sentence
  - `225487656`, chunk `1`: `DIFFERENTIAL DIAGNOSIS` + diagnostic sentence
  - `52845261` chunk text starts with structural headings such as `■ INTRODUCTION`, not the repeated noisy label `Journal of Medicinal Chemistry`
- narrative quality improved further versus `preview-docling-hybrid-sample-v2`:
  - `225487656`: `tiny_narrative_chunks` cleared
  - `260425880`: still clear
  - `276778215`: oversize chunk/table fixes remain intact
  - junk rows `Our`, `The`, and `Not applicable.` remain absent
- residual narrative signal is now narrower and more interpretable:
  - `261698615` still has three short but context-bearing narrative/admin chunks:
    - `Abstract` + online supplementary-material sentence
    - `Studies design` + randomized-controlled-trial sentence
    - `Consent for publication` + publication-consent sentence

Live default structural cleanup follow-up:

- rewrote the live default chunk key across the full warehouse under:
  - `default-structural-v1-structural-cleanup-v3`
  - `default-structural-v1-structural-cleanup-v4`
- v3 fixed the mixed-run oversize regression:
  - prose blocks that sit beside structured/admin residue now keep sentence lineage
  - context prefixes no longer push those chunks over the hard max
- v4 tightened residual structural cleanup:
  - heading scaffolds such as `. Introduction` / `. Methods` are suppressed
  - orphan table headers such as `Variable | Mean ± SD n/%` are suppressed
  - publisher/reporting-summary residue such as `At BMC, research is always in progress.` and `nature portfolio | reporting summary` is suppressed
  - competing-interest notices under canonical headings are suppressed as metadata
- persisted live-default warehouse totals after `v4`:
  - `paper_chunks = 8398`
  - `paper_chunk_members = 43723`
- persisted QA after `v4`:
  - `flagged papers = 48`
  - `tiny_narrative_chunks = 20` papers
  - `repeated_nonstructural_section_labels = 18` papers
  - `suspicious_structural_title = 20` papers
  - `oversize_chunks = 0`
  - `oversize_table_chunks = 0`
- persisted row-level cleanup after `v4`:
  - `tiny narrative chunk rows = 25`
  - `one-token chunks = 0`
  - `Removed.` rows = 0`
- known bad persisted rows now absent from the live default key:
  - `216559605`: `Variable | Mean ± SD n/%`
  - `261749596`: `Conclusions | At BMC, research is always in progress.`
  - `256275682`: `Declaration of competing interest | The authors declare that they have no competing interests.`
  - `280634650`: `nature portfolio | reporting summary`
  - `255968752`: `. Introduction | . Methods`
- remaining residuals are now concentrated in:
  - genuine but weak short retrieval units
  - source-truth section-title problems that need parser refresh/rewrite, not chunk-only backfill
  - repeated non-structural section labels that QA should continue surfacing

Canonical title reconciliation:

- parser refresh/orchestration now loads `solemd.papers.title` alongside target corpus rows
- explicit-target and source-driven parse paths both apply that metadata title onto the parsed warehouse document before write
- parser-selected titles are preserved only as source metadata when they survive structural-title rejection; warehouse document title now follows canonical corpus metadata
- existing warehouse rows were reconciled with a dedicated maintenance utility:
  - module: `engine/app/rag_ingest/document_title_sync.py`
  - script: `engine/db/scripts/sync_rag_document_titles.py`
- live backfill result on the post-cleanup warehouse:
  - mismatched `paper_documents.title` vs `solemd.papers.title` rows before sync: `56`
  - mismatches after sync: `0`
  - updated corpus ids included both minor punctuation/casing drift and true parser-title failures such as:
    - `249973141`: `2.1. Subjects` -> canonical paper title
    - `259270484`: `Institutional Review Board Statement` -> canonical paper title
    - `280644239`: `Generative AI statement` -> canonical paper title
- global QA after title reconciliation:
  - flagged papers: `35`
  - `repeated_nonstructural_section_labels = 18`
  - `tiny_narrative_chunks = 20`
  - `suspicious_structural_title = 0`
- on the former title-mismatch cohort, residual flags are now only:
  - `repeated_nonstructural_section_labels`
  - isolated `tiny_narrative_chunks`

Residual structural cleanup pass (`default-structural-v1`, targeted persisted rewrite):

- shared section-label QA is now narrower and more truthful:
  - repeated labels only flag explicit noisy/admin/publisher patterns
  - repeated front-matter-only admin labels no longer trip QA
  - numeric/dotted pseudo-outline labels inherit the prior contextual heading instead of fragmenting context
- narrative structural routing is tighter:
  - reporting-summary/admin prompts under headings such as `Clinical trial registration`, `Data deposition`, `Files in database submission`, and `Software` route to metadata
  - abbreviation-glossary content under `Abbreviations` routes to metadata instead of retrieval chunks
  - more short numeric/code/table-like residue routes out of prose
- chunk assembly now performs two extra conservative repairs:
  - weak short sentence atoms are coalesced before chunk grouping
  - weak alias sections can merge into the prior contextual chunk when the section label is an obvious alias or cohort fragment
- targeted persisted QA progression on the residual cohort:
  - after structural cleanup `v3`: `11` flagged papers
  - after the first residual pass `v4`: `9` flagged papers
  - after the second residual/QA pass `v7`: `7` flagged papers
- concrete persisted improvements on the residual cohort:
  - `2273155` cleared after plot-axis residue stopped surfacing as a tiny narrative chunk
  - `250138791` cleared after numeric subsection labels (`2.` / `3.`) inherited the prior diagnostic heading and merged back into the diagnostic chunk stream
  - `276181932` cleared after abbreviation-glossary residue stopped persisting as a retrieval chunk
  - `280634650` no longer carries `tiny_narrative_chunks`; the remaining QA signal is repeated reporting-summary section labels only
- remaining residual papers after `v7`:
  - tiny narrative chunks:
    - `268369`
    - `219538626`
    - `238232041`
    - `257188828`
  - repeated non-structural section labels:
    - `52845261`
    - `237387332`
    - `255968752`
- remaining residual themes are now narrow:
  - true source/parser continuation fractures (`from the`, `(see Appendix`, broken decimal/measurement OCR)
  - repeated publisher/biography/pseudo-outline section labels that need parser-side normalization rather than chunk-only backfill

Parser-normalization and sentence-repair pass (`parser-v4`, targeted S2 refresh):

- `source_parsers.py` now normalizes or suppresses bad S2 section headers before they persist:
  - repeated publisher scaffold labels such as `Journal of Medicinal Chemistry` are skipped instead of becoming warehouse sections
  - dotted pseudo-outline headers such as `. . Protein structure prediction` are cleaned to contextual headings without the source scaffold
  - truncated inline headers ending in connector tails like `... for` are skipped so downstream blocks stay attached to the real contextual section
  - `Lead author biography` and related biography headings now normalize to `front_matter`
- `sentence_segmentation.py` now repairs one important source-annotation failure mode:
  - decimal-like numeric splits such as `477.` / `64` are merged back into a single canonical sentence span while preserving sentence-source provenance
- `narrative_structure.py` and `chunking.py` now treat the remaining low-fidelity residues more truthfully:
  - short appendix/figure/table cross-reference fragments route to metadata instead of retrieval chunks
  - hard-truncated hyphen/open-paren fragments route to placeholders instead of live chunks
  - table-like narrative residues can persist as table chunks when they are structurally meaningful
- `orchestrator.py` now skips malformed BioC archive members with a warning instead of aborting a whole refresh run

Live targeted refresh/backfill result (`residual-structural-cleanup-v8-s2`, `default-structural-v1`):

- refreshed corpus ids:
  - `268369`
  - `52845261`
  - `219538626`
  - `237387332`
  - `238232041`
  - `255968752`
  - `257188828`
- targeted refresh source path:
  - `s2_primary` only (`skip_bioc_fallback=true`) because all remaining holdouts were `primary_source_system = s2orc_v2`
- targeted persisted outcome:
  - `7/7` papers cleared
  - `flagged_corpus_ids = []`
- concrete fixes confirmed in persisted rows:
  - `52845261`: repeated `Journal of Medicinal Chemistry` sections are gone
  - `237387332`: repeated `Lead author biography` sections are now `front_matter` and no longer trip QA
  - `255968752`: dotted outline section labels persist as cleaned contextual headings, not noisy scaffold labels
  - `219538626`: weak cohort/inline header fragmentation no longer produces tiny narrative chunks
  - `238232041`: short appendix cross-reference residue no longer persists as a retrieval chunk
  - `257188828`: the numeric decimal split is repaired; the remaining short quantitative result sentence is now treated as valid QA-positive content rather than weak residue

Whole-warehouse QA after the targeted `parser-v4` refresh and QA helper update:

- `paper_documents = 355`
- flagged papers under `default-structural-v1 = 0`
- flag counter: `{}`

Runtime evaluation harness and live graph scorecard:

- new reusable evaluation module:
  - `engine/app/rag_ingest/runtime_eval.py`
- new CLI wrapper:
  - `engine/scripts/evaluate_rag_runtime.py`
- new coverage:
  - `engine/test/test_rag_runtime_eval.py`
- evaluation design:
  - sample from canonical warehouse rows joined to the live graph release
  - derive query cases from structural signals only
    - `title_global`
    - `title_selected`
    - `sentence_global`
  - score retrieval and grounding separately so the report can distinguish ranking quality from grounded-answer availability
- live graph population at evaluation time:
  - current graph release: `a9216e173007158807e9e8c063af987b1467f18831a0279f87ed87a0ad671799`
  - current graph run id: `f9ed7a59-0c4d-4810-a04d-3d35ff4e6c70`
  - live graph corpus points available: `54`
  - source split in the live graph:
    - `s2orc_v2 = 28`
    - `biocxml = 26`
- completed persisted runtime report:
  - artifact: `.tmp/rag-runtime-eval-default-structural-v1-title-global-v1.json`
  - query family: `title_global`
  - evaluated papers: `54/54` live graph papers
  - warehouse quality on the evaluated set: `0` flagged papers
  - chunk grounding runtime status:
    - `enabled = true`
    - `missing_tables = []`
    - `missing_corpus_ids = []`
- title-global runtime scorecard on the full live graph:
  - `hit@1 = 0.9074`
  - `hit@5 = 1.0`
  - `answer_present_rate = 1.0`
  - `target_in_answer_corpus_rate = 0.9815`
  - `grounded_answer_rate = 0.2037`
  - `target_in_grounded_answer_rate = 0.2037`
  - `mean_bundle_count = 2.056`
  - `mean_cited_span_count = 0.204`
- source-specific runtime result:
  - `s2orc_v2`
    - `hit@1 = 0.8929`
    - `grounded_answer_rate = 0.3929`
  - `biocxml`
    - `hit@1 = 0.9231`
    - `grounded_answer_rate = 0.0`
- failure themes in the persisted runtime report:
  - `title_global:ungrounded_answer = 43`
  - `title_global:answer_missing_target = 1`
- interpretation:
  - retrieval/ranking is strong on title-seeded queries over the live graph
  - the main remaining system weakness is grounded-answer coverage, not chunk quality or self-retrieval recall
  - the strongest residual asymmetry is source-specific:
    - `s2orc_v2` can ground some title-seeded answers
    - `biocxml` does not currently ground title-seeded answers at all on the live graph sample
- operational note:
  - the `title_selected` and `sentence_global` evaluation families are implemented in the harness but are materially slower on the current runtime stack and are better treated as separate soak runs or targeted diagnostics rather than a default quick scorecard

Runtime grounding remediation and verified live result:

- grounded-answer coverage failures were traced to the runtime adapter layer rather than ingest quality:
  - current graph `biocxml` papers carried warehouse entities but no warehouse citations
  - current graph `s2orc_v2` papers could still fail grounding when `answer_corpus_ids` mixed one covered warehouse paper with one graph-only paper
  - baseline answer selection was also too thin for title-like queries because it always emitted the top fused bundles rather than preserving an exact-title lexical anchor
- concrete runtime diagnosis on the live graph release:
  - `biocxml` live graph papers:
    - `docs = 26`
    - `docs_with_citations = 0`
    - `docs_with_entities = 26`
  - `s2orc_v2` live graph papers:
    - `docs = 28`
    - `docs_with_citations = 28`
    - `docs_with_entities = 0`
  - real partial-coverage failure inspected live:
    - query answer bundle ids: `[138129, 1216853]`
    - `138129` had canonical warehouse rows
    - `1216853` had no warehouse document/chunk/member rows
    - old runtime status returned `enabled = false` for the whole answer because one corpus id was missing
- runtime grounding changes:
  - `engine/app/rag/warehouse_grounding.py`
    - entity rows now join canonical block/sentence context
    - grounded answers can be built from entity-only packets when no citation rows exist
    - packet ordering now respects the requested corpus order
  - `engine/app/rag/chunk_grounding.py`
    - chunk grounding now forwards entity-only packet context and segment-to-corpus alignment
  - `engine/app/rag/grounded_runtime.py`
    - runtime status now records `covered_corpus_ids`
    - grounded-answer assembly now uses the covered subset instead of failing all-or-nothing on mixed covered/uncovered answers
  - `engine/app/rag/source_grounding.py`
    - segment anchors can now be assigned by `segment_corpus_ids` rather than only segment index
  - `engine/app/rag/answer.py`
    - baseline answer payload is now centralized
    - exact-title lexical anchor bundles are preserved for title-like queries even when citation-neighbor bundles outrank them in fused score
  - `engine/app/rag/service.py`
    - runtime grounding now consumes the centralized answer payload and passes segment/corpus alignment into the warehouse grounder
- new test coverage for the runtime grounding path:
  - `engine/test/test_rag_answer.py`
  - `engine/test/test_rag_grounded_runtime.py`
  - `engine/test/test_rag_warehouse_grounding.py`
  - `engine/test/test_rag_chunk_grounding.py`
  - `engine/test/test_rag_source_grounding.py`
  - `engine/test/test_rag_service.py`
- verified live-runtime progression on the same full current graph release:
  - pre-fix report artifact:
    - `.tmp/rag-runtime-eval-default-structural-v1-title-global-v1.json`
  - grounding/runtime structural fix report:
    - `.tmp/rag-runtime-eval-default-structural-v1-title-global-v2.json`
  - answer-anchor follow-up report:
    - `.tmp/rag-runtime-eval-default-structural-v1-title-global-v3.json`
- title-global live scorecard progression:
  - `hit@1`: `0.9074 -> 0.9074 -> 0.9074`
  - `hit@5`: `1.0 -> 1.0 -> 1.0`
  - `target_in_answer_corpus_rate`: `0.9815 -> 0.9815 -> 1.0`
  - `grounded_answer_rate`: `0.2037 -> 0.9815 -> 1.0`
  - `target_in_grounded_answer_rate`: `0.2037 -> 0.9815 -> 1.0`
  - `mean_cited_span_count`: `0.204 -> 8.148 -> 8.167`
- source-specific live grounding progression:
  - `s2orc_v2`
    - `grounded_answer_rate = 0.3929 -> 0.9643 -> 1.0`
  - `biocxml`
    - `grounded_answer_rate = 0.0 -> 1.0 -> 1.0`
- residual runtime miss fixed by the answer-anchor pass:
  - corpus id `5496257`
  - title: `Motor Performance Is not Enhanced by Daytime Naps in Older Adults`
  - old behavior:
    - target paper was retrieved at rank `3`
    - answer bundles emitted only higher-ranked citation-neighbor review papers
    - runtime grounding had no covered answer paper to attach
  - new behavior:
    - answer selection preserves the exact-title paper as the answer anchor
    - grounded answer links corpus id `5496257`
    - no failure themes remain in `title_global` over the full live graph release

## Cutover Note

The live warehouse currently mixes canonical parser versions:

- `parser-v1 = 294`
- `parser-v2 = 60`
- `parser-v3 = 1`

Because of that, I did not overwrite the global runtime default key with the new metadata in this pass.

Instead:

- the canonical ingest code now defaults to the upgraded hybrid policy for new writes
- preview backfills can be seeded under explicit version keys
- runtime default cutover should happen only after a deliberate version-key migration or a broader canonical refresh

## Non-Goals

- moving live serving code into `rag_ingest`
- replacing canonical chunk derivation with a third-party chunk library
- changing the outer runtime grounding contract
- introducing frontend workarounds
