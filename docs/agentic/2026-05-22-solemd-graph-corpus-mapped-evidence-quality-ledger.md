# 2026-05-22 SoleMD.Graph Corpus, Mapped, and Evidence Quality Ledger

- Date: `2026-05-22`
- Repo: `SoleMD.Graph`
- Scope: corpus / mapped / evidence tier semantics, mapped quality
  calibration, RAG readiness, evidence policy gates, and follow-on evaluation
- Status: `active quality calibration and policy design`
- Current completed corpus-selection run:
  `019dd72b-cceb-7a37-b958-706e5e5ea9f4`
- Current completed selection-summary refresh:
  `019e1394-2544-794f-a19f-025105df5c87`
- Current completed quality audit:
  `019e1479-2774-7713-abef-243a8d835c62`

## Purpose

This ledger records what has been completed in the corpus / mapped / evidence
quality pass and what should happen next.

The working product model is now:

```text
corpus  -> broad recall and general text-backed RAG universe
mapped  -> graph-visible paper universe for the default orb / map
evidence -> high-quality answer-grounding layer for OpenSearch and the LLM
```

These tiers must use the same metadata, but they should not use the same
single score. A paper can be useful corpus context, graph-worthy mapped
material, and still not be suitable as evidence-grade LLM grounding.

## What Has Been Done

### Tier semantics clarified

The current contract is:

- `corpus` is broad selected biomedical recall. It should eventually support
  general RAG over papers with usable text.
- `mapped` is the graph-visible universe. It can include papers that do not yet
  have retrievable text because graph membership is a relevance/connectivity
  decision, not a text-readiness decision.
- `evidence` is not the same as an evidence score. It should mean citable,
  chunked, policy-approved answer-grounding material.

The existing warehouse currently has evidence priority scores, but the evidence
serving layer is not populated yet:

- `solemd.paper_evidence_units`: `0` rows
- `solemd.paper_chunks`: `0` rows
- `solemd.paper_chunk_versions`: `0` rows

So `evidence_priority_score` is a ranking/control signal, not evidence
membership.

### Selection summary refreshed after enrichment

The selection-summary refresh was completed after Semantic Scholar Graph and
PubMed metadata enrichment.

Current summary row count:

| Surface | Rows |
|---|---:|
| `paper_selection_summary` total | `15,292,778` |
| mapped total | `3,066,143` |
| mapped RAG eligible under current rule | `2,483,287` |

Current mapped text-readiness split:

| Content status | Mapped rows | Current RAG eligible | Raw PT3 entities | Curated entity signals | PMCID |
|---|---:|---:|---:|---:|---:|
| `abstract_ready` | `2,483,287` | `2,483,287` | `2,316,330` | `1,838,583` | `776,297` |
| `metadata_only` | `582,789` | `0` | `253,666` | `146,119` | `10,966` |
| `missing_text` | `67` | `0` | `0` | `0` | `0` |

Current corpus-plus-mapped text surface:

| Current status | Content status | Rows |
|---|---:|---:|
| `corpus` | `abstract_ready` | `5,976,050` |
| `corpus` | `metadata_only` | `6,250,571` |
| `mapped` | `abstract_ready` | `2,483,287` |
| `mapped` | `metadata_only` | `582,789` |
| `mapped` | `missing_text` | `67` |

Implication: current `rag_eligible` is narrower than the future product goal.
It means `mapped + text-ready` today. A future general corpus RAG layer should
be allowed to retrieve from text-backed corpus papers too, with mapped/evidence
boosts.

### Quality audit workflow landed

A durable corpus-quality audit workflow now exists and snapshots quality
distributions, samples, and findings.

Implemented worker surfaces include:

- `solemd.corpus_quality_audit_runs`
- `apps/worker/app/corpus/quality_audit.py`
- `apps/worker/app/corpus/quality_audit_store.py`
- `apps/worker/app/corpus/quality_audit_queries.py`
- CLI and actor entry points for running the audit

The audit intentionally does not mutate per-paper policy. It is a measurement
and review surface.

### Metadata-only papers investigated

The no-abstract question was traced through S2, PubMed, and PubTator:

- PubMed enrichment often returned publication types, MeSH, PMCID, and other
  metadata, but no `AbstractText`.
- Semantic Scholar raw abstract was also null for sampled metadata-only papers.
- PubTator `bioconcepts` rows are document-level concept inventories, not
  passage text. Entity presence does not prove we have retrievable text.
- Some high-value metadata-only papers have PMCID and free full text, but that
  requires a separate PMC full-text parser/materialization lane.

Examples of high-value metadata-only PMCID papers:

