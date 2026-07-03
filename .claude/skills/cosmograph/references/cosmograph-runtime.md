# Cosmograph Runtime Reference

This is the agent-facing reference for the native Cosmograph 2 surface that
SoleMD.Graph binds. Read `SKILL.md` first for the rules; come here for the
concrete v2 contract, prop tables, widget integration, and theming details.

## v2 Data Contract

Cosmograph 2 requires six `*By` props on the renderer. They are not optional:

| Prop | Required column type |
|------|----------------------|
| `pointIdBy` | string-ish stable identifier |
| `pointIndexBy` | sequential `INTEGER` from 0 (no gaps) |
| `linkSourceBy` | matches `pointIdBy` values |
| `linkSourceIndexBy` | sequential `INTEGER` from 0 (no gaps) |
| `linkTargetBy` | matches `pointIdBy` values |
| `linkTargetIndexBy` | sequential `INTEGER` from 0 (no gaps) |

Hard rules:

- Multi-target links were removed. If you have multi-targets, collapse upstream
  before the parquet/table is registered.
- The "index" columns are mandatory for v2 fast paths. If you only have raw
  arrays, run `prepareCosmographData()` to create them.
- The renderer reads `pointXBy` / `pointYBy` from DuckDB columns. Force
  simulation is OFF (`enableSimulation={false}`); positions are static.

## External DuckDB Connection Mode

SoleMD passes table names as strings plus the live DuckDB connection. Pattern:

```tsx
<Cosmograph
  duckDBConnection={canvas.duckDBConnection}
  points={config.layerConfig.pointsTable}      // 'current_points_canvas_web'
  links={config.layerConfig.linksTable}        // 'current_links_web'
  pointIdBy="id"
  pointIndexBy="index"
  pointXBy={config.positionXColumn}
  pointYBy={config.positionYColumn}
  linkSourceBy={config.layerConfig.linkSourceBy}
  linkSourceIndexBy={config.layerConfig.linkSourceIndexBy}
  linkTargetBy={config.layerConfig.linkTargetBy}
  linkTargetIndexBy={config.layerConfig.linkTargetIndexBy}
  enableSimulation={false}
  // ...rest
/>
```

Canonical implementation: `apps/web/features/graph/cosmograph/GraphRenderer.tsx`.

## Canvas-Side Color Props

Canvas appearance is themed exclusively through Cosmograph **config props**.
Never bridge canvas appearance through CSS (CSS controls widget chrome only).

| Prop | Purpose |
|------|---------|
| `pointDefaultColor` | base point color |
| `pointGreyoutColor` / `pointGreyoutOpacity` | filtered/greyout points |
| `linkDefaultColor` / `linkDefaultWidth` | link base appearance |
| `hoveredPointRingColor` | ring around hovered point |
| `focusedPointRingColor` | ring around focused/selected point |
| `unknownColor` | fallback when `pointColorByFn` returns undefined |
| `polygonalSelectorStrokeColor` | polygon-selection toolbar stroke |
| `pointLabelColor` | label text color (overlay labels) |
| `backgroundColor` | canvas clear color (transparent in light mode) |

## Performance-Relevant Render Props

Durable rendering choices in `GraphRenderer.tsx`. Do not flip without measuring:

| Prop | Value | Why |
|------|-------|-----|
| `enableSimulation` | `false` | Static positions from DuckDB |
| `pointSamplingDistance` | `170` | Label sampling cadence in canvas px |
| `pointLabelFontSize` | `11` | Tuned for density |
| `preservePointPositionsOnDataUpdate` | `true` | Avoid layout thrash on filter changes |
| `disableLogging` | `true` | Cosmograph console noise off in production |
| `resetSelectionOnEmptyCanvasClick` | `false` | App owns the empty-click reset lane (native treats index 0 as falsy) |

## Camera Surface

Use the shared-package wrappers from `@solemd/graph/cosmograph`. They are
null-tolerant and won't crash renderer-clean surfaces.

```ts
import { useGraphCamera, useGraphInstance } from "@solemd/graph/cosmograph";

const { fitView, fitViewByIndices, fitViewByCoordinates,
        zoomToPoint, zoomIn, zoomOut,
        getZoomLevel, setZoomLevel } = useGraphCamera();

const cosmograph = useGraphInstance(); // null when no provider mounted
```

Why these wrappers exist:

- `useGraphInstance()` calls `useCosmographInternal()?.cosmograph ?? null` —
  the throwing `useCosmograph` would crash the 3D OrbSurface and any future
  renderer-clean surface that mounts widgets without an active Cosmograph
  instance.
- All camera callbacks guard via `?.` so callers don't have to.

Canonical impl: `packages/graph/src/cosmograph/hooks/use-graph-camera.ts`,
`use-graph-instance.ts`.

## First-Paint Contract

`onGraphRebuilt` fires after the first RAF-driven paint. The shell loading
overlay drops only after the correct viewport is applied. Hidden tabs suppress
RAF, so a `visibilitychange` retry path is required (see `GraphRenderer.tsx`).

Sequence:

1. `loadCameraState()` reads persisted snapshot, falls back to
   `DEFAULT_INITIAL_CAMERA`.
2. `Cosmograph` mounts with `initialZoomLevel={initialCamera.current.zoomLevel}`.
3. `onGraphRebuilt` triggers an explicit `restoreViewport(...)` (uses
   `applyViewportCamera` from `cosmograph-viewport.ts`).
4. After viewport applied, `markCameraSettled()` fires and the shell drops the
   overlay.
5. If the tab was backgrounded during step 3, the visibility handler retries
   on the next RAF.

