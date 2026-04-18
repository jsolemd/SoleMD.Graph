# 05d — Wiki Runtime

> **Status**: locked for the serve-side home of the wiki runtime, the
> `solemd.wiki_sync_runs` + `solemd.wiki_pages` schema posture, the Dramatiq
> sync/activation boundary, the "fast shell / slower context" API split, the
> derived-not-duplicated page contract, and the explicit graph-action adapter
> boundary. **Provisional**: exact fuzzy-title index selection, any later
> materialization of runtime-derived fields, and any optional projection table
> added purely to reduce context-query latency after a sample build.
> **Deferred**: multi-user wiki authoring, auth-gated editing workflows,
> off-box wiki storage, and any generator that writes directly into request-path
> tables without going through the canonical sync/runtime contract.
>
> **Date**: 2026-04-17
>
> **Scope**: the wiki lane from authored markdown to serve PostgreSQL to FastAPI
> to Next.js wiki surfaces, including graph-aware page actions. This is the
> rebuild companion to `docs/map/wiki.md` and `docs/map/wiki-generation.md`:
> those docs remain the human-facing runtime/generation map, while this document
> fixes where the wiki lives in the new cutover, how it is stored, and how it
> integrates with the serve-side runtime.
>
> **Authority**: this document is authority for the wiki lane in the rebuild.
> Existing wiki code is reusable inventory, not authority. If legacy table shape
> or route behavior disagrees with this document, the runtime is rewritten.

## Purpose

The wiki is not a side feature. It is a first-class reader-facing surface that
joins authored knowledge, graph evidence, and page-level graph activation. The
rebuild therefore needs the same explicit posture for wiki that it already has
for retrieval and graph bundles.

The minimum durable story is:

1. authored markdown remains the editorial source
2. the request-path page shell lives in serve as an activated projection, not
   as the editorial source
3. dynamic page context is derived from serve projections plus graph-release
   resolution
4. sync/activation is background work owned by Dramatiq, not a request-path or
   FastAPI-background-task concern
5. page load does not mutate the graph; page actions do

## §0 Through-line decisions

These decisions are no longer open:

1. **Database home.** The request-path wiki shell belongs on the serve cluster.
   `solemd.wiki_pages` is a serve-side runtime table, not a warehouse table.
2. **Source-of-truth split.** Authored page shell lives in upstream markdown.
   `solemd.wiki_pages` is the active serve projection and
   `solemd.wiki_sync_runs` is the activation ledger. Dynamic evidence context is
   derived at read time from serve projections and current graph-release
   resolution, not denormalized back into the authored table.
3. **Queue boundary.** Non-trivial wiki sync/activation runs through Dramatiq.
   FastAPI `BackgroundTasks`, route-bound `create_task`, and request-path
   writes to wiki runtime tables are not the cutover plane.
4. **Markdown-first storage.** The database stores markdown + frontmatter +
   canonical identity/evidence columns. It does not store rendered HTML, direct
   app URLs, graph point indices, or UI instructions.
5. **Derived runtime contract.** `page_kind`, `section_slug`, `graph_focus`,
   `summary`, and `featured_pmids` are resolved from slug/frontmatter/content
   rules unless a later measured need justifies materialization.
6. **Fast shell, slower context.** Page shell reads and search/backlinks must be
   serve-local and fast. Rich entity context may run as a slower background
   request without blocking shell render.
7. **Graph activation stays explicit.** Opening a wiki page never mutates the
   graph. Graph activation routes through shared graph adapters from explicit
   page actions.

## §1 Database home and lifecycle

The wiki lane in the rebuild is:

```text
authored markdown
    -> Dramatiq wiki sync/activate actor
    -> serve.solemd.wiki_sync_runs
    -> staged wiki_pages payload
    -> active serve.solemd.wiki_pages
    -> FastAPI wiki routes
    -> Next.js route handlers / browser client
    -> Wiki panel + explicit graph-action adapters
```

The reasons the shell belongs on serve are practical:

- the wiki page shell is a request-path read surface
- the page shell must remain available even when the warehouse is cold or under
  maintenance pressure
- search, backlinks, and page lookup are serve-local concerns, not warehouse
  analytics jobs

The warehouse still matters to wiki, but only indirectly:

- it remains the long-lived source of graph and evidence facts
- serve projections and bounded FDW dereference may pull from it when enriching
  a page context response
- it is not the home of the authored request-path wiki shell

The critical architectural shift away from the current implementation is this:
the runtime is not "a local wiki folder plus a script." The authoring substrate
may remain Obsidian/markdown, but the request path only ever sees an activated
serve projection with a sync ledger and an all-or-nothing publication step.

## §2 Serve schema posture

The wiki lane has two serve-side tables:

- `solemd.wiki_sync_runs` is the lineage/audit ledger for one normalized sync
  and activation cycle.
- `solemd.wiki_pages` is the active request-path projection tagged with the
  `wiki_sync_run_id` that produced it.

`solemd.wiki_pages` remains the runtime table the frontend reads.

Locked columns:

| Column | Type | Purpose |
|---|---|---|
| `wiki_sync_run_id` | `UUID NOT NULL` | Lineage to the activated sync run |
| `slug` | `TEXT` PK | Canonical page slug, e.g. `entities/melatonin` |
| `title` | `TEXT NOT NULL` | Reader-facing title |
| `content_md` | `TEXT NOT NULL` | Raw markdown body |
| `frontmatter` | `JSONB NOT NULL` | Normalized authored metadata |
| `entity_type` | `TEXT` | Canonical entity type when present |
| `concept_id` | `TEXT` | Canonical source identifier when present |
| `family_key` | `TEXT` | Editorial/family grouping |
| `semantic_group` | `TEXT` | Canonical semantic-group/taxonomy surface for wiki graph and theming |
| `tags` | `TEXT[] NOT NULL` | Search/navigation labels |
| `outgoing_links` | `TEXT[] NOT NULL` | Canonical resolved wiki links |
| `paper_pmids` | `INTEGER[] NOT NULL` | Evidence PMIDs cited in the page shell |
| `checksum` | `TEXT NOT NULL` | Content hash for sync reconciliation |
| `fts_vector` | `TSVECTOR` generated | Full-text search |
| `synced_at` | `TIMESTAMPTZ NOT NULL` | Last successful sync |
| `created_at` | `TIMESTAMPTZ NOT NULL` | First appearance |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | Last content update |

