# Semantic Scholar API Reference

Comprehensive reference for the Semantic Scholar Academic Graph API, Datasets API, and Model Inference API. All endpoints under `https://api.semanticscholar.org` unless noted.

## Authentication

- Header: `x-api-key` (case-sensitive, lowercase)
- Rate limit: 1 request per second, cumulative across ALL endpoints
- On 429: exponential backoff required (no Retry-After header — implement your own: 1s, 2s, 4s, 8s...)
- On 5xx: retry with exponential backoff
- Keys inactive ~60 days are auto-pruned
- Max response size: 10 MB

## Paper ID Formats

The API accepts these prefixed identifiers in any paper endpoint:

| Format | Example | Notes |
|--------|---------|-------|
| S2 Paper ID (SHA) | `649def34f8be52c8b66281af98ae884c09aef38b` | No prefix needed |
| Corpus ID | `CorpusId:215416146` | Integer, used in datasets |
| DOI | `DOI:10.18653/v1/N18-3011` | Must include DOI: prefix |
| PMID | `PMID:19872477` | Must include PMID: prefix |
| PMCID | `PMCID:2323736` | Must include PMCID: prefix |
| ArXiv | `ARXIV:2106.15928` | Must include ARXIV: prefix |
| MAG | `MAG:112218234` | Microsoft Academic Graph |
| ACL | `ACL:W12-3903` | ACL Anthology |
| URL | `URL:https://arxiv.org/abs/...` | From S2, arxiv, acm, biorxiv |

These work in ALL paper endpoints including batch.

---

## Graph API

Base path: `/graph/v1`

### Paper Fields (requestable via `fields` param)

| Field | Type | Notes |
|-------|------|-------|
| paperId | string | S2 hash ID |
| corpusId | integer | Numeric corpus identifier |
| externalIds | object | {DOI, PMID, PMCID, ArXiv, MAG, ACL, CorpusId} |
| url | string | S2 URL |
| title | string | |
| abstract | string | May be null |
| venue | string | |
| publicationVenue | object | {id, name, type, alternate_names, url} |
| year | integer | |
| referenceCount | integer | |
| citationCount | integer | |
| influentialCitationCount | integer | |
| isOpenAccess | boolean | |
| openAccessPdf | object | {url, status, license, disclaimer} or null |
| fieldsOfStudy | string[] | Externally sourced |
| s2FieldsOfStudy | object[] | {category, source} |
| publicationTypes | string[] | Review, JournalArticle, ClinicalTrial, etc. (13 types) |
| publicationDate | string | YYYY-MM-DD |
| journal | object | {name, volume, pages} |
| citationStyles | object | {bibtex} |
| authors | Author[] | |
| citations | BasePaper[] | Papers citing this one |
| references | BasePaper[] | Papers cited by this one |
| embedding | object | {model, vector} — 768 floats |
| embedding.specter_v2 | object | SPECTER2 proximity embedding |
| tldr | object | {model, text} — AI summary |
| textAvailability | string | "fulltext", "abstract", or "none" |

### Endpoints

#### GET /graph/v1/paper/{paper_id}
Single paper lookup. Default fields: paperId, title.

#### POST /graph/v1/paper/batch
Batch paper lookup. Max 500 IDs. Full field parity with single endpoint.

Request:
```json
{
  "ids": ["PMID:19872477", "DOI:10.1038/s41586-021-03819-2"]
}
```
Query: `?fields=title,abstract,embedding.specter_v2,tldr`

Response: JSON array in same order as input. Returns null for unknown IDs.

#### GET /graph/v1/paper/search
Relevance-ranked search. Max 1,000 results.
Params: query, fields, offset, limit (max 100), publicationTypes, openAccessPdf, minCitationCount, publicationDateOrYear, year, venue, fieldsOfStudy

#### GET /graph/v1/paper/search/bulk
High-volume search with boolean operators (+AND, |OR, -NOT, "phrase", *prefix, ~N fuzzy).
Max 10,000,000 results via token-based pagination. 1,000 per page.
Params: query, token (from previous response), fields, sort (field:asc|desc)

#### GET /graph/v1/paper/{paper_id}/citations
Papers that cite this paper. Includes contexts, intents, isInfluential.
Params: fields, offset, limit (max 1000)

Response data items:
```json
{
  "contexts": ["...text where citation appears..."],
  "intents": ["methodology", "background", "result"],
  "isInfluential": true,
  "citingPaper": {"paperId": "...", "title": "..."}
}
```

#### GET /graph/v1/paper/{paper_id}/references
Papers cited by this paper. Same structure but with citedPaper.

#### GET /graph/v1/paper/{paper_id}/authors
Paper authors. Params: fields, offset, limit (max 1000)

