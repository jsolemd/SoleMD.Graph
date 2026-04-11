# SoleMD.Graph -- API

> **Scope**: FastAPI request boundary for browser and Next.js callers.
> The API layer is thin by design: request validation, canonical error mapping,
> and service orchestration only. Query shape, indexing, and heavy data work
> belong below it.

---

## Endpoint families

| Family | Prefix | Purpose |
|---|---|---|
| Entities | `/api/v1/entities` | Inline entity match + hover detail |
| Graph | `/api/v1/graph` | Narrow graph point attachment for universe promotion |
| Evidence | `/api/v1/evidence` | RAG/evidence search over PostgreSQL |
| Wiki | `/api/v1/wiki` | Wiki shell pages, context, search, backlinks, graph |

---

## Canonical rules

1. **Routers stay thin.** Route modules in `engine/app/api/` do request validation, call one service method, and translate domain errors through the shared `run_api()` helper in `engine/app/api/http.py`.

2. **Request-path repositories use pooled connections.** Hot API reads should use `db.pooled()` rather than per-request ad hoc connections. The wiki repository now follows the same pattern already used by the entity and graph attachment paths.

3. **One latency class per endpoint.** If a route mixes fast shell data and slow enrichment, split it. The canonical example is wiki:
   - `/api/v1/wiki/pages/{slug}` returns the navigable page shell
   - `/api/v1/wiki/page-context/{slug}` returns slower backend-enriched evidence context

4. **Resolve graph release once per request path.** Services own `graph_release_id` / `graph_run_id` resolution. Downstream queries receive a concrete `graph_run_id`, not repeated release-resolution logic in multiple SQL calls.

5. **Parallelize independent reads.** If an endpoint needs multiple independent read-only queries, run them in parallel over pooled connections instead of serializing them. The wiki entity-context route now resolves counts and top graph papers concurrently.

6. **Indexes follow the real filter shape.** Do not index for schema aesthetics. Index the exact predicate used by hot endpoints. Example: `engine/db/migrations/058_add_pubtator_entity_context_lookup_index.sql` adds `(entity_type, concept_id, pmid)` for wiki/entity PubTator lookups.

7. **Promote projections when live joins stay too expensive.** Repeated wide joins against `pubtator.entity_annotations` are acceptable as a transition, not an end state. If an endpoint still takes ~1s+ on warm reads, the next step is a dedicated derived table or projection keyed to the serving use case.

---

## Wiki serving contract

### Shell route

`GET /api/v1/wiki/pages/{slug}`

Returns immediately navigable wiki content:
- markdown body
- canonical runtime fields (`page_kind`, `section_slug`, `graph_focus`)
- resolved wikilinks
- cited/featured graph refs
- linked entity metadata

This route must stay fast enough that the wiki panel can open and render before any backend evidence context arrives.

### Context route

`GET /api/v1/wiki/page-context/{slug}`

Returns slower backend evidence context for entity pages:
- `total_corpus_paper_count`
- `total_graph_paper_count`
- `top_graph_papers`

This route is allowed to load after the page shell. It must never block wiki navigation or markdown render.

---

## Current performance baseline

Warm local measurements after the 2026-04-11 API cleanup pass:
- wiki shell backend route: ~22ms
- wiki shell via Next route: ~135ms
- wiki context via Next route: ~1.07s for `entities/major-depressive-disorder`

That context latency is improved but still not the long-term target. The next structural database step is a reusable entity-to-corpus serving projection so wiki/entity overlay/read paths stop recomputing PubTator joins on demand.