| PMID | Title | Reason this matters |
|---:|---|---|
| `21193625` | Standards of Medical Care in Diabetes-2011 | No abstract, PMCID present, practice guideline, strong citation signal |
| `29016841` | AF ablation expert consensus statement | No abstract, PMCID present, consensus/practice guideline |
| `34390232` | Guideline for Pharmacological Therapy of Schizophrenia | No abstract, PMCID present, high curated entity signal |

Current PMCID opportunity:

| Candidate set | Rows |
|---|---:|
| metadata-only mapped with PMCID | `10,966` |
| all mapped with PMCID | `787,263` |

Implication: rescuing metadata-only PMCID papers is a small high-value lane.
Parsing every mapped PMCID into evidence RAG should not be the default policy.

### Relation signal status clarified

The relation signal is not dead.

Known current observations:

- Raw PT3 relation coverage exists in mapped papers.
- Curated mapped relation matches exist, but are much smaller than raw
  relations.
- A stale unlogged mapped relation artifact mismatch was detected after WSL
  crash behavior. The artifact ledger survived, but the physical scratch table
  was empty. The artifact validator was hardened so complete ledger rows are
  not trusted unless the unlogged table physically exists with expected size.

Implication: relation signals should remain part of mapped/evidence quality,
but raw relation presence and curated relation rule match must be distinct
signals.

### First mapped calibration pass completed

Mapped is not one homogeneous population.

| Slice | Rows | Interpretation |
|---|---:|---|
| `abstract_ready + venue_supported` | `1,565,611` | Broad mapped graph/context layer |
| `abstract_ready + high_confidence` | `588,349` | Strong mapped/evidence candidate pool |
| `abstract_ready + clinical_bridge` | `329,327` | CL-overlap layer |
| `metadata_only + venue_supported` | `550,624` | Mapped backlog, not RAG-ready |
| `metadata_only + clinical_bridge` | `25,940` | Relevant but text-deficient |
| `metadata_only + high_confidence` | `6,225` | Small high-value full-text rescue pool |

Evidence-score bands among mapped:

| Evidence score band | Abstract-ready mapped | Metadata-only mapped |
|---|---:|---:|
| `400+` | `154,437` | `11` |
| `350-399` | `252,407` | `609` |
| `300-349` | `271,452` | `1,874` |
| `250-299` | `266,859` | `3,523` |
| `200-249` | `521,478` | `9,158` |
| `150-199` | `1,016,654` | `66,086` |

Current practical finding: `mapped + abstract_ready + evidence_score >= 350`
is a plausible first evidence candidate band, but the score alone is not an
evidence policy.

### Low-value publication types identified as demotion candidates

Low-value publication types can score high because they have strong entities,
citations, PMCID, or venue support. They may be useful graph context, but they
should not be default answer-grounding evidence unless the user asks for that
kind of material.

Demotion candidates include:

- editorial
- comment
- letter
- news
- published erratum
- some case-report letters

These should usually be demoted for evidence, not necessarily removed from
mapped.

### PMC full-text parser handoff clarified

The PMC/JATS/BioC parser is a separate project.

The parser should provide provenance and normalized text surfaces:

- source provider
- license
- checksum
- parser version
- section hierarchy
- passage text
- section role / confidence

The parser should not decide evidence policy.

The evidence-grade policy layer should consume parser provenance and decide:

- which article types are admitted
- which license classes are allowed
- which records need review
- which retraction/correction states are excluded
- which study designs rank highest
- when `fulltext_ready` becomes `rag_eligible` or `evidence_eligible`

## Current Working Interpretation

### `content_status`

Physical text readiness:

- `fulltext_ready`: licensed full text parsed and materialized
- `abstract_ready`: S2 or PubMed abstract exists and is retrievable
- `metadata_only`: relevant metadata exists but no text surface exists yet
- `missing_text`: no usable text and no useful locator path

### `rag_eligible`

Current implementation: `mapped + abstract/fulltext-ready`.

Desired future split:

- `corpus_retrieval_eligible`: text-backed papers usable for broad corpus RAG
- `mapped_graph_eligible`: graph-visible mapped papers
- `evidence_eligible`: policy-approved answer-grounding evidence

The name `rag_eligible` is currently ambiguous. It should either be renamed or
treated as one policy-specific field rather than the universal retrieval gate.

### `fulltext_ready`

A materialization fact, not a policy verdict.

It should mean licensed full text was fetched, parsed, checksummed, sectioned,
and materialized into retrievable passages.

### `evidence_eligible`

A policy verdict.

It should require text, provenance, acceptable article/license class, exclusion
checks, and a quality/promotion rule.

## Signals To Leverage

All of these signals should be used, but differently by tier:

- text readiness: S2 abstract, PubMed abstract, future PMC full text
- publication type: guideline, consensus statement, systematic review,
  meta-analysis, clinical trial, observational study, review, case report,
  editorial, comment, letter, erratum