Do NOT lean on `fitViewOnInit` for the flagship initial camera. It can flash
the wrong frame and snap.

## Camera Persistence

`packages/graph/src/cosmograph/camera-persistence.ts` owns the
`localStorage`-backed snapshot:

- `loadCameraState() -> CameraSnapshot | null`
- `saveCameraState(snapshot)`
- `clearCameraState()`
- `DEFAULT_INITIAL_CAMERA` (the fallback)

Use these from inside the renderer adapter, not from app code.

## Label Pipeline

| Concern | Surface |
|---------|---------|
| Native Cosmograph CSS labels | DOM elements `.css-label--label` inside `[data-graph-canvas]` |
| Theme override | `NATIVE_COSMOGRAPH_LABEL_THEME_CSS` from `packages/graph/src/cosmograph/label-appearance.ts` (injected via inline `<style>`) |
| Label-mode resolution | `apps/web/features/graph/lib/label-mode.ts` (`resolveGraphLabelMode`) |
| Cluster label class resolver | `resolveClusterLabelClassName` (re-exported from `@solemd/graph/cosmograph`) |
| Cluster label gating | `selectClusterOnLabelClick`, `usePointColorStrategyForClusterLabels` |

## Widget Integration

| Native widget | App / shared adapter | Notes |
|---------------|----------------------|-------|
| `CosmographProvider` | `packages/graph/src/cosmograph/GraphShell.tsx` | Wraps app shell |
| `CosmographTimeline` | `apps/web/features/graph/cosmograph/widgets/TimelineWidget.tsx` | Mounted in bottom chrome bar |
| `Histogram` (from `@cosmograph/ui`) | `apps/web/features/graph/cosmograph/widgets/FilterHistogramWidget.tsx` + `native-histogram-adapter.ts` | Panel-context |
| `CosmographButtonRectangularSelection`, `CosmographButtonPolygonalSelection` | `apps/web/features/graph/cosmograph/widgets/SelectionToolbar.tsx` | Native click→activate→drag→select |
| `CosmographRangeColorLegend`, `CosmographTypeColorLegend` | `packages/graph/src/cosmograph/widgets/ColorLegends.tsx` | Auto-selects range vs categorical |
| `CosmographSizeLegend` | `packages/graph/src/cosmograph/widgets/SizeLegend.tsx` | |
| Bars (in panels) | `apps/web/features/graph/cosmograph/widgets/native-bars-adapter.ts` | Adapter wraps `@cosmograph/ui` Bars |
| Crossfilter init | `apps/web/features/graph/cosmograph/widgets/init-crossfilter-client.ts` | Required before histogram/bars work |

## Crossfilter

Cosmograph 2 widgets coordinate selection through the upstream crossfilter
client (`@cosmograph/cosmograph/cosmograph/crossfilter/filtering-client`).
SoleMD initializes it once per session via `init-crossfilter-client.ts`. Don't
mount filtering widgets without it — they'll silently no-op.

## Theme Integration

Two distinct planes — never bridge them through the same mechanism.

### Widget chrome (CSS variables)

Inline CSSProperties (or `:root` defaults) drive Cosmograph's widget rendering.
Reference impl: `apps/web/features/graph/components/explore/widget-theme.ts`
exports `queryWidgetThemeVars` (panel-context) and `timelineWidgetThemeVars`
(canvas-context).

Variable inventory:

- `--cosmograph-ui-background`, `--cosmograph-ui-text`,
  `--cosmograph-ui-element-color`, `--cosmograph-ui-highlighted-element-color`,
  `--cosmograph-ui-selection-control-color`,
  `--cosmograph-ui-tick-font-size`, `--cosmograph-ui-font-size`,
  `--cosmograph-ui-font-family`
- `--cosmograph-histogram-bar-color`, `--cosmograph-histogram-highlighted-bar-color`,
  `--cosmograph-histogram-background`, `--cosmograph-histogram-axis-color`,
  `--cosmograph-histogram-selection-color`
- `--cosmograph-bars-background`, `--cosmograph-bars-highlighted-color`,
  `--cosmograph-bars-font-color`, `--cosmograph-bars-font-size`,
  `--cosmograph-bars-bar-height`, `--cosmograph-bars-bar-bottom-margin`,
  `--cosmograph-bars-ui-font-size`
- `--cosmograph-timeline-background`, `--cosmograph-timeline-bar-color`,
  `--cosmograph-timeline-highlighted-bar-color`,
  `--cosmograph-timeline-axis-color`
- `--cosmograph-scrollbar-background`

For the actual values these resolve to, defer to `/aesthetic`.

### Canvas appearance (config props)

See "Canvas-Side Color Props" above.

## API Lookup Workflow

The Cosmograph docs are indexed under codeatlas as
`/jsolemd/cosmograph-docs`:

```text
mcp__codeatlas__resolve_library_id("cosmograph") -> /jsolemd/cosmograph-docs
mcp__codeatlas__search_docs(library_id="/jsolemd/cosmograph-docs", query="Cosmograph fitView")
mcp__codeatlas__read_doc(library_id="/jsolemd/cosmograph-docs", path="docs-lib/api/classes/Cosmograph.md")
```

When codeatlas's index is stale, fall back to context7 with the same library id.

When docs disagree with runtime, confirm against local typings:

```text
node_modules/@cosmograph/react/index.d.ts
node_modules/@cosmograph/react/cosmograph.d.ts
node_modules/@cosmograph/cosmograph/cosmograph/index.d.ts
node_modules/@cosmograph/cosmograph/cosmograph/config/interfaces/*.d.ts
```
