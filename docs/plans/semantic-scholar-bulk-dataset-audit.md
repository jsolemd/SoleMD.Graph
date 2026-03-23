# Semantic Scholar Bulk Dataset Audit

Status: Initial audit complete for the downloaded 2026-03-10 Semantic Scholar release  
Scope: `papers`, `abstracts`, `tldrs`, `citations`, `authors`, `paper-ids`, `s2orc_v2`  
Pending: PubTator BioCXML audit after download completes

## Why This Matters

We need to decide which local bulk datasets populate which canonical PostgreSQL tables so the project stops relying on the API for metadata that is already available on disk.

This audit is based on the actual downloaded files in:

- [semantic-scholar/releases/2026-03-10](/home/workbench/SoleMD/SoleMD.Graph/data/semantic-scholar/releases/2026-03-10)

## Release Snapshot

- release id: `2026-03-10`
- `papers`: 60 shards
- `abstracts`: 30 shards
- `tldrs`: 30 shards
- `citations`: 358 shards
- `authors`: 30 shards
- `paper-ids`: 30 shards
- `s2orc_v2`: 214 shards

Manifests were generated for these datasets under:

- [manifests](/home/workbench/SoleMD/SoleMD.Graph/data/semantic-scholar/releases/2026-03-10/manifests)

## Dataset-by-Dataset Findings

## 1. `papers`

Sample keys observed:

- `corpusid`
- `externalids`
- `title`
- `venue`
- `year`
- `referencecount`
- `citationcount`
- `influentialcitationcount`
- `isopenaccess`
- `publicationtypes`
- `publicationdate`
- `journal`
- `publicationvenueid`
- `s2fieldsofstudy`
- `authors`
- `url`

Implications:

- this should remain the canonical bulk source for one-row-per-paper metadata
- it includes lightweight author snapshots (`authorId`, `name`) that may be useful for bootstrap joins
- it already aligns well with `solemd.corpus` and the base columns of `solemd.papers`

Primary target tables:

- `solemd.corpus`
- `solemd.papers`

## 2. `abstracts`

Sample keys observed:

- `corpusid`
- `abstract`
- `openaccessinfo`

Implications:

- this should become the canonical source for `solemd.papers.abstract`
- it also includes `openaccessinfo`, which overlaps with current API-side `openAccessPdf`/text-access handling
- we should compare `openaccessinfo` semantics against current `paper_assets` handling before deciding whether to treat it as primary or complementary

Primary target tables:

- `solemd.papers`
- possibly `solemd.paper_assets` after normalization review

## 3. `tldrs`

Sample keys observed:

- `corpusid`
- `model`
- `text`

Implications:

- this should become the canonical source for `solemd.papers.tldr`
- model provenance is available directly in the row and should be retained

Primary target tables:

- `solemd.papers`

## 4. `citations`

Sample keys observed:

- `citationid`
- `citingcorpusid`
- `citedcorpusid`
- `contexts`
- `intents`
- `isinfluential`

Implications:

- this is stronger than the current batch API reference path
- it includes `intents` and `isinfluential`, which the batch API did not provide in live testing
- observed nuance: `intents` is nested (`list[list[str] | null]`), aligned to the
  citation contexts rather than a flat label list
- this should become the canonical graph-edge source

Primary target tables:

- `solemd.citations`

Current implementation direction:

- bulk `citations` now targets `solemd.citations` directly
- the loader should filter domain-domain edges in DuckDB and stage them into
  PostgreSQL via `COPY`
- `solemd.paper_references` remains the richer bibliography table for now

Important note:

- this confirms that the bulk `citations` dataset should be the primary edge ingest for graph links and geo citation flows
- the API reference sync can be retained for per-paper detail enrichment or reconciliation, but not as the primary edge backbone

## 5. `authors`

Sample keys observed:

- `authorid`
- `name`
- `aliases`
- `affiliations`
- `homepage`
- `externalids`
- `papercount`
- `citationcount`
- `hindex`
- `url`

Implications:

- this should be evaluated as the canonical source for `solemd.authors`
- `affiliations` exists in bulk, but sparsity/quality still needs a broader audit before replacing current API/OpenAlex/ROR-derived affiliation work
- this dataset may be best used to populate canonical author identity while letting affiliation normalization remain a separate layer
- the bulk `papers.authors` field is only a lightweight snapshot and should not be
  confused with the dedicated `authors` bulk dataset

Primary target tables:

- `solemd.authors`
- possibly `solemd.author_affiliations`, depending on quality review

## 6. `paper-ids`

Sample keys observed:

- `corpusid`
- `sha`
- `primary`

Implications:

- this is an identifier/crosswalk dataset, not a general metadata source
- it likely matters for de-duplication, document identity, and joins into `s2orc_v2`
- it should be audited more deeply before schema design, but it clearly belongs in the identifier-resolution path

