Chart primitives
annotation
axis
curve
glyph
grid
legend
marker
scale
shape
tooltip
Layouts & specialized
chord
geo
heatmap
hierarchy
network
react-spring
sankey
stats
threshold
wordcloud
xychart
Interactions
brush
delaunay
drag
voronoi
zoom
SVG utilities
clip-path
event
group
gradient
pattern
text
Data utilities
bounds
mock-data
responsive
point
Umbrella package
visx

## Core Takeaways
- **Prototype with the gallery recipe stack.** Every demo starts with thin data model + `@visx/mock-data`, then builds scales, accessors, and responsive containers. Treat them as copy-ready blueprints rather than one-off snippets.
- **Separate data math from rendering.** Compute `xMax`, `yMax`, and `scaleBand`/`scaleLinear` inside `useMemo` blocks; keep accessors (`getLetter`, `getLetterFrequency`) small and pure so the LLM can swap datasets without touching layout math.
- **Draw inside a staged canvas.** Most examples render a rounded `<rect>` background, then nest `<Group top left>` to honor margins. This gives immediate breathing room and makes gradients, drop shadows, and axes read better.
- **Use gradients and markers to create depth.** Inline background gradients (`<GradientTealBlue />`), SVG markers (`MarkerArrow`, `MarkerCircle`, `MarkerLine`), and semi-transparent fills make otherwise-flat SVG primitives look polished.
- **Layer focus cues.** Tooltips and selection states rely on dashed crosshairs, small accent circles, and translucent overlays—easy wins for readability even before bespoke styling.
- **Keep interactions declarative.** `useTooltip` / `useTooltipInPortal`, `handlePointerMove`, plus state toggles (e.g., “Show points?”, “Try rendering in Portal”) surface as tiny controls that translate cleanly into prompt instructions.
- **Design for responsiveness.** Large charts wrap in `ParentSize` or expose `width`/`height` props. Scale ranges are recalculated each render (`xScale.range([0, width - margin])`). Never hard-code viewport dimensions in the final LLM instructions.
- **Plan for ResizeObserver gaps.** `@visx/annotation`, `@visx/tooltip`, `@visx/responsive`, and `@visx/xychart` all measure DOM nodes—ship a `resizeObserverPolyfill` (or gate on browser support) when targeting SSR or legacy runtimes.
- **Animate with intent.** Many stories rely on `@visx/react-spring` or pass `useAnimatedComponents` toggles into `XYChart`. Keep animation flags optional and coordinated with data changes.
- **Prefer reusable palettes.** Treemaps, bars, and glyph demos reuse the same teal/purple gradients and neutral grays (#efefef backgrounds, rgba overlays). Consistency beats bespoke color picks per chart.
- **Respect DOM layering.** Tooltip demos illustrate two modes: inline (subject to z-index) and portal-backed (`useTooltipInPortal({ scroll: true, detectBounds })`). Always expose a toggle when layering over UI components.

## Implementation Principles

### 1. Shape Data Early
- Define accessors (`getX`, `getY`) right next to your mock or fetched data.
- Keep data sorted when curves depend on monotonic order (`series.map(...).sort(...)`).
- Use TypeScript types (`type CurveType = keyof typeof allCurves`) so the LLM can reason about allowable string literals.

### 2. Build Scales With `useMemo`
- `useMemo(() => scaleBand({ domain, range, padding }), [rangeEnd])` prevents re-instantiating expensive scale objects.
- Immediately update ranges after scale creation (`xScale.range([0, width - 50]);`). This pattern appears in almost every example—follow it when updating on responsive re-renders.

### 3. Stage the Scene
- Reserve a padding margin (`const lineHeight = svgHeight / lineCount`) and shift drawing groups with `<Group top={margin / 2} left={13}>`.
- Drop a rounded `<rect>` as the visual canvas; even grayscale backgrounds (`fill="#efefef" rx={14}`) add production polish.

### 4. Use Markers and Glyphs for Accents
- Add arrowheads, circles, or crosses via `<MarkerArrow id="marker-arrow" ... />` and reference them on `<LinePath markerEnd="url(#marker-arrow)" />`.
- Combine `showPoints` toggles with small `<circle>` glyphs to help exploratory prompts show data anchors without clutter.

### 5. Tooltips & Portals
- `const { containerRef, TooltipInPortal } = useTooltipInPortal({ scroll: true, detectBounds })` keeps tooltip math clean even inside scrollable layouts.
- Provide state switches for boundary detection and portal usage to avoid z-index conflicts in SSR contexts (e.g., inside Mantine cards).
- Style tooltips with shared `defaultStyles` overrides—consistent typography, padding, and accent colors improve credibility instantly.
- Use `useTooltip()` for function components and `withTooltip()` for class-based ones; both expose identical props (`showTooltip`, `hideTooltip`, `tooltipData`, etc.).
- Remember `<Tooltip>` / `<TooltipWithBounds>` render as `<div>`—mount them outside your `<svg>` and derive coordinates with `localPoint` or page offsets when portaling.
- `useTooltipInPortal` supplies debounced scroll/resize handling, optional `ResizeObserver` polyfill injection, and a keyed `TooltipInPortal` component; always attach its `containerRef` to the element that defines your coordinate system.

### 6. Responsiveness & Controls
- Accept `showControls`, `events`, or `theme` props to conditionally render configuration UIs. The gallery favors `label` + `select` + `input` clusters with 12–14px text.
- For interactive XY charts, expose toggles for orientation, curve type, glyph rendering, and tooltip behavior. LLM prompts can mirror these controls directly.
- `ParentSize` wrappers measure the container and forward `width/height` into the chart component—avoid `window.innerWidth` hacks.

### 7. Visual Hierarchy
- Use semi-transparent fills (`rgba(23, 233, 217, .5)`) and layering (bars behind glyphs, crosshairs above backgrounds) to establish depth.
- Keep fonts small and tight for overlay labels (12–14px). Apply consistent letter-spacing and margin spacing in CSS-in-JS blocks.

### 8. Animation & Motion Hooks
- When `useAnimatedComponents` is enabled on `XYChart`, data updates automatically tween. Pair with `react-spring` where you need custom transitions (not shown directly but indicated via gallery toggles).
- Leverage GSAP or Framer Motion for surrounding UI (cards, legends) while leaving inside-chart transitions to visx primitives.

### 9. Portal & z-index Strategies
- Wrap tooltip content in `<Portal zIndex={4000}>` to leapfrog stacking contexts from Mantine/Next shells.
- Convert container-relative coordinates to page values when portaling: `tooltipLeft + bounds.left + window.scrollX` and `tooltipTop + bounds.top + window.scrollY`.
- Tooltip theme blueprint: dark indigo backdrop (`rgba(53,71,125,0.8)`), white text, 12px padding, subtle drop shadow, dashed crosshairs for focus, and 6–8px pointer indicator circles.

## Category Playbooks

### Bars & Columns
- Base on `@visx/shape` `Bar` + `scaleBand` / `scaleLinear`; reserve vertical margin (~120px) for labels.
- Use rounded corners (`rx={barWidth / 4}`) and semi-transparent fills for polish; overlay glyphs or annotations for highlighted segments.
- Provide toggles for grouped/stacked orientation, animation, and tooltip behaviors (shared vs. per series).

### Lines & Curves
- `LinePath` with `allCurves[curveType]` lets prompts swap interpolation modes; ensure data arrays are chronologically sorted.
- Combine markers (`MarkerArrow`, `MarkerCircle`, `MarkerLine`) with `showPoints` toggles to surface trends and inflection points.
- Offset multiple series via calculated `lineHeight` and nested `<Group>` offsets to maintain legibility.

### Areas & Stacks
- `AreaClosed`, `AreaStack`, and `BarStack` rely on consistent palettes; use gradient overlays and adjust `stack offset` (auto, expand, wiggle) based on narrative needs.
- Mix in `@visx/annotation` for thresholds and callouts; keep tooltip summaries concise to avoid obscuring filled regions.

### XYChart Configurations
- Leverage `@visx/xychart` for mixed-type dashboards—expose controls mirroring the gallery (`orientation`, `curve shape`, `glyph series`, `useAnimatedComponents`).
- Coordinate axes/grids via `AnimatedAxis`, `AnimatedGrid`; fall back to static versions when deterministic renders are required.
- Keep `dataKey` naming consistent across series (`temperature-ny`, `temperature-sf`) so prompts stay predictable.

### Tooltip Systems
- Start with `useTooltip` + `TooltipWithBounds`; augment with crosshairs and pointer indicators for precise hover targeting.
- Offer “Render in Portal” and “Detect Bounds” switches, and debounce scroll/resize events when charts live inside scrollable panels.
- Introduce `useTooltipInPortal` when stacking contexts or overflow clipping are likely; include instructions about coordinate conversion in prompts.

### Hierarchy & Network
- `Hierarchy.Cluster`, `Hierarchy.Tree`, `Network.Graph`, and `Shape.Link*` respond well to dropdown controls for layout (`polar` vs `cartesian`), link styles (`curve`, `step`, `diagonal`), and tile methods.
- Use muted node fills with saturated link strokes, and keep labels uppercase with tight spacing to match gallery aesthetics.
- For interactive trees, disable heavy animations by default; re-enable only when datasets are small enough to keep responsive.

### Geo & Projections
- `Geo.CustomProjection`, `Geo.Mercator`, and `Geo.AlbersUsa` should expose projection selectors and respond to `scale`/`translate` updates derived from bounds.
- Combine with `@visx/zoom` or tooltips for map interactions; heatmap overlays (`HeatmapRect`, `HeatmapCircle`) work well for choropleth-style storytelling.

## Package Reference

### Chart Primitives
#### annotation (@visx/annotation)
- Compose annotations with `Annotation` or `EditableAnnotation` wrappers to manage `x`, `y`, `dx`, and `dy` offsets; supply `Subject`, `Connector`, and `Label` as children.
- When you enable dragging, pass `width`/`height` and respond to `onDragStart`/`onDragMove`/`onDragEnd` to persist positions or reset state.
- Inject a `ResizeObserver` via the `resizeObserverPolyfill` prop in SSR or legacy browsers; `Label`/`HtmlLabel` cannot measure text otherwise.
- Prefer `HtmlLabel` only when `<foreignObject>` is supported, and keep the SVG `Label` variant as a fallback for exports.

#### axis (@visx/axis)
- Reuse the same scale instance as your data layers; adjust `numTicks`, `tickValues`, and `rangePadding` to keep ticks aligned and unclipped.
- Reach for orientation-specific helpers (`AxisBottom`, `AxisLeft`, etc.) first, then override `tickLabelProps` or `tickComponent` for rotation, formatting, or accessibility.
- Use `hideZero`, `hideTicks`, and `labelOffset` instead of manual transforms to declutter baselines.
- When animating, swap to `AnimatedAxis` from `@visx/react-spring` instead of reimplementing tick transitions.

#### curve (@visx/curve)
- Import curve factories from `@visx/curve` and pass them to `LinePath`, `AreaClosed`, or XYChart series via the `curve` prop.
- Keep data sorted for monotone or step curves to avoid self-intersection artifacts.
- Namespace import (`import * as Curve`) lets prompts swap interpolation strings cleanly.
- Tune Catmull/Cardinal tension when smoothing dense time series to prevent overshoot.

#### glyph (@visx/glyph)
- Offset glyph collections once with `<Glyph left={...} top={...}>` instead of shifting every SVG primitive individually.
- Use accessor-based `size` props so mark sizes remain tied to data-driven scales and legends.
- Override `children` to reuse the generated d3 path for multi-layer glyphs or custom fills.
- Match glyph shapes with legend entries (e.g., crosses for “missing”) to keep encodings interpretable.

#### grid (@visx/grid)
- Choose `Grid`, `GridRows`, or `GridColumns` depending on whether you need both axes or selected lines.
- Supply `numTicks` or explicit `tickValues` to keep grid spacing in sync with axis ticks; style via `lineStyle` or `strokeDasharray`.
- Update `xScale`/`yScale` ranges before rendering to keep radial and polar grids aligned with chart extents.
- For polar plots, configure `outerRadius`, `numTicksAngle`, and offsets to avoid clipped rings.

#### legend (@visx/legend)
- Match legend component to the scale type (`Linear`, `Quantile`, `Threshold`, `Ordinal`, or `Size`) for accurate domain segmentation.
- Control flex layout with `direction`, `itemDirection`, and `labelMargin` so legends adapt to available space.
- Normalize labels with `labelFormat` or `labelTransform` to keep units and ranges consistent across prompts.
- Customize swatches via `shape` and `shapeStyle`, reusing glyph components when legend and chart marks should match.

#### marker (@visx/marker)
- Give every marker a unique `id` and attach with `markerStart`/`markerEnd` to avoid DOM collisions across charts.
- Adjust `refX`/`refY` and `markerUnits` to align arrowheads or dots precisely with line endpoints.
- Keep marker `markerWidth`/`markerHeight` small (≈3–4) when lines are dense to prevent overlap.
- Combine markers with gradients or patterns to emphasize direction without redrawing paths.

#### scale (@visx/scale)
- Instantiate scales through `@visx/scale` and immediately set both domain and range; call `nice`, `round`, or `clamp` as needed.
- Remember that log, radial, and time scales cannot cross zero; guard data or switch scale types accordingly.
- Recompute `range` after layout measurements (e.g., inside `ParentSize`) so axes, grids, and marks stay aligned.
- Pair ordinal/band scales with `padding` and `round` to create legible categorical charts that align to pixels.

#### shape (@visx/shape)
- Define accessors (`x`, `y`, `keys`, etc.) before rendering so shape components and legends share consistent data contracts.
- Supply compatible scales (`xScale`, `yScale`, `x0Scale`, etc.) to grouped or stacked components and expose `order`/`offset` controls for different narratives.
- Use `innerRef` props to measure or animate rendered SVG paths without querying the DOM manually.
- Select from `Link*` variants (horizontal, vertical, radial, step, curve) and tune `percent` or custom `path` functions to avoid overlapping connections.

#### tooltip (@visx/tooltip)
- Manage tooltip state with `useTooltip` in functional components or `withTooltip` for class components; reuse `showTooltip`/`hideTooltip`.
- Wrap overlays in `TooltipWithBounds` or `useTooltipInPortal` to prevent clipping and respect scroll containers.
- Provide a `resizeObserverPolyfill` when rendering on the server or supporting older browsers—the hook depends on it.
- Translate pointer events with `localPoint` so tooltip coordinates remain correct across pan/zoom or responsive layouts.

### Layout & Specialized
#### chord (@visx/chord)
- Supply a square adjacency matrix (`matrix[i][j]`) and optional sort comparators to stabilize chord ordering.
- Render ribbons via the `children` render prop to customize gradients, arrowheads, or add tooltips.
- Adjust `padAngle` to separate categories visually and avoid chords blending together.
- Combine with gradients or patterns to encode flow direction or magnitude.

#### geo (@visx/geo)
- Feed GeoJSON features and choose an appropriate projection (`mercator`, `albersUsa`, etc.); call `fitSize`/`fitExtent` to auto-scale.
- Use `graticule`, `graticuleLines`, and `graticuleOutline` for contextual latitude/longitude hints.
- Leverage `projectionFunc` to draw extra layers (markers, arcs) using the already-configured projection.
- Set `pointRadius` when plotting `Point`/`MultiPoint` geometries so interaction targets stay large enough.

#### heatmap (@visx/heatmap)
- Structure data as columns of bins; access rows via the `bins` accessor for consistent layout.
- Compute `colorScale` and `opacityScale` ahead of time and reuse them across legends or tooltips.
- Tune `binWidth`, `binHeight`, and `gap` to balance density and legibility; expose as prompt parameters.
- Override the render prop to attach events or annotations without rewriting the placement logic.

#### hierarchy (@visx/hierarchy)
- Convert nested structures with `hierarchy(data)` and reuse the resulting root across `Tree`, `Cluster`, `Pack`, `Partition`, and `Treemap`.
- Control layout flavor via `size` (radial) vs. `nodeSize` (absolute), `separation`, and tiling strategy for treemaps.
- Swap `nodeComponent` and `linkComponent` to align visuals with the surrounding design system.
- For interactive trees, keep animations disabled by default and only re-enable when datasets are small.

#### network (@visx/network)
- Provide precomputed node coordinates (`x`, `y`); the package renders what you supply and does not solve layout.
- Customize node/link appearance with the `nodeComponent` and `linkComponent` render props.
- Offset the entire network via `left`/`top` to align with surrounding axes or annotations.
- Pair with `Zoom` or `Drag` utilities for panning, zooming, or node repositioning workflows.

#### react-spring (@visx/react-spring)
- Install `react-spring` alongside this package; animated variants (`AnimatedAxis`, `AnimatedGrid`, etc.) accept the same props as static ones.
- Choose an `animationTrajectory` that matches your story (`'outside'`, `'center'`, `'min'`) for predictable tick motion.
- Toggle animations via feature flags (e.g., `useAnimatedComponents` in XYChart) so exports can remain static.
- Combine with other `react-spring` hooks to animate legends or controls without leaving the visx ecosystem.

#### sankey (@visx/sankey)
- Provide `nodes`, `links`, and `value` fields; set `size`, `nodeWidth`, and `nodePadding` to avoid overlaps.
- Use `nodeAlign` (`sankeyCenter`, `sankeyLeft`, etc.) to control vertical alignment.
- Render custom nodes and links through the `children` render prop and `createPath` helper for gradients or tooltips.
- Sort nodes/links (`nodeSort`, `linkSort`) to stabilize layouts between renders.

#### stats (@visx/stats)
- `BoxPlot` expects the five-number summary plus optional `outliers`; supply `valueScale` and toggle `horizontal` to flip orientation.
- Style via `boxProps`, `medianProps`, and `outlierProps` to match brand palettes.
- `ViolinPlot` requires raw sample data plus `value`/`count` accessors; keep `width` modest so violin and box plots can stack.
- Layer both components together to showcase distribution and summary simultaneously.

#### threshold (@visx/threshold)
- Provide `x`, `y0`, `y1`, `clipAboveTo`, and `clipBelowTo` accessors to carve positive/negative regions.
- Always supply a unique `id` so multiple thresholds do not share clip paths inadvertently.
- Style gains vs. losses via `aboveAreaProps`/`belowAreaProps` (gradients, patterns, opacity changes).
- Combine with legends or annotations to explain threshold values explicitly.

#### wordcloud (@visx/wordcloud)
- Supply `height`, `width`, and a `words` array (`{ text, value }`); map values to font sizes via `fontSize`.
- Set a deterministic `random` function when repeatable layout is required (tests, exports).
- Limit `rotate` values to a small set (e.g., multiples of 30°) and adjust `padding` to reduce overlaps.
- Recompute layout only on container size or data changes to avoid unnecessary jitter.

#### xychart (@visx/xychart)
- Wrap charts in `<XYChart>` with explicit `height`, `xScale`, and `yScale`; provide a theme via `ThemeProvider` or the `theme` prop.
- Give each series a unique `dataKey` and share accessor functions across lines, bars, glyphs, and annotations.
- Use `captureEvents`, `pointerEventsDataKey`, and tooltip props (`snapTooltipToDatumX/Y`, `showSeriesGlyphs`) to tune interaction behaviour.
- Provide a `resizeObserverPolyfill` when using `ParentSize`, tooltips, or annotation labels in SSR/legacy environments.

### Interactions
#### brush (@visx/brush)
- Specify `width`, `height`, and matching scales; set `brushDirection` and `brushRegion` to control axis-aligned selections.
- Seed default selections with `initialBrushPosition` and respond to `onBrushStart`/`onChange`/`onBrushEnd` to sync filters.
- Configure `resizeTriggerAreas` and `handleSize` to balance accessibility with UI minimalism.
- Disable overlay or selection dragging when the brush should remain locked by setting `disableDraggingOverlay`/`disableDraggingSelection`.

#### delaunay (@visx/delaunay)
- Build triangulations with `delaunay({ data, x, y })` or Voronoi diagrams via `voronoi({ width, height })`.
- Use invisible `<Polygon>` overlays to expand hover/click targets for sparse point series.
- Keep triangulation memoized so pointer lookups stay fast even on large datasets.
- Align Voronoi extents with chart padding to avoid cells extending beyond the plotting area.

#### drag (@visx/drag)
- Use `useDrag` for lightweight state: it exposes `dx`, `dy`, and drag handlers; clamp movement with the `restrict` option.
- `<Drag>` wraps a rectangular capture area; supply `width`, `height`, and render whatever element you want inside the render prop.
- Toggle `snapToPointer` when you need relative drags instead of jump-to-cursor behaviour.
- Pipe drag state into annotations or zoom transforms to enable manual repositioning workflows.

#### voronoi (@visx/voronoi)
- Configure the layout with accessors and `width`/`height`, then render cells via `<VoronoiPolygon>` or use them solely for hit testing.
- Lookup nearest points using `diagram.find(pointerX, pointerY)` to power precise tooltips.
- Leave polygons transparent when using them as invisible interaction layers.
- Recalculate diagrams only when data or chart dimensions change to keep performance acceptable.

#### zoom (@visx/zoom)
- Wrap chart content in `<Zoom width height>` and apply the provided transform matrix to a `<Group>` wrapper.
- Use `constrain` along with `scaleXMin`/`scaleXMax` and `scaleY*` props to prevent users from panning off-screen or zooming too far.
- Customize `wheelDelta` and `pinchDelta` to harmonize zoom sensitivity across trackpads, wheels, and touch devices.
- Expose controls (`zoom.scale`, `zoom.translate`, `zoom.reset`) through UI buttons for keyboard accessibility.

### SVG Utilities
#### clip-path (@visx/clip-path)
- Declare clip paths (`ClipPath`, `CircleClipPath`, `RectClipPath`) once per chart with unique ids and reference them via `clipPath="url(#id)"`.
- Combine clip definitions with gradients or patterns inside the same `<defs>` block to keep assets organized.
- Offset clip rectangles using the same margin math applied to `<Group>` wrappers to avoid unintended cropping.

#### event (@visx/event)
- Call `localPoint` with an event (and optionally an SVG ref) to get coordinates in the chart’s coordinate system.
- Use it across mouse and touch events to keep tooltip logic unified.
- Store the resulting point in state if you need to replay interactions or animate towards the last pointer location.

#### group (@visx/group)
- `<Group left top>` encapsulates `translate` transforms, keeping chart layout declarative.
- Chain nested groups for margins, grid layers, and annotation overlays without manual string concatenation.
- Forward `innerRef` when you need to measure or animate entire subtrees.

#### gradient (@visx/gradient)
- Define gradients with consistent ids and reference them in `fill`/`stroke` attributes (`fill="url(#id)"`); this keeps backgrounds declarative.
- Adjust `fromOffset`/`toOffset` or supply custom `<stop>` children to build multi-stop ramps.
- Use `rotate` or a custom `transform` to orient gradients diagonally for area and bar fills.

#### pattern (@visx/pattern)
- Register pattern definitions (`PatternLines`, `PatternCircles`, etc.) inside `<defs>` and reference them via `fill="url(#id)"`.
- Tune `orientation`, `strokeWidth`, and `background` to balance density with legibility.
- Patterns and gradients can be combined—e.g., pattern-filled bar inside a gradient-backed card—to create depth cues.

#### text (@visx/text)
- Replace raw `<text>` nodes with `<Text>` to get word wrapping, vertical anchoring, and rotation without manual baseline math.
- Use the `width` prop plus `lineHeight` to wrap labels; `scaleToFit="shrink-only"` prevents uncontrolled font expansion.
- Rotate axis labels via the `angle` prop and center them with `textAnchor`/`verticalAnchor`.

### Data Utilities
#### bounds (@visx/bounds)
- Wrap overlays (tooltip, popovers) with `withBoundingRects` to auto-flip positioning when they overflow container edges.
- Use the supplied `rect` and `parentRect` measurements to implement axis-specific clamping logic.
- Combine with `useTooltipInPortal` to convert between local and page coordinates when rendering outside the chart DOM tree.

#### mock-data (@visx/mock-data)
- Use generators (`genRandomNormalPoints`, `genDateValue`) in `useMemo` blocks to provide stable prototypes.
- Import canned datasets (`cityTemperature`, `appleStock`, `lesMiserables`, etc.) to mirror gallery recipes and keep prompts consistent.
- Annotate data interfaces so LLM prompts can swap datasets while preserving field names and types.

#### responsive (@visx/responsive)
- Choose between `useScreenSize`, `useParentSize`, and higher-order components to adapt charts to containers or viewport.
- Provide `resizeObserverPolyfill` when server-rendering or supporting browsers without native ResizeObserver.
- Wrap charts in `<ParentSize>` for elastic layouts or `<ScaleSVG>` when you need a fixed-aspect viewBox that scales.

#### point (@visx/point)
- Use the `Point` helper to store and manipulate `x`/`y` coordinates; `value()` returns an object, `toArray()` returns a tuple.
- Helpful for persisting drag positions or translating between library APIs that expect arrays vs. objects.
- Combine with event helpers to record pointer locations for annotations or tooltips.

### Umbrella Package
#### visx (@visx/visx)
- Installing `@visx/visx` bundles every subpackage; great for rapid prototyping but consider per-package imports for production tree-shaking.
- Keep umbrella usage limited to sandboxes or tutorials; migrate to explicit dependencies once you know which modules you ship.
- Check bundle sizes periodically—unused umbrella modules can inflate builds if not pruned.

## Sample Prompt Skeleton

```tsx
import { ParentSize } from '@visx/responsive';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Group } from '@visx/group';
import { Bar } from '@visx/shape';
import { GradientTealBlue } from '@visx/gradient';

function LetterFrequencyChart({ data }) {
  return (
    <ParentSize>
      {({ width, height }) => {
        const xMax = width;
        const yMax = height - 120;
        const xScale = useMemo(
          () => scaleBand({
            domain: data.map((d) => d.letter),
            range: [0, xMax],
            padding: 0.4,
          }),
          [xMax, data]
        );
        const yScale = useMemo(
          () =>
            scaleLinear({
              domain: [0, Math.max(...data.map((d) => d.frequency))],
              range: [yMax, 0],
            }),
          [yMax, data]
        );

        return (
          <svg width={width} height={height} className="visx-bars">
            <GradientTealBlue id="bar-bg" />
            <rect width={width} height={height} fill="url(#bar-bg)" rx={16} />
            <Group top={60} left={16}>
              {data.map((d) => {
                const barWidth = xScale.bandwidth();
                const barHeight = yMax - yScale(d.frequency);
                const barX = xScale(d.letter);
                const barY = yMax - barHeight;
                return (
                  <Bar
                    key={`bar-${d.letter}`}
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barHeight}
                    fill="rgba(23, 233, 217, 0.55)"
                    rx={barWidth / 4}
                  />
                );
              })}
            </Group>
          </svg>
        );
      }}
    </ParentSize>
  );
}
```

Key styling touches to keep (mirroring the gallery):
- Rounded background rect + gradient
- Group offsets for margins
- Semi-transparent fills for bars
- `ParentSize` for responsive scaling

## Style Swatches & Components
- **Teal gradient**: `GradientTealBlue`, or reuse CSS linear gradients (#6c5b7b → #f67280).
- **Neutral background**: `#efefef` for blank canvases; add `rx={14}` to soften edges.
- **Tooltip palette**: `rgba(53,71,125,0.8)` with white text, 12–14px fonts, 12px padding.
- **Crosshair strokes**: `#35477d` dashed lines (1px) for hover states.
- **Glyph strokes**: `rgba(33, 33, 33, 0.5)` circles with transparent fills.
- **Hierarchy nodes**: soft purples (#6c5b7b) and corals (#f67280) for fills; navy links (#35477d) retain structure legibility.
- **Portal container**: high `z-index` (≥4000), 8px radius, subtle shadow to keep tooltip chrome readable over charts.

## Recommended Workflow
1. **Start from a gallery recipe** closest to the needed chart type.
2. **Swap data + accessors** for project-specific tables.
3. **Ensure responsive wrapping** via `ParentSize` or explicit width/height props.
4. **Layer gradients, rounded backgrounds, and glyph markers** before tackling custom UI.
5. **Expose small controls (toggles/selects)** so the LLM can surface configuration options in prompts.
6. **Add tooltip & portal support** early—keeps layering predictable in Next/Mantine layouts.
7. **Finish with consistent typography and spacing** (12–14px labels, 8–12px gaps).

## Further Reading
- visx documentation: https://airbnb.io/visx/docs
- Gallery source: “Try it on CodeSandbox” links under each demo
- Integration ideas: combine visx primitives with GSAP/Framer Motion for surrounding UI transitions while letting visx handle chart geometry.
