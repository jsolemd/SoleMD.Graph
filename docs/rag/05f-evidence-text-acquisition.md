# 05f — Evidence-Text Acquisition

> **Status**: landed for the separation between the bulk selected-corpus
> backbone and paper-level evidence-text acquisition, the worker/runtime home
> under `apps/worker/app/evidence`, the one-message-per-paper topology, the PMCID /
> PMID resolution order, and the rule that fetched full text rewrites the
> canonical document spine in warehouse rather than creating a parallel cache.
> **Provisional**: future source expansion beyond PMC BioC, evidence-wave
> admission thresholds, and any later full-text annotation overlay beyond the
> current canonical PubTator release surfaces.
>
> **Date**: 2026-04-19
>
> **Scope**: targeted full-text acquisition for papers that have already been
> selected into the canonical corpus, promoted into the mapped paper-level
> active universe, and admitted into the smaller evidence child wave. This doc
> sits after corpus selection (`05e`) and before chunking / evidence assembly
> (`05a`). It does not redefine corpus or mapped membership and it does not
> replace the broad raw-ingest lane (`05`).
>
> **Schema authority**: `02-warehouse-schema.md` remains authority for the
> durable warehouse surfaces. This doc is the runtime authority for the worker
> lane, request shape, resolution order, and source-precedence behavior.

## Purpose

Make one boundary explicit:

- **Bulk source releases plus corpus selection** define the selected canonical
  corpus backbone.
- **Live API acquisition** fills full-text surfaces only for the much smaller
  evidence child wave.

This keeps the large selected corpus reproducible and warehouse-local while
still letting evidence-wave papers fetch higher-fidelity full text on demand.

## Implementation state

The first production evidence-text slice is now landed in `apps/worker/app`.

- Landed in code: `app/evidence/*`, `evidence.acquire_for_paper`,
  `app.evidence_worker`, the shared document-spine rewrite path, and CLI
  entrypoints in `app.main`.
- Landed in schema/docs: `paper_text_acquisition_runs`, the evidence-text warehouse
  schema files, and the runtime/env contract for the PMC BioC evidence lane.
- Landed in tests: CLI/runtime coverage for locator resolution, failure
  handling, and canonical document-spine rewrite behavior.

This lane is one downstream child wave inside the mapped universe. It is not a
prerequisite for mapped paper-level retrieval, graph projection, or other
paper-level work.

## Load-bearing properties

1. **One paper per actor invocation.** The canonical entrypoint is
   `evidence.acquire_for_paper(corpus_id, force_refresh=False, ...)` on queue
   `evidence`.
2. **The canonical document spine stays canonical.** Fetched full text writes to
   `solemd.paper_documents`, `paper_sections`, `paper_blocks`, and
   `paper_sentences`; it does not live in a sidecar cache table.
3. **PMC BioC is the first full-text source.** The initial worker slice uses the
   NCBI PMC BioC API as the production full-text surface.
4. **Locator resolution is robust and deterministic.** Resolution order is:
   warehouse `papers.pmc_id` → NCBI PMCID converter by PMID → PubMed ESummary
   article-id lookup by PMID → direct PMID fetch against PMC BioC → NCBI PMCID
   converter by DOI. The worker advances to the next candidate only for clear
   candidate-level misses such as HTTP 400/404 or an explicit PMC "no result"
   payload. Upstream transport, rate-limit, or server failures are treated as
   run failures, not quiet fallthrough.
5. **The selected corpus remains bulk-defined.** This lane never decides corpus
   membership and it never substitutes for the raw Semantic Scholar / PubTator
   release backbone.
6. **PubTator remains the broad annotation substrate.** This lane acquires full
   text only. Broad PT3 coverage comes from `pubtator.*_stage`, while canonical
   PT3 tables remain a mapped-owned materialization surface rather than a
   prerequisite for every admitted corpus paper.
7. **Mapped and evidence stay separate.** `mapped` is the paper-level active
   universe. `evidence` is the smaller full-text parsed/chunked/grounded
   subset inside mapped. This lane is an evidence-wave input, not a mapped
   membership definition.
8. **Source precedence is explicit.** `document_source_kind = pmc_bioc` outranks
   `s2orc_annotation` when evidence-text acquisition succeeds.
9. **S2ORC is evidence-tier only.** `s2orc_v2` is reserved as a release-backed
   fallback/full-text input for evidence waves. It is not a default raw ingest
   family and it is not a mapped-tier input.

## Upstream handoff

The parent/child handoff is now explicit rather than implied:

- `05e` owns the parent selected universe on `solemd.corpus.domain_status =
  'mapped'`.
- `corpus.dispatch_evidence_wave` owns the first evidence-wave selection and
  enqueues `evidence.acquire_for_paper`.
- `05e` also owns the stage boundary: corpus baseline materialization for the
  broad admitted universe, then mapped-owned heavy surfaces for the stricter
  active paper universe.
- The first landed policy is `evidence_missing_pmc_bioc`, which selects mapped
  papers lacking a canonical PMC BioC document in warehouse and emits one
  paper-level actor message per evidence-wave member.

