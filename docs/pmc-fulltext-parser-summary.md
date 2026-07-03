# PMC Full-Text Parser Summary

Date: 2026-05-22

## What Was Done

Built and hardened the PMC full-text enrichment lane for mapped PMCID papers. The lane now only promotes papers when licensed PMC full text is available, BioC-PMC text is fetched, normalized passages are materialized, and at least one retrievable abstract/body passage exists.

Implemented the worker package under `apps/worker/app/pmc_fulltext/`:

- Candidate selection for `metadata-only-pmcid` and `mapped-pmcid`.
- PMC OA/OAI availability and license provenance resolution.
- BioC-PMC fetch and parser adapter using `bioc==2.1`.
- JATS adapter scaffold kept fixture-gated and out of production.
- Section/passages normalization.
- Idempotent document materialization and guarded promotion.
- CLI commands for `pilot`, `run`, `retry`, and `qa`.
- Prometheus metrics and structured runtime events.

Added audited warehouse surfaces:

- `solemd.pmc_fulltext_fetch_runs`
- `solemd.pmc_fulltext_documents`
- `solemd.pmc_fulltext_sections`
- `solemd.pmc_fulltext_passages`

Added section-fidelity fields to `pmc_fulltext_sections`:

- `section_type`: raw BioC/JATS section type.
- `section_role_codes`: all normalized candidate roles for compound/ambiguous sections.
- `section_role_confidence`: deterministic confidence score.
- `section_role_source`: provenance for the mapping decision.

Hardened section semantics:

- Treat JATS/BioC section labels as hints, not ground truth.
- Preserve raw source labels and normalized role provenance.
- Keep ambiguous review headings as `unknown` instead of overclaiming roles.
- Preserve hierarchy and ordinal paths.
- Support compound sections such as `materials|methods`.
- Promote untiered BioC `type=title` passages into nested sections when they are real headings.
- Keep administrative sections such as author contributions, conflicts, funding, supplements, and data availability non-retrievable by default.
- Drop references/back matter from retrieval.
- Include figure/table captions as retrievable passages; table bodies only if clean and bounded.

Added license safeguards:

- Centralized invalid license handling in `apps/worker/app/pmc_fulltext/license.py`.
- Normalized `license="none"`, `unknown`, `n/a`, and similar values to missing provenance.
- Availability now falls back from PMC OA to OAI when OA has no usable license.
- Promotion and idempotent skip paths refuse parsed documents without valid license provenance.

Applied and verified local warehouse migration:

- `db/migrations/warehouse/20260511143000_warehouse_pmc_fulltext_section_roles.sql`
- Migration ledger verified ready: 39 applied, no missing migrations, no checksum mismatches.

## Quality Checks Performed

Test coverage added for:

- BioC XML with abstract/body/back/ref sections.
- No-abstract full text.
- Letters/case reports.
- Nested sections and ordinal paths.
- Figure and table captions.
- Huge/unclean table body handling.
- Malformed XML.
- Deterministic passage checksums.
- Idempotent reruns.
- Promotion refusal when passages are absent.
- Promotion refusal when license provenance is invalid.
- PMC OA `license="none"` normalization and OAI fallback.

Verification results:

- Focused PMC suite: `13 passed`.
- Full worker suite: `129 passed`.
- `compileall` passed for PMC parser/runtime surfaces.
- `git diff --check` passed.
- CodeAtlas final diff analysis reported low blast radius.

Live warehouse QA:

- Final parser version: `bioc-2.1:solemd-pmc-bioc-v8`.
- Live v8 sample run parsed 3 papers with 284 passages and 275 retrievable passages.
- Review body headings with raw BioC `INTRO` but non-introduction titles now persist as `unknown`, not `introduction`.
- Author contribution and conflict-of-interest sections persist as nested non-retrievable administrative sections with raw BioC codes and high-confidence provenance.
- A candidate with `license="none"` is now recorded as `unavailable` and does not fetch/promote.

## Standards Position

The implementation follows the standard shape of S2/PT3-style pipelines: raw source provenance is retained, parser output is normalized into auditable intermediate surfaces, and downstream evidence policy consumes those surfaces rather than being embedded in parser code.

The parser intentionally does not assume that section types are fully standardized. JATS `<sec>` is structural, `@sec-type` is optional/open text, and BioC-PMC uses text-mining section labels. The lane therefore stores raw labels plus normalized role/provenance/confidence instead of treating any single source label as canonical truth.

## What Should Happen Next

Evidence-grade policy should be implemented as a separate policy layer. That layer should decide which parsed papers become evidence-grade RAG material. Parser success should remain necessary but not sufficient.

Recommended next work:

1. Define evidence-grade selectors and admission criteria.
2. Add exclusion rules for retractions, expressions of concern, invalid licenses, editorials, low-signal article types, and other policy exclusions.
3. Define article-type and study-design tiers: guideline, systematic review/meta-analysis, RCT, cohort, case-control, mechanistic, case report, letter, editorial.
4. Add an evidence policy table or config that consumes parser provenance, section confidence, article type, citation/retraction metadata, and source provenance.
5. Gate `rag_eligible` through evidence policy rather than parser success alone.
6. Add QA reports that sample persisted passages by role, confidence, license class, article type, and evidence tier.
7. Expand live parser QA beyond the current small sample, especially for guidelines, randomized trials, meta-analyses, case reports, letters, and heavily nested review articles.
8. Keep JATS parsing fixture-gated until it beats or clearly complements BioC-PMC on structural fidelity.

## Handoff For Evidence-Grade Agent

Own the evidence policy layer, not parser mechanics. Consume:

- `paper_selection_summary`
- PMC document/passages provenance
- license fields
- `section_role`
- `section_role_codes`
- `section_role_source`
- `section_role_confidence`
- parser version
- retraction/exclusion metadata

Deliver:

- Evidence-tier policy.
- Article-type inclusion/exclusion rules.
- Retraction and license exclusion rules.
- Study-design ranking.
- RAG eligibility gates.
- Tests and QA queries.

Do not rewrite BioC/JATS parsing unless the parser provenance contract is insufficient. If the policy layer needs more parser fields, add audited provenance fields rather than collapsing policy into parser heuristics.