Design rule: the active page shell, canonical identity, and page-level evidence
live in this table; runtime-enriched context does not.

## §3 What is stored vs derived

This split is deliberate and locked.

Stored:

- raw markdown shell
- normalized frontmatter
- canonical page identity
- canonical resolved wikilinks
- page-level cited PMIDs
- search/taxonomy support columns

Derived at read time:

- `page_kind`
- `section_slug`
- `graph_focus`
- `summary`
- `featured_pmids`
- `paper_graph_refs`
- `featured_graph_refs`

Why derive these instead of storing them as parallel truth:

- they already follow deterministic rules from slug/frontmatter/citations
- storing them separately creates a second drift surface
- the same concern already exists elsewhere in the rebuild: the project is
  explicitly deleting duplicated "current" mirrors in graph and serving paths

If a later measured need justifies materializing one of these fields, that would
be an additive amendment to `03` + `05d` + `12`, not an ad hoc shortcut.

## §4 Index and query posture

The wiki lane has two latency classes and the indexes should follow them.

Locked index posture:

- PK on `slug`
- GIN on `fts_vector`
- GIN on `outgoing_links`
- btree on `(entity_type, concept_id)`
- btree on `family_key`
- GIN on `tags`

Provisional:

- a trigram title index for fuzzy title search remains allowed, but only if the
  real wiki query shape keeps proving that it pays for itself

The rule is the same as the rest of the series: index for actual predicates,
not for aesthetic symmetry.

## §5 Sync and activation contract

The sync/activation actor is the ingestion boundary for authored wiki content.

Locked rules:

1. The canonical background entrypoint is a dedicated Dramatiq actor on a wiki
   queue. Local developer CLI helpers may call the same sync library directly,
   but they do not define the production contract.
2. The actor scans the canonical wiki source path, normalizes frontmatter,
   resolves outgoing links, extracts PMIDs, and computes per-page plus aggregate
   source checksums.
3. The actor records one `wiki_sync_runs` row, stages the normalized page set,
   validates link/search payloads, and activates the new set into
   `solemd.wiki_pages` in one all-or-nothing publication step.
4. Request-path routes do not write back to `solemd.wiki_pages`.
5. Partial sync state never becomes visible to readers.

Operational implication: the wiki shell is updated by an explicit background
activation step, not by page-open side effects and not by a request-path
mutation.

## §6 API contract

The wiki API is intentionally split by latency class.

Fast shell surface:

- `GET /api/v1/wiki/pages/{slug}`
- `POST /api/v1/wiki/search`
- `GET /api/v1/wiki/backlinks/{slug}`
- `GET /api/v1/wiki/graph`

Slower context surface:

- `GET /api/v1/wiki/page-context/{slug}`

Locked behavior:

1. The page shell must be fast enough for panel navigation and markdown render.
2. The page-context request may load after the shell and enrich the page in the
   background.
3. Search/backlinks/page shell are serve-local reads.
4. Page-context may compose from serve projections, graph-release resolution,
   and bounded FDW only where required.

The page-context lane is where richer entity-wide facts belong:

- total corpus coverage
- total graph coverage
- bounded top graph papers
- graph ref resolution for cited/featured PMIDs

That data does not belong in the authored shell table itself.

## §7 Frontend wiring

The wiki frontend contract stays adapter-based.

Locked browser surfaces:

- shared wiki client boundary for page/search/backlinks/context/graph fetches
- markdown renderer that consumes the stored page shell
- local page bundle hook that merges fast shell + slower context
- explicit wiki graph-sync adapter for graph activation

Forbidden:

- page-local route logic duplicated across prompt/entity/wiki surfaces
- markdown parsing hacks in the browser to rediscover canonical identity that is
  already in the API payload
- page-load graph mutation

Required:

- prompt and entity hover open wiki pages by canonical slug through shared
  adapters
- page-level graph actions use resolved paper refs or canonical entity identity
- graph activation routes through the shared graph query/session controllers

## §8 Graph-action boundary

Wiki and graph integration is explicit, not ambient.

The page contract may expose:

- `graph_focus`
- cited-paper graph refs
- featured-paper graph refs
- canonical entity identity

The runtime action path is:

```text
user action
    -> resolve page graph refs / entity scope
    -> shared graph adapter
    -> overlay membership or selection change
    -> camera / selection update
```

This preserves three important properties:

- page load stays cheap
- markdown stays portable
- graph mutation remains owned by one shared runtime

## §9 Relationship to `03`, `06`, and `12`

This doc is not a substitute for schema and runner docs. It is the wiki-lane
bridge across them.

- `03` remains authority for the serve-side table shape
- `06` remains authority for the worker/broker/pool/DSN placement
- `12` remains authority for how the wiki schema becomes versioned SQL

If the wiki schema or runtime contract changes, these docs must move together.

## §10 What remains provisional

The following stay measurement-owned:

- the exact fuzzy-title index mix
- whether any part of the page-context result should be projected into a
  dedicated serve table for latency reasons
- whether any runtime-derived field should become a stored column

Those are optimization questions. The structural posture is already decided.