Primary target tables:

- new ID crosswalk table or extension of existing paper-id normalization logic

## 7. `s2orc_v2`

Sample keys observed:

- `corpusid`
- `title`
- `authors`
- `openaccessinfo`
- `body`
- `bibliography`

Nested structure observed:

- `body`: dictionary with `text` and `annotations`
- `bibliography`: dictionary with `text` and `annotations`

Implications:

- this is not needed to build the first mapped graph
- it is highly relevant for later full-text ingestion, chunking, and document-aware tooling
- it likely becomes the substrate for future `paper_documents`, `paper_chunks`, and citation-context tables

Primary target tables:

- future full-text tables, not the current first-pass graph tables

## Recommended Source-of-Truth Mapping

Current recommended posture:

- `papers` -> canonical one-row paper metadata
- `abstracts` -> `solemd.papers.abstract`
- `tldrs` -> `solemd.papers.tldr`
- `citations` -> canonical `solemd.citations`
- `authors` -> canonical author identity, with affiliation review still needed
- `paper-ids` -> ID crosswalk / identity reconciliation
- `s2orc_v2` -> future full-text/document layer
- Semantic Scholar API -> `embedding.specter_v2` and targeted fallback only

## Field-to-Table Mapping

This is the initial source-of-truth contract for the first production bulk ingest wave.

### `papers`

- `corpusid` -> `solemd.corpus.corpus_id`, `solemd.papers.corpus_id`
- `externalids` -> `solemd.corpus` ID loading + `solemd.papers.paper_external_ids`
- `title` -> `solemd.papers.title`
- `venue` -> `solemd.papers.venue`
- `year` -> `solemd.papers.year`
- `referencecount` -> `solemd.papers.reference_count`
- `citationcount` -> `solemd.papers.citation_count`
- `influentialcitationcount` -> `solemd.papers.influential_citation_count`
- `isopenaccess` -> `solemd.papers.is_open_access`
- `publicationtypes` -> `solemd.papers.publication_types`
- `publicationdate` -> `solemd.papers.publication_date`
- `journal` -> `solemd.papers.journal_*`
- `publicationvenueid` -> `solemd.papers.publication_venue_id`
- `s2fieldsofstudy` -> `solemd.papers.fields_of_study`
- `url` -> `solemd.papers.url`

### `abstracts`

- `abstract` -> `solemd.papers.abstract`
- `openaccessinfo` -> evaluate against `solemd.paper_assets`

### `tldrs`

- `text` -> `solemd.papers.tldr`
- `model` -> keep in provenance metadata or a later dedicated TLDR model column

### `citations`

- `citationid` -> `solemd.citations.citation_id`
- `citingcorpusid` -> `solemd.citations.citing_corpus_id`
- `citedcorpusid` -> `solemd.citations.cited_corpus_id`
- `contexts` -> `solemd.citations.contexts`
- `intents` -> `solemd.citations.intents`
- `isinfluential` -> `solemd.citations.is_influential`

Important current implementation split:

- `solemd.citations` should be populated directly from the bulk `citations` dataset
- `solemd.paper_references` remains the richer bibliography table for now
- later we can decide whether to backfill `paper_references` from bulk joins into `papers` / `paper-ids`
- `contexts` and nested `intents` should be preserved in the edge export/bundle,
  not collapsed away to a bare citation edge if the backend already has them

### `authors`

- `authorid` -> `solemd.authors.author_id`
- `name` -> `solemd.authors.name`
- `externalids` -> `solemd.authors.external_ids`
- `aliases` / `homepage` / `url` / `papercount` / `citationcount` / `hindex` -> evaluate for canonical author profile support
- `affiliations` -> later quality review against current affiliation normalization path

### `paper-ids`

- `corpusid` + `sha` + `primary` -> future ID crosswalk layer
- likely needed for deeper identity resolution and `s2orc_v2` joins

### `s2orc_v2`

- `body.text` / `body.annotations` -> later `paper_documents` / `paper_chunks`
- `bibliography.text` / `bibliography.annotations` -> later citation-aware document layer
- `openaccessinfo` -> future document/asset provenance

## Immediate Follow-Up

1. implement bulk citations ingest first
2. design the ID crosswalk path for `paper-ids`
3. audit `authors.affiliations` quality at scale before replacing current affiliation normalization
4. postpone `s2orc_v2` ingest design until after the first graph build is stabilized
5. complete the matching PubTator release-aware cutover and BioCXML audit once its download finishes

## Pending Work

- audit PubTator annotation files against the canonical entity/relation tables
- audit PubTator BioCXML once the active download finishes
- expand this document with field-level target mappings and table/column decisions
- confirm whether `authors` bulk coverage is strong enough to supersede current API-author snapshots
