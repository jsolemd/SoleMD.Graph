# Wiki Page Generation Contract

This document defines the canonical shape for SoleMD wiki pages, whether they
are hand-authored or generated from backend retrieval.

The goal is one page contract that keeps three surfaces aligned without direct
coupling:

- wiki pages remain static markdown content
- wiki runtime resolves page evidence into graph-capable refs
- wiki runtime adds backend-enriched entity context (counts + top graph papers) without mutating markdown
- prompt/entity actions open wiki pages through adapters instead of local route logic

## Design Rules

1. Pages are authored as markdown plus frontmatter.
2. Pages declare identity and navigation hints, not graph mutations.
3. Evidence comes from backend papers already present in the corpus.
4. Graph actions operate on canonical page/runtime contracts, never on ad hoc markdown parsing in the browser.
5. Page load must not mutate the graph. Wiki graph activation is explicit through page actions.
6. Canonical entity pages stay at `entities/<slug>`.
7. Browse structure lives in `sections/<slug>` hubs.

## Canonical Frontmatter

Every page may include these fields:

```yaml
---
title: Schizophrenia
entity_type: Disease
concept_id: MESH:D012559
family_key: psychosis
section: sections/disorders
page_kind: entity
graph_focus: cited_papers
tags:
  - schizophrenia
  - psychosis
  - antipsychotics
---
```

### Field Semantics

| Field | Purpose | Notes |
|---|---|---|
| `title` | Display title | Required for authored pages; falls back from slug if omitted |
| `entity_type` | Canonical entity type | Use for entity pages when available |
| `concept_id` | Canonical identifier | Use MeSH / canonical source ID when available |
| `family_key` | Existing graph-family grouping | Optional |
| `section` | Editorial placement | Canonical value is `sections/<slug>` |
| `page_kind` | Runtime page classification | `index`, `section`, `entity`, or `topic` |
| `graph_focus` | Primary graph action mode | `cited_papers`, `entity_exact`, or `none` |
| `tags` | Freeform reader/search labels | Deduplicated string list |

### Runtime Defaults

If fields are omitted, the runtime derives them deterministically:

- `page_kind`
  - `index` for `index.md`
  - `section` for `sections/*` or `family_key: wiki-sections`
  - `entity` for `entities/*` or pages with `entity_type` / `concept_id`
  - otherwise `topic`
- `section`
  - section hubs default to their own slug
  - all other pages default to `null`
- `graph_focus`
  - `cited_papers` when the page cites any `[[pmid:...]]`
  - `entity_exact` for entity pages with canonical identity but no cited papers
  - otherwise `none`

## Canonical Page Shapes

### 1. Entity Page

Use for diseases, receptors, brain regions, medications, networks, and other
canonical biomedical topics.

Recommended structure:

```md
# <Title>

One short orientation paragraph.

## Clinical Relevance

Why this matters in the project domain.

## Representative Studies In The Current Corpus

- [[pmid:12345678]] One sentence on why the study matters.
- [[pmid:23456789]] One sentence on why the study matters.

## Working Graph Questions

- Question that can be explored with graph + prompt.

## Related Entities

- [[related page]]
- [[another page]]
```

Contract notes:

- A canonical entity page should include `entity_type` and `concept_id` whenever known.
- It should include `section` for editorial placement.
- Its primary graph action should usually be `graph_focus: cited_papers` so the page shows the supporting studies that grounded it.
- Exact entity-wide graph expansion is a separate adapter action and should not be inferred from the markdown body.

### 2. Section Hub

Use for browseable structural pages such as Disorders, Psychotropics, Brain Networks.

Recommended structure:

```md
# <Section Title>

One short paragraph describing the domain.

## Pages In This Section

- [[page-a]] — one-line description
- [[page-b]] — one-line description

## Suggested Navigation

- Start with [[page-a]] if ...
```

Contract notes:

- Use `family_key: wiki-sections`.
- Use `page_kind: section` only when the slug alone is not enough.
- `graph_focus` usually remains `none`.

### 3. Index / Root Page

Use for `index.md` only.

Contract notes:

- It provides top-level orientation and section-hub links.
- It is structural, not evidence-bearing.
- `graph_focus` should remain `none`.

## Evidence Contract

Pages are grounded by backend studies already present in the corpus.

- Every evidence-bearing page should cite representative studies with `[[pmid:...]]`.
- Those PMIDs are the canonical page-level graph evidence surface.
- The wiki runtime resolves cited PMIDs to `paper_graph_refs` for the active graph release.
- `featured_pmids` provide the curated page-level evidence set when present; runtime resolves them to `featured_graph_refs`.
- Page-level `Show on graph` actions should operate on the resolved featured-paper set first, then fall back to the broader cited-paper set.

This is deliberate:

- page content stays explainable and inspectable
- graph projection comes from explicit evidence already written into the page
- page-level graph actions do not require reparsing entity catalogs or inventing frontend heuristics
- richer PubTator/S2-like paper context comes from backend runtime queries, not markdown inflation

## Runtime Context Contract

The markdown page is the editorial shell. The backend may enrich the page response with dynamic context that is derived from canonical page identity, not from frontend parsing hacks.

For entity pages, the runtime may attach:

- `summary` — short normalized orientation text from frontmatter
- `featured_pmids` / `featured_graph_refs` — curated page evidence set for explicit graph activation
- `context.total_corpus_paper_count` — broad corpus coverage for the entity
- `context.total_graph_paper_count` — count already represented in the active graph release
- `context.top_graph_papers` — bounded high-signal papers already present in the graph

This is the canonical split:

- markdown stores editorial framing and representative evidence
- the backend stores canonical page identity and resolves graph refs
- the backend computes rich paper context from PubTator / corpus / graph tables
- the frontend renders page actions and stats through adapters instead of page-local heuristics

## Adapter Contract Across Surfaces

### Wiki

- Markdown declares page content, citations, and links.
- The engine sync lifts canonical identity and evidence into `solemd.wiki_pages`.
- The wiki runtime resolves cited papers into graph refs.

### Prompt / Entity Hover

- Prompt and entity-hover actions open canonical wiki pages by slug.
- They do not embed wiki route strings locally.
- Entity-to-page resolution stays behind the shared entity wiki route adapter.

### Graph / Cosmograph

- Wiki pages do not call Cosmograph directly.
- Graph projection stays behind the wiki graph-sync adapter and graph query/session adapters.
- Page-level graph actions use the page contract (`graph_focus`, cited PMIDs, canonical entity identity) and then route through shared graph-selection / overlay controllers.

## Generation Guidance For Future RAG Wiki Pipelines

When a generator creates or updates a page, it should:

1. Resolve the canonical page slug.
2. Resolve canonical entity identity when applicable.
3. Choose one editorial section.
4. Select a bounded set of representative backend studies.
5. Write the page into the canonical sectioned markdown structure.
6. Emit `[[pmid:...]]` citations for every evidence-bearing claim cluster.
7. Emit `[[wikilink]]` references only to canonical existing pages or planned canonical slugs.

The generator should not:

- write graph point IDs into markdown
- write direct app URLs into markdown
- write UI-specific instructions into markdown
- couple page content to a specific panel implementation

## Current Runtime Mapping

- Source markdown: `wiki/**/*.md`
- Sync: `engine/db/scripts/sync_wiki_pages.py`
- Runtime contract derivation: `engine/app/wiki/content_contract.py`
- API payload: `engine/app/wiki/schemas.py`
- Frontend wire types: `lib/engine/wiki-types.ts`

This is the canonical generation contract moving forward.