## Why not rely on live APIs for the whole corpus

The live API checks on 2026-04-19 made the split clear:

- Semantic Scholar’s paper API returned metadata, abstract, open-access PDF
  pointers, TLDR, and embeddings, but not a normalized full-text body that can
  replace S2ORC-style parsing.
- Semantic Scholar raw release ingest already populates `papers.pmc_id` when
  S2 ships `externalIds.PubMedCentral`; the evidence-text lane only needs an
  additional PubMed-side recovery path when that field is missing.
- The live Semantic Scholar API rate-limited quickly under unauthenticated use,
  which is already enough to disqualify it as the selected-corpus backbone.
- The release-backed `s2orc_v2` files remain useful only at the evidence tier:
  they can fill document-spine gaps for mapped papers when PMC BioC is absent,
  but they should not broaden corpus membership or mapped rollout scope.
- PubTator-by-PMID returned only title/abstract BioC for the tested paper.
- The PMC BioC API returned the full passage structure for the same article.
- A PMCID in PubMed / PMC identifier services does **not** guarantee that the
  article is available through the PMCOA BioC endpoint. The worker therefore
  treats PMCID resolution and PMC BioC fetchability as separate checks.

Therefore the initial evidence-text slice uses the PMC BioC surface for targeted
full-text refresh and keeps broad-corpus ingest on the release-backed lanes.

## Runtime layout

Target implementation:

- `apps/worker/app/evidence/models.py`
- `apps/worker/app/evidence/errors.py`
- `apps/worker/app/evidence/cli.py`
- `apps/worker/app/evidence/ncbi.py`
- `apps/worker/app/evidence/parser.py`
- `apps/worker/app/evidence/runtime.py`
- `apps/worker/app/actors/evidence.py`
- `apps/worker/app/evidence_worker.py`

The worker uses the existing worker shell, Redis broker, and `ingest_write`
pool. No new broker or API-side orchestration layer is introduced.

## Current telemetry surface

The landed evidence-text telemetry uses Dramatiq's Prometheus middleware plus
`prometheus_client` application metrics on the same scope-local
multiprocess store prepared by `app.telemetry.bootstrap`.
`app.evidence_worker` owns the `evidence` scope and, by default, exposes
it on local port `9466`.

Current evidence-text metric families:

- `paper_text_acquisitions_total`
- `paper_text_acquisition_duration_seconds`
- `paper_text_document_rows_total`
- `paper_text_failures_total`
- `paper_text_inprogress`

Current warehouse-local audit surface:

- `solemd.paper_text_contract_audit`
  - read-only view that joins `paper_text` to the active document spine and
    exposes mismatch flags such as:
    - active document present but `paper_text.text_availability` still below
      full-text
    - parsed abstract present but stored `paper_text.abstract` still empty

Evidence-wave selection itself is metered on the `corpus` worker scope
via `corpus_wave_*` metrics; this evidence scope starts once
`evidence.acquire_for_paper` is enqueued.

## Request contract

Validated payload:

```json
{
  "corpus_id": 123,
  "force_refresh": false,
  "requested_by": "operator"
}
```

CLI and queue both use the same `AcquirePaperTextRequest` shape.

## Warehouse writes

### Control ledger

`solemd.paper_text_acquisition_runs`

- one row per paper-level acquisition attempt
- captures status, resolved locator family, winning manifest URI, checksum, and
  terminal error if any
- is written by `engine_ingest_write`

### Canonical document rewrite

On success the worker:

1. rewrites `solemd.paper_documents`
2. rewrites `solemd.paper_sections`
3. rewrites `solemd.paper_blocks`
4. rewrites `solemd.paper_sentences`
5. updates `solemd.paper_text.text_availability = fulltext`
6. backfills `solemd.papers.pmc_id` if the PMCID was resolved live

The document row records:

- `document_source_kind = pmc_bioc`
- `source_priority = 5`
- `source_revision = <resolved PMCID or winning locator>`

This explicitly outranks the current `s2orc_annotation` source priority of `10`.

## Parser contract

The first parser is intentionally simple and deterministic:

- BioC heading/title passages create section rows
- text passages create block rows
- deterministic sentence splitting populates `paper_sentences`
- front-matter and reference-ish passages remain non-default for retrieval even
  when they are retained in the canonical spine
- table bodies are retained but marked non-default for retrieval

This slice does not attempt to solve all later full-text normalization problems.
It only needs to produce a canonical warehouse spine that chunking can consume.

## Non-goals

- no broad-corpus API hydration
- no serve-side writes
- no chunk/evidence assembly in this actor
- no new OpenSearch writes
- no attempt to replace PubTator release coverage with live annotation fetches
- no automatic evidence-wave admission policy in this slice

## Follow-on work

1. Expand the child-wave policy only if `05e` introduces a richer mapped /
   evidence priority surface than the current `evidence_missing_pmc_bioc`
   contract.
2. Feed the resulting canonical document spine into `05a` chunking for the
   evidence lane.
3. Revisit annotation overlays only if the PMC/PubTator full-text surfaces
   become stable enough to justify a second targeted evidence enrichment slice.
