# Cosmograph Lookup Guide

Use this file to orient yourself. Do not treat it as a frozen API dump.
For exact props, methods, and widget signatures, use doc-search or the installed
local typings directly.

## Start Here

| Question | Read first |
|----------|------------|
| Where does SoleMD touch native Cosmograph? | `features/graph/cosmograph/index.ts` |
| Why is the camera/loading sequence behaving strangely? | `features/graph/cosmograph/GraphRenderer.tsx` |
| Which native props are we binding right now? | `features/graph/cosmograph/hooks/use-cosmograph-config.ts` |
| Where does the bundle/session come from? | `features/graph/hooks/use-graph-bundle.ts` and `features/graph/duckdb/` |
| Who holds the loading overlay and shell timing? | `features/graph/components/shell/DashboardShellClient.tsx` |
| How is the renderer mounted? | `features/graph/components/canvas/GraphCanvas.tsx` |

## SoleMD Architecture Notes

1. `features/graph/cosmograph/**` is the app boundary for `@cosmograph/*`.
2. The rest of the app should consume our barrel exports, not import native packages directly.
3. `useGraphBundle()` owns the DuckDB-backed session and query surface.
4. `DashboardShellClient` owns shell timing, mode chrome, and the loading overlay.
5. `GraphRenderer` should stay as close to native Cosmograph as possible and only hold the minimum SoleMD glue needed for camera, selection, theme, and first-paint behavior.

## Current Known-Good Rules

| Rule | Reason |
|------|--------|
| Prefer native props, native methods, and native widgets first | Keeps upgrades straightforward |
| Use adapters only when isolating SoleMD-specific state or lifecycle issues | Avoids intermingled app logic in native paths |
| Keep initial fit explicit with `fitView(0, padding)` after rebuild | Avoids the zoomed-in flash before fit settles |
| Do not lean on `fitViewOnInit` for first paint | It can expose the wrong camera state for a frame |
| Keep the hidden-tab visibility retry | Background tabs can suppress the first RAF-driven rebuild callback |

## Exact API Lookup Workflow

Doc-search library:

```text
/jsolemd/cosmograph-docs
```

Recommended flow:

```text
resolve-library-id("cosmograph") -> /jsolemd/cosmograph-docs
query-docs(libraryId="/jsolemd/cosmograph-docs", query="Cosmograph")
read-doc(libraryId="/jsolemd/cosmograph-docs", path="docs-lib/api/classes/Cosmograph.md")
```

When doc-search gives a partial answer, confirm against local typings:

```text
node_modules/@cosmograph/react/index.d.ts
node_modules/@cosmograph/react/cosmograph.d.ts
node_modules/@cosmograph/cosmograph/cosmograph/index.d.ts
node_modules/@cosmograph/cosmograph/cosmograph/config/interfaces/*.d.ts
```

## What To Query

| Need | Query or file |
|------|---------------|
| Core class methods | `Cosmograph` |
| Config props | `CosmographConfig` |
| Search widget | `CosmographSearch` |
| Histogram widget | `CosmographHistogram` |
| Timeline widget | `CosmographTimeline` |
| Bars widget | `CosmographBars` |
| Legends | `CosmographTypeColorLegend`, `CosmographRangeColorLegend`, `CosmographSizeLegend` |
| Data prep / migration | `docs-lib/data-requirements/data-kit.md`, `docs-lib/upgrade.md` |

Suggested doc-search prompts:

```text
query-docs(..., query="Cosmograph fitView fitViewByIndices fitViewByCoordinates")
query-docs(..., query="CosmographConfig onGraphRebuilt onPointsFiltered onLabelClick")
query-docs(..., query="CosmographConfig pointColorStrategy pointColorByFn pointClusterBy")
query-docs(..., query="CosmographHistogram preserveSelectionOnUnmount id")
query-docs(..., query="CosmographTimeline playAnimation pauseAnimation stopAnimation")
query-docs(..., query="CosmographBars setSelectedItem")
```

## Local Cross-Checks

When something looks inconsistent between docs and runtime, check these local files:

| Concern | Local check |
|---------|-------------|
| Load/fit race | `features/graph/cosmograph/GraphRenderer.tsx` |
| Label behavior | `features/graph/cosmograph/label-appearance.ts` and `features/graph/lib/label-mode.ts` |
| Prop derivation | `features/graph/cosmograph/hooks/use-cosmograph-config.ts` |
| Bundle/session queries | `features/graph/hooks/use-graph-bundle.ts` |
| Cached widget datasets | `features/graph/cosmograph/widgets/` |

## Practical Rule

If the question is architectural, answer from the local SoleMD files first.
If the question is API-specific, go to doc-search and local typings before making assumptions.
