# SoleMD.Graph -- Wiki

> **Scope**: Obsidian vault → PostgreSQL → Next.js wiki panel.
> Living knowledge pages authored in Obsidian, synced to the database,
> rendered in the graph UI with interactive wikilinks, PMID citations,
> and graph overlay integration.
>
> **Companion docs**:
> - [architecture.md](./architecture.md) -- system boundaries and adapters
> - [database.md](./database.md) -- `solemd.wiki_pages` schema
> - [graph-runtime.md](./graph-runtime.md) -- DuckDB-WASM and Cosmograph
> - [rag.md](./rag.md) -- RAG evidence pipeline (shares overlay contract)
> - [wiki-generation.md](./wiki-generation.md) -- canonical authoring and generation contract

---

## System Diagram

```
   OBSIDIAN VAULT              ENGINE                      BROWSER
   ──────────────              ──────                      ───────

   /SoleMD.Wiki/             sync_wiki_pages.py           WikiPanel
     entities/*.md               │                           │
       ┌─ frontmatter            ▼                     FloatingPanelShell
       │    title              PostgreSQL                    │
       │    entity_type          solemd.wiki_pages      ┌────┴────────────────┐
       │    concept_id           │                      │ WikiMarkdownRenderer │
       │    tags                 ├─ link resolution     │   remark-wikilinks   │
       │                        ├─ PMID extraction      │   remark-pmid-cites  │
       ├─ markdown body         ├─ FTS ts_vector        │   remark-callouts    │
       │    wikilinks [[…]]     │                       │   remark-gfm         │
       │    PMIDs [[pmid:…]]    ▼                       │   rehype-slug        │
       │    callouts > [!…]   FastAPI                    └────┬────────────────┘
       │    GFM tables          GET /api/v1/wiki/pages/{slug} │
       └─ checksum (SHA-256)    GET /api/v1/wiki/page-context/{slug}
                                POST /api/v1/wiki/search   Component dispatch
                                GET /api/v1/wiki/backlinks/{slug}
                                                          wiki: → WikiLink
                                                          pmid: → PaperCitation
                                                          callout → Callout
                                       │
                                       ▼                 WikiSearch (FTS)
                                Next.js route handlers    WikiNavigation (←→)
                                  /api/wiki/pages/*       WikiBacklinks
                                  /api/wiki/search           │
                                  /api/wiki/backlinks/*      ▼
                                  /api/wiki/graph
                                                      use-wiki-graph-sync
                                                         │
                                                         ├─ resolveWikiOverlay
                                                         ├─ commitWikiOverlay
                                                         ├─ cacheWikiNodeIndices
                                                         │
                                                         ▼
                                                      DuckDB overlay
                                                         │
                                                         ▼
                                                      Cosmograph canvas
                                                      (highlight + camera)
```

---

## Content Model

### Frontmatter Schema

Every wiki page is an Obsidian markdown file with YAML frontmatter:

```yaml
---
title: Melatonin                  # display title
entity_type: Chemical             # MeSH semantic type (optional)
concept_id: MESH:D008550          # canonical identifier (optional)
family_key: neurohormones         # graph family grouping (optional)
section: sections/core-biology    # editorial placement (optional but preferred)
page_kind: entity                 # runtime kind (usually derived)
graph_focus: cited_papers         # primary graph action mode (usually derived)
tags:                             # freeform tags
  - sleep
  - circadian
---
```

### Slug Derivation

Slugs are the file path relative to the vault root, minus `.md`:
- `entities/melatonin.md` → `entities/melatonin`
- `entities/circadian-rhythm.md` → `entities/circadian-rhythm`

### Inline Markup

| Syntax | Meaning | Rendering |
|--------|---------|-----------|
| `[[target]]` | Wikilink to another page | Clickable WikiLink button |
| `[[pmid:28847293]]` | PubMed citation | Superscript badge (PaperCitation) |
| `> [!note]` | Obsidian callout | Styled callout block |
| GFM tables | Pipe tables | Panel-styled table |

### Link Resolution

Wikilinks are resolved **into canonical outgoing slugs at sync time**:
1. `sync_wiki_pages.py` builds an inventory of all slugs in the vault
2. Bare targets like `[[serotonin]]` are resolved to canonical slugs
   (`entities/serotonin`) by scanning the inventory
3. Canonical resolved slugs are stored in `wiki_pages.outgoing_links`
4. The page endpoint reconstructs a raw-target → canonical-slug map at read time
   so the frontend remark pipeline does no client-side inventory resolution

Unresolved wikilinks render as plain text (no broken links).

---

## Sync Pipeline

**Script**: `engine/db/scripts/sync_wiki_pages.py`

```
  Vault scan (recursive *.md)
       │
       ▼
  Parse frontmatter + extract body
       │
       ├─ extract_raw_wikilinks()    → outgoing_links[]
       ├─ extract_pmids()            → paper_pmids[]
       └─ resolve_outgoing_links()   → resolved_links{}
       │
       ▼
  SHA-256 checksum per file
       │
       ▼
  Reconcile against solemd.wiki_pages
       │
       ├─ UPSERT changed/new pages
       ├─ DELETE removed pages
       └─ SKIP unchanged (checksum match)
       │
       ▼
  Summary: added / updated / deleted / unchanged
```

**Operator command:**
```bash
cd engine && uv run python db/scripts/sync_wiki_pages.py \
  --wiki-dir /mnt/c/Users/Jon/SoleMD.Wiki
```

---

## Database Schema

**Table**: `solemd.wiki_pages`