#### GET /graph/v1/paper/search/match
Single best title match. Returns 404 if no match. Response includes matchScore.

#### GET /graph/v1/paper/autocomplete?query=partial+text
Autocomplete suggestions. Query truncated to 100 chars.

#### GET /graph/v1/snippet/search
Full-text search across abstracts and body text. Returns snippets with section info.

#### GET /graph/v1/author/{author_id}
Author detail. Fields: authorId, externalIds, url, name, affiliations, homepage, paperCount, citationCount, hIndex, papers

#### POST /graph/v1/author/batch
Batch author lookup. Max 1,000 IDs.

#### GET /graph/v1/author/search?query=name
Author search. Params: fields, offset, limit (max 1000)

#### GET /graph/v1/author/{author_id}/papers
Author papers. Params: fields, offset, limit (max 1000)

---

## Datasets API

Base path: `/datasets/v1`

#### GET /datasets/v1/release/
List all release dates. No auth required.

#### GET /datasets/v1/release/{release_id}
Release metadata. Use "latest" as release_id.

#### GET /datasets/v1/release/{release_id}/dataset/{dataset_name}
Get pre-signed S3 download URLs. Requires auth.

Response:
```json
{
  "name": "papers",
  "files": ["https://ai2-s2ag.s3.amazonaws.com/...", "..."]
}
```

Files are pre-signed S3 URLs (temporary). Downloads go to S3, NOT the S2 API — no rate limit on downloads.

#### GET /datasets/v1/diffs/{start_release}/to/{end_release}/{dataset_name}
Incremental diffs between releases. end_release can be "latest".

Response:
```json
{
  "diffs": [
    {
      "from_release": "2023-10-31",
      "to_release": "2023-11-07",
      "update_files": ["https://..."],
      "delete_files": ["https://..."]
    }
  ]
}
```

Apply diffs sequentially. update_files = insert/upsert, delete_files = remove.

### Available Datasets

| Name | Records | Shard Size |
|------|---------|-----------|
| papers | ~200M | 30 x 1.5 GB |
| abstracts | ~100M | 30 x 1.8 GB |
| citations | ~2.4B | 30 x 8.5 GB |
| embeddings-specter_v2 | ~120M | 30 x 28 GB |
| tldrs | ~58M | 30 x 200 MB |
| paper-ids | ~450M | 30 x 500 MB |
| authors | ~75M | 30 x 100 MB |
| s2orc | ~10M | 30 x 4 GB |
| s2orc_v2 | ~16M | 30 x 6 GB |
| publication-venues | ~195K | Small |

---

## Embeddings

Two ways to get SPECTER2 embeddings:

### Via Graph API (pre-computed, recommended for <500K papers)
Request `embedding.specter_v2` as a field. Works in single and batch endpoints. Returns 768-dim float vector.

### Via Model Inference API (compute your own text)
```
POST https://model-apis.semanticscholar.org/specter/v1/invoke
```
Request: JSON array of {paper_id, title, abstract}. Max 16 papers per batch.
Use for papers NOT in the S2 corpus.

---

## S2ORC (Full Text)

- NOT available via the per-paper Graph API
- Only via bulk dataset download (dataset name: s2orc or s2orc_v2)
- Use `textAvailability` field to check if a paper has full text ("fulltext", "abstract", "none")
- s2orc_v2: 16M papers with parsed body text, sections, bibliography
- License: ODC-By 1.0

---

## Response Size Constraints

| Constraint | Value |
|------------|-------|
| Max response size | 10 MB |
| Max paper batch | 500 IDs |
| Max author batch | 1,000 IDs |
| Max relevance search results | 1,000 |
| Max bulk search results | 10,000,000 |
| Max bulk search per call | 1,000 |
| Max citations in nested fields | 9,999 |

---

## Best Practices (from S2)

1. Always include API key — even on public endpoints
2. Use batch/bulk endpoints for volume, not loops of single calls
3. Request only fields you need — reduces response size and latency
4. Implement exponential backoff — mandatory since March 2024
5. Download datasets for corpus-scale data — don't crawl via API
6. Use incremental diffs to stay current
7. Secure your API key in environment variables

---

Sources:
- [Graph API Docs](https://api.semanticscholar.org/api-docs/graph)
- [Datasets API Docs](https://api.semanticscholar.org/api-docs/datasets)
- [API Product Page](https://www.semanticscholar.org/product/api)
- [API Release Notes](https://github.com/allenai/s2-folks/blob/main/API_RELEASE_NOTES.md)
- [S2 FAQ](https://github.com/allenai/s2-folks/blob/main/FAQ.md)
