# 05f — Hot-Text Acquisition

> **Status**: locked for the separation between the bulk selected-corpus
> backbone and paper-level hot-text acquisition, the worker/runtime home under
> `apps/worker/app/hot_text`, the one-message-per-paper topology, the PMCID /
> PMID resolution order, and the rule that fetched full text rewrites the
> canonical document spine in warehouse rather than creating a parallel cache.
> **Provisional**: future source expansion beyond PMC BioC, hot-lane admission
> thresholds, and any later full-text annotation overlay beyond the current
> canonical PubTator release surfaces.
>
> **Date**: 2026-04-19
>
> **Scope**: targeted full-text acquisition for papers that have already been
> selected into the canonical corpus and are being promoted toward the hot
> evidence path. This doc sits after corpus selection (`05e`) and before
> chunking / evidence assembly (`05a`). It does not redefine the selected
> corpus and it does not replace the broad raw-ingest lane (`05`).
>
> **Schema authority**: `02-warehouse-schema.md` remains authority for the
> durable warehouse surfaces. This doc is the runtime authority for the worker
> lane, request shape, resolution order, and source-precedence behavior.

## Purpose

Make one boundary explicit:

- **Bulk source releases** define the selected canonical corpus backbone.
- **Live API acquisition** fills full-text surfaces only for the much smaller
  hot-path cohort.

This keeps the large selected corpus reproducible and warehouse-local while
still letting hot-path papers fetch higher-fidelity full text on demand.

## Load-bearing properties

1. **One paper per actor invocation.** The canonical entrypoint is
   `hot_text.acquire_for_paper(corpus_id, force_refresh=False, ...)` on queue
   `hot_text`.
2. **The canonical document spine stays canonical.** Fetched full text writes to
   `solemd.paper_documents`, `paper_sections`, `paper_blocks`, and
   `paper_sentences`; it does not live in a sidecar cache table.
3. **PMC BioC is the first full-text source.** The initial worker slice uses the
   NCBI PMC BioC API as the production full-text surface.
4. **Locator resolution is robust and deterministic.** Resolution order is:
   warehouse `papers.pmc_id` → NCBI PMCID converter by PMID → PubMed ESummary
   article-id lookup by PMID → direct PMID fetch against PMC BioC → NCBI PMCID
   converter by DOI. If an earlier PMCID candidate resolves but the PMC BioC
   fetch still fails, the worker tries the next candidate in order before it
   marks the paper unavailable.
5. **The selected corpus remains bulk-defined.** This lane never decides corpus
   membership and it never substitutes for the raw Semantic Scholar / PubTator
   release backbone.
6. **PubTator remains the broad annotation substrate.** This lane acquires full
   text only. Broad entity / relation coverage still comes from the canonical
   PubTator release tables already in warehouse.
7. **Source precedence is explicit.** `document_source_kind = pmc_bioc` outranks
   `s2orc_annotation` when hot-text acquisition succeeds.

## Why not rely on live APIs for the whole corpus

The live API checks on 2026-04-19 made the split clear:

- Semantic Scholar’s paper API returned metadata, abstract, open-access PDF
  pointers, TLDR, and embeddings, but not a normalized full-text body that can
  replace S2ORC-style parsing.
- Semantic Scholar raw release ingest already populates `papers.pmc_id` when
  S2 ships `externalIds.PubMedCentral`; the hot-text lane only needs an
  additional PubMed-side recovery path when that field is missing.
- The live Semantic Scholar API rate-limited quickly under unauthenticated use,
  which is already enough to disqualify it as the selected-corpus backbone.
- PubTator-by-PMID returned only title/abstract BioC for the tested paper.
- The PMC BioC API returned the full passage structure for the same article.
- A PMCID in PubMed / PMC identifier services does **not** guarantee that the
  article is available through the PMCOA BioC endpoint. The worker therefore
  treats PMCID resolution and PMC BioC fetchability as separate checks.

Therefore the initial hot-text slice uses the PMC BioC surface for targeted
full-text refresh and keeps broad-corpus ingest on the release-backed lanes.

## Runtime layout

Target implementation:

- `apps/worker/app/hot_text/models.py`
- `apps/worker/app/hot_text/errors.py`
- `apps/worker/app/hot_text/cli.py`
- `apps/worker/app/hot_text/ncbi.py`
- `apps/worker/app/hot_text/parser.py`
- `apps/worker/app/hot_text/runtime.py`
- `apps/worker/app/actors/hot_text.py`
- `apps/worker/app/hot_text_worker.py`

The worker uses the existing worker shell, Redis broker, and `ingest_write`
pool. No new broker or API-side orchestration layer is introduced.

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
- no automatic hot-cohort admission policy in this slice

## Follow-on work

1. Drive this actor from the selected-corpus / hot-cohort wave once `05e`
   promotion policy is active.
2. Feed the resulting canonical document spine into `05a` chunking for the hot
   evidence lane.
3. Revisit annotation overlays only if the PMC/PubTator full-text surfaces
   become stable enough to justify a second targeted hot enrichment slice.