| Column | Type | Purpose |
|--------|------|---------|
| slug | text PK | Vault-relative path minus .md |
| title | text | From frontmatter |
| content_md | text | Raw markdown body |
| frontmatter | jsonb | Normalized authored metadata |
| entity_type | text | MeSH semantic type |
| concept_id | text | Canonical identifier |
| family_key | text | Graph family grouping |
| tags | text[] | Freeform tags |
| outgoing_links | text[] | Canonical resolved page slugs referenced by the markdown |
| paper_pmids | integer[] | Extracted PMIDs |
| checksum | text | SHA-256 for change detection |
| fts_vector | tsvector | Full-text search (generated) |
| synced_at | timestamptz | Last successful sync |
| created_at | timestamptz | First sync |
| updated_at | timestamptz | Last sync |

Derived runtime fields returned by the page API:

- `page_kind` — `index`, `section`, `entity`, or `topic`
- `section_slug` — canonical `sections/<slug>` placement when available
- `graph_focus` — `cited_papers`, `entity_exact`, or `none`
- `resolved_links` — raw wikilink target → canonical slug map built from `content_md` + `outgoing_links`

**Migration**: `engine/db/migrations/051_wiki_pages.sql`

---

## Frontend Rendering

### Component Hierarchy

```
WikiPanel
├── FloatingPanelShell (drag/dock/resize)
│     └── PanelChrome (title bar, escape, headerActions)
│
├── WikiSearch (headerActions slot)
│     └── debounced FTS via shared wiki client → `/api/wiki/search`
│
├── WikiNavigation (back/forward arrows)
│
├── WikiMarkdownRenderer (memoized, adapter-based)
│     └── ReactMarkdown
│           ├── remark-gfm
│           ├── remark-wikilinks     → wiki: scheme links
│           ├── remark-pmid-citations → pmid: scheme links
│           ├── remark-callouts      → data-callout-* blockquotes
│           └── rehype-slug          → heading anchors
│
├── WikiBacklinks (below content, hidden when empty)
│
├── wiki-client.ts (shared browser request boundary)
│     ├── fetchWikiPageClient → `/api/wiki/pages/[...slug]`
│     ├── fetchWikiBacklinksClient → `/api/wiki/backlinks/[...slug]`
│     ├── searchWikiPagesClient → `/api/wiki/search`
│     └── fetchWikiGraphClient → `/api/wiki/graph`
│
└── use-wiki-graph-sync (overlay lifecycle)
      └── generation-guarded, mutation-queued
```

### Component Dispatch

`markdown-pipeline.tsx` maps link schemes to React components:

| href prefix | Component | Behavior |
|-------------|-----------|----------|
| `wiki:slug` | WikiLink | Navigates within panel |
| `pmid:NNN` | PaperCitation | Graph overlay focus |
| (callout) | Callout | Styled info/warning/danger block |
| (other) | `<a>` | External link, new tab |

### Shell vs context serving

Wiki page rendering is intentionally split into two latency classes:

- `GET /api/v1/wiki/pages/{slug}` returns the page shell quickly enough for navigation and markdown render
- `GET /api/v1/wiki/page-context/{slug}` returns slower backend-enriched entity context in the background

The wiki panel must render the page shell first. Entity-wide counts and top papers are additive context, not a prerequisite for opening the page.

### Graph Overlay Integration

Wiki pages do not mutate the graph on load. `use-wiki-graph-sync` is the
explicit wiki page graph-action adapter:

```
  User clicks Show on graph
       │
       ▼
  resolveWikiOverlay (ensure graph refs available in DuckDB)
       │
       ▼
  commitWikiOverlay (promote missing papers to overlay)
       │
       ▼
  cacheWikiNodeIndices (map refs → node indices for selection + camera)
       │
       ├─ commitSelectionState (selected_point_indices baseline)
       ├─ selectPointsByIndices (native Cosmograph visual selection)
       └─ fitViewByIndices (camera framing)

  PMID citation click
       └─ cache hit → fitViewByIndices
          cache miss → live query fallback
```

This keeps the page runtime explicit and adapter-based:

- page load renders backend context only
- page actions drive graph activation explicitly
- markdown stays portable and free of graph implementation details

### CSS Architecture

`app/styles/wiki-content.css` scopes all typography to `.wiki-content`:
- Uses `--graph-panel-*` tokens for seamless dark/light mode
- H2 sections get a top border for visual separation
- PMID badges use `--mode-accent-subtle` background pills
- Tables, callouts, and code inherit panel styling

Imported via `app/globals.css` alongside other style partials.

---

## Operator Guide

### Adding a New Wiki Page

1. Create `entities/<slug>.md` in the Obsidian vault
2. Add frontmatter (title, entity_type, tags — see schema above)
3. Write content using wikilinks, PMIDs, callouts, GFM tables
4. Run sync: `cd engine && uv run python db/scripts/sync_wiki_pages.py --wiki-dir /mnt/c/Users/Jon/SoleMD.Wiki`
5. Verify in browser: open wiki panel, search for new page

### Wikilink Best Practices

- Use bare names: `[[serotonin]]` — the sync script resolves to full slug
- For disambiguation: `[[entities/serotonin]]` — explicit path
- Unresolved links render as plain text (create the target page to activate)
- Cross-link pages so backlinks populate naturally

### PMID Citations

- Format: `[[pmid:28847293]]` — integer PMID only
- At sync time, PMIDs are extracted and stored in `paper_pmids`
- At render time, the API resolves PMIDs to `graph_paper_refs` using the
  active graph release, enabling overlay highlighting and camera focus
- PMIDs not in the graph render as external PubMed links