- MeSH headings and major topics
- PT3 raw entity inventory
- curated entity signals
- curated relation matches
- raw relation counts
- Semantic Scholar incoming citations and influential citations
- S2 fields of study
- publication venue type and normalized venue
- PubMed citation subsets
- PMCID / DOI / PMID locator availability
- open-access and license status
- retraction, erratum, comments/corrections
- CL bridge: psych/neuro/behavior anchor plus organ-system/care-setting anchor
- organ-system tracks
- recency

## What I Will Do Next

### 1. Build the policy vocabulary before changing thresholds

Define small auditable classes rather than burying rules in one score:

- `publication_type_class`
- `license_class`
- `content_readiness`
- `corpus_retrieval_class`
- `mapped_graph_class`
- `evidence_grounding_class`
- `promotion_reasons`
- `demotion_reasons`
- `exclusion_reasons`

This should be implemented as a policy/control layer over existing metadata,
not as parser logic.

### 2. Calibrate corpus retrieval separately from mapped graph quality

Corpus retrieval should eventually include text-backed corpus papers, not only
mapped papers.

Planned rule direction:

- require retrievable text
- allow broad corpus recall
- boost mapped papers
- strongly boost evidence-approved papers
- demote low-value publication types
- keep provenance visible

### 3. Calibrate mapped graph quality

Mapped graph inclusion should continue to prioritize:

- curated mapped journals
- venue patterns
- curated entity signals
- curated relation matches
- CL bridge signals
- organ-system tracks
- high-connectivity and high-citation anchors

Text is useful but should not be required for graph visibility.

The next QA pass should stratify samples by:

- high-confidence mapped
- clinical bridge
- venue-supported with no curated entity signal
- metadata-only high confidence
- low-value publication type but high score
- relation-rule match
- high-citation mapped
- suspicious venues / proceedings / editorials

### 4. Define evidence policy selectors and promotion gates

Evidence policy should select papers before expensive full-text parsing.

Initial selectors should include:

- `evidence_grade_abstract`
- `evidence_grade_pmcid`
- `evidence_review_queue_pmcid`
- `evidence_demoted_context`
- `evidence_excluded`

Policy gates should cover:

- admitted article types
- admitted license classes
- retraction and erratum exclusions
- study-design ranking
- section/text availability
- citation and locator requirements
- when parsed full text becomes evidence-eligible

The evidence policy agent should not modify BioC/JATS parsing. It should
consume parser provenance and section confidence.

### 5. Keep PMC full-text parsing targeted at first

Do not start with broad "parse every mapped PMCID into evidence RAG."

Preferred sequence:

1. Select high-value evidence-grade PMCID candidates.
2. Parse a pilot set through the PMC full-text lane.
3. Verify section quality, license provenance, checksums, and chunk quality.
4. Promote only policy-approved papers to evidence.
5. Expand to metadata-only PMCID rescue if the pilot is clean.
6. Consider broader mapped PMCID full-text backfill only after policy and
   parser quality are measured.

### 6. Turn evidence scores into explainable calibrated scores

The existing `mapped_priority_score` and `evidence_priority_score` should be
treated as provisional control scores.

Next scoring pass should produce separate scores:

- `corpus_retrieval_score`
- `mapped_graph_score`
- `evidence_grounding_score`

Each score should have explicit component weights and auditable reason fields.
Low-value publication types should become demotions for evidence even when they
remain useful in mapped.

### 7. Continue live QA before locking thresholds

Before thresholds become durable, rerun stratified QA with real samples and
compare:

- false positives in mapped
- high-value papers currently metadata-only
- evidence candidates by publication type
- evidence candidates by CL bridge and organ system
- relation-driven candidates
- venue-only candidates
- high-score low-value publication types
- corpus text-backed papers not in mapped but potentially useful for general
  RAG

## Open Decisions

- Whether to rename current `rag_eligible` or add explicit fields beside it.
- Whether corpus-general RAG should index all text-backed corpus papers in the
  first wave or begin with mapped plus a broad-corpus fallback.
- Exact admitted license classes for evidence-grade full text.
- Whether letters/case reports should be evidence-demoted by default or kept in
  a query-specific evidence lane.
- Exact first evidence threshold after policy class demotions are applied.
- Whether SPECTER2 is used only for mapped graph placement/ranking or also as a
  retrieval-side paper-level fallback when no chunks exist.

## Guardrails

- Do not use PubTator `bioconcepts` as text.
- Do not let parser code decide evidence policy.
- Do not collapse `fulltext_ready` and `evidence_eligible`.
- Do not call an evidence score an evidence set until chunks/evidence units are
  materialized.
- Do not parse every mapped PMCID by default.
- Do not use citations as corpus admission gates.
- Do not hard-code shallow organ-system or psych anchor lists as the real
  policy. Use MeSH, vocab assets, curated rules, and measured QA.
