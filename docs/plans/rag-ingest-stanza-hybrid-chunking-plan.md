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
