# Cosmograph API Lookup Index

This file is a thin pointer index. For runtime patterns, theming, camera, or
widgets, jump to `cosmograph-runtime.md`. For DuckDB-side detail, see
`duckdb-wasm.md`. For OPFS, see `opfs-cache.md`. For bootstrap failure triage,
see `graph-bundle-bootstrap.md`. This file only tracks the doc-search workflow
and the canonical local cross-checks.

## Doc Lookup Workflow

The Cosmograph docs library is indexed on the `codeatlas-docs` server as
`/jsolemd/cosmograph-docs`:

```text
mcp__codeatlas-docs__resolve_library_id("cosmograph") -> /jsolemd/cosmograph-docs
mcp__codeatlas-docs__search_docs(library_id="/jsolemd/cosmograph-docs", query="Cosmograph")
mcp__codeatlas-docs__read_doc(library_id="/jsolemd/cosmograph-docs", path="docs-lib/api/classes/Cosmograph.md")
```

Fallback when the indexed docs are stale:

```text
mcp__context7__resolve-library-id("cosmograph")
mcp__context7__query-docs(libraryId="/jsolemd/cosmograph-docs", query="...")
```

When docs disagree with runtime, confirm against local typings:

```text
node_modules/@cosmograph/react/index.d.ts
node_modules/@cosmograph/react/cosmograph.d.ts
node_modules/@cosmograph/cosmograph/cosmograph/index.d.ts
node_modules/@cosmograph/cosmograph/cosmograph/config/interfaces/*.d.ts
```

## Suggested Lookup Targets

| Need | Query |
|------|-------|
| Core class methods | `Cosmograph` |
| Config props | `CosmographConfig` |
| Search widget | `CosmographSearch` |
| Histogram widget | `CosmographHistogram` |
| Timeline widget | `CosmographTimeline` |
| Bars widget | `CosmographBars` |
| Legends | `CosmographTypeColorLegend`, `CosmographRangeColorLegend`, `CosmographSizeLegend` |
| Data prep / migration | `docs-lib/data-requirements/data-kit.md`, `docs-lib/upgrade.md` |

## Suggested Doc-Search Prompts

```text
search_docs(..., query="Cosmograph fitView fitViewByIndices fitViewByCoordinates")
search_docs(..., query="CosmographConfig onGraphRebuilt onPointsFiltered onLabelClick")
search_docs(..., query="CosmographConfig pointColorStrategy pointColorByFn pointClusterBy")
search_docs(..., query="CosmographHistogram preserveSelectionOnUnmount id")
search_docs(..., query="CosmographTimeline playAnimation pauseAnimation stopAnimation")
search_docs(..., query="CosmographBars setSelectedItem")
search_docs(..., query="duckDBConnection prepareCosmographData pointIdBy pointIndexBy")
```

## Local Cross-Checks

When something looks inconsistent between docs and runtime, check local files:

| Concern | Local check |
|---------|-------------|
| Where does SoleMD touch native Cosmograph? | `apps/web/features/graph/cosmograph/index.ts` |
| Load/fit race / first-paint | `apps/web/features/graph/cosmograph/GraphRenderer.tsx` |
| Which native props are bound right now? | `apps/web/features/graph/cosmograph/hooks/use-cosmograph-config.ts` |
| Bundle/session queries | `apps/web/features/graph/hooks/use-graph-bundle.ts`, `apps/web/features/graph/duckdb/` |
| Loading overlay + shell timing | `apps/web/features/graph/components/shell/DashboardShellClient.tsx` |
| Renderer mounting | `apps/web/features/graph/components/canvas/GraphCanvas.tsx` |
| Label behavior | `packages/graph/src/cosmograph/label-appearance.ts`, `apps/web/features/graph/lib/label-mode.ts` |
| Cached widget datasets | `apps/web/features/graph/cosmograph/widgets/` |
| Camera hooks | `packages/graph/src/cosmograph/hooks/use-graph-camera.ts` |
| Null-tolerant instance hook | `packages/graph/src/cosmograph/hooks/use-graph-instance.ts` |

## Practical Rule

If the question is architectural, answer from the local SoleMD files first.
If the question is API-specific, go to the indexed `codeatlas-docs` library (then context7) and local
typings before making assumptions.
