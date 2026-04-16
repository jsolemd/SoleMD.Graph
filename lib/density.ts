/** App-wide density multiplier. Change this ONE value to rescale the entire UI.
 *  CSS counterpart: --app-density in tokens.css (keep in sync). */
export const APP_DENSITY = 0.8;
const APP_DENSITY_CSS_VAR = "--app-density";
const APP_DENSITY_CSS_VALUE = `var(${APP_DENSITY_CSS_VAR}, ${APP_DENSITY})`;

/** Scale a base pixel value by the density factor for JS-side geometry/state. */
export function densityPx(base: number): number {
  return Math.round(base * APP_DENSITY);
}

/** Density-aware CSS px string for inline styles and CSS custom properties. */
export function densityCssPx(base: number): string {
  return `calc(${base}px * ${APP_DENSITY_CSS_VALUE})`;
}

/** Density-aware CSS shorthand helper (padding, margin, inset, etc.). */
export function densityCssSpace(...values: number[]): string {
  return values.map(densityCssPx).join(" ");
}

/** Density-aware CSS clamp where the px caps scale but viewport ratios stay native. */
export function densityCssClamp(minBase: number, preferred: string, maxBase: number): string {
  return `clamp(${densityCssPx(minBase)}, ${preferred}, ${densityCssPx(maxBase)})`;
}

/** Density-aware 100vw/100vh inset calculation. */
export function densityCssViewportInset(axis: "vw" | "vh", insetBase: number): string {
  return `calc(100${axis} - ${densityCssPx(insetBase)})`;
}

function clampPx(value: number, { minBase, maxBase }: { minBase?: number; maxBase?: number } = {}) {
  const min = minBase == null ? Number.NEGATIVE_INFINITY : densityPx(minBase);
  const max = maxBase == null ? Number.POSITIVE_INFINITY : densityPx(maxBase);
  return Math.min(max, Math.max(min, value));
}

/** Generic floating-panel fallback width. */
export const DEFAULT_PANEL_BASE_WIDTH_PX = 300;
export const DEFAULT_PANEL_WIDTH_PX = densityPx(DEFAULT_PANEL_BASE_WIDTH_PX);

/** Viewport-ratio width with density-aware min/max caps. */
export function densityViewportWidth(
  viewportWidth: number,
  ratio: number,
  { minBase, maxBase }: { minBase?: number; maxBase?: number } = {},
): number {
  return clampPx(Math.floor(viewportWidth * ratio), { minBase, maxBase });
}

/** Viewport height minus a density-aware inset, with optional min/max caps. */
export function densityViewportHeight(
  viewportHeight: number,
  {
    subtractBase,
    ratio,
    minBase,
    maxBase,
  }: {
    subtractBase?: number;
    ratio?: number;
    minBase?: number;
    maxBase?: number;
  },
): number {
  const rawValue = subtractBase == null
    ? Math.floor(viewportHeight * (ratio ?? 1))
    : viewportHeight - densityPx(subtractBase);
  return clampPx(rawValue, { minBase, maxBase });
}

/** Unscaled shell geometry — shared source for JS layout math. */
export const APP_CHROME_BASE_PX = {
  edgeMargin: 12,
  panelGap: 12,
  panelMargin: 24,
  /** BrandWordmarkButton rendered height — Tailwind-sized (text-[1.35rem] + py-1.5),
   *  so effectively density-unscaled. Kept at the density-1.0 value so the
   *  density-scaled panelTop below still clears the brand at any density. */
  brandHeight: 48,
  /** Top dock position for floating panels — slotted just below the brand wordmark.
   *  Derived: edgeMargin (top gap) + brandHeight + panelGap (below brand) = 72.
   *  Previous value (116) accounted for the deprecated panel-icon row that used
   *  to sit under the brand; those icons now live in the top-right pill. */
  panelTop: 12 + 48 + 12,
  floatingViewportInset: 24,
  floatingHeightInset: 120,
  toolbarBase: 12,
  toolbarIcon: 34,
  toolbarGap: 8,
  timelineHeight: 44,
  detailPanelWidth: 380,
  wikiExpandedTopInset: 24,
  wikiExpandedViewportInset: 48,
  wikiOverlayInset: 80,
  overlayBlur: 24,
} as const;

/** Shell and floating-layout geometry. Keep JS layout math routed through these. */
export const APP_CHROME_PX = {
  edgeMargin: densityPx(APP_CHROME_BASE_PX.edgeMargin),
  panelGap: densityPx(APP_CHROME_BASE_PX.panelGap),
  panelMargin: densityPx(APP_CHROME_BASE_PX.panelMargin),
  panelTop: densityPx(APP_CHROME_BASE_PX.panelTop),
  floatingViewportInset: densityPx(APP_CHROME_BASE_PX.floatingViewportInset),
  floatingHeightInset: densityPx(APP_CHROME_BASE_PX.floatingHeightInset),
  toolbarBase: densityPx(APP_CHROME_BASE_PX.toolbarBase),
  toolbarIcon: densityPx(APP_CHROME_BASE_PX.toolbarIcon),
  toolbarGap: densityPx(APP_CHROME_BASE_PX.toolbarGap),
  timelineHeight: densityPx(APP_CHROME_BASE_PX.timelineHeight),
  detailPanelWidth: densityPx(APP_CHROME_BASE_PX.detailPanelWidth),
  wikiExpandedTopInset: densityPx(APP_CHROME_BASE_PX.wikiExpandedTopInset),
  wikiExpandedViewportInset: densityPx(APP_CHROME_BASE_PX.wikiExpandedViewportInset),
  wikiOverlayInset: densityPx(APP_CHROME_BASE_PX.wikiOverlayInset),
  overlayBlur: densityPx(APP_CHROME_BASE_PX.overlayBlur),
} as const;

/** Docked panel widths. Any new docked panel should register here. */
export const PANEL_DOCK_WIDTH_BASE_PX = {
  about: 320,
  config: 300,
  filters: 300,
  info: 320,
  query: 420,
  wiki: 820,
} as const;

export const PANEL_DOCK_WIDTH_PX = {
  about: densityPx(PANEL_DOCK_WIDTH_BASE_PX.about),
  config: densityPx(PANEL_DOCK_WIDTH_BASE_PX.config),
  filters: densityPx(PANEL_DOCK_WIDTH_BASE_PX.filters),
  info: densityPx(PANEL_DOCK_WIDTH_BASE_PX.info),
  query: densityPx(PANEL_DOCK_WIDTH_BASE_PX.query),
  wiki: densityPx(PANEL_DOCK_WIDTH_BASE_PX.wiki),
} as const;

/** Elastic dock minimum widths — floor each panel shrinks to before the
 *  overflow fallback (right-align rightmost, allow overlap) kicks in. */
export const PANEL_DOCK_MIN_BASE_PX = {
  about: 240,
  config: 240,
  filters: 260,
  info: 260,
  query: 320,
  wiki: 360,
} as const;

export const PANEL_DOCK_MIN_PX = {
  about: densityPx(PANEL_DOCK_MIN_BASE_PX.about),
  config: densityPx(PANEL_DOCK_MIN_BASE_PX.config),
  filters: densityPx(PANEL_DOCK_MIN_BASE_PX.filters),
  info: densityPx(PANEL_DOCK_MIN_BASE_PX.info),
  query: densityPx(PANEL_DOCK_MIN_BASE_PX.query),
  wiki: densityPx(PANEL_DOCK_MIN_BASE_PX.wiki),
} as const;

/** Wiki-specific floating and expanded panel geometry.
 *  `baseWidth` is the single square-side constant used by
 *  `resolveWikiPanelGeometry` for both graph home and wiki-page widths —
 *  keeps width invariant across graph ↔ page navigation.
 *  `routeGraphWidthMax` is kept as a legacy alias for existing tests. */
export const WIKI_PANEL_BASE_PX = {
  maxWidth: 1200,
  expandedWidthMax: 1080,
  baseWidth: 820,
  routeGraphWidthMax: 820,
  routeGraphHeight: 820,
  routeGraphMinHeight: 520,
  routeGraphMaxHeight: 960,
  contentMinHeight: 400,
  localGraphWidth: 320,
  moduleWidth: 900,
  globalGraphWidth: 960,
  globalGraphHeight: 720,
} as const;

export const WIKI_PANEL_PX = {
  maxWidth: densityPx(WIKI_PANEL_BASE_PX.maxWidth),
  expandedWidthMax: densityPx(WIKI_PANEL_BASE_PX.expandedWidthMax),
  baseWidth: densityPx(WIKI_PANEL_BASE_PX.baseWidth),
  routeGraphWidthMax: densityPx(WIKI_PANEL_BASE_PX.routeGraphWidthMax),
  routeGraphHeight: densityPx(WIKI_PANEL_BASE_PX.routeGraphHeight),
  routeGraphMinHeight: densityPx(WIKI_PANEL_BASE_PX.routeGraphMinHeight),
  routeGraphMaxHeight: densityPx(WIKI_PANEL_BASE_PX.routeGraphMaxHeight),
  contentMinHeight: densityPx(WIKI_PANEL_BASE_PX.contentMinHeight),
  localGraphWidth: densityPx(WIKI_PANEL_BASE_PX.localGraphWidth),
  moduleWidth: densityPx(WIKI_PANEL_BASE_PX.moduleWidth),
  globalGraphWidth: densityPx(WIKI_PANEL_BASE_PX.globalGraphWidth),
  globalGraphHeight: densityPx(WIKI_PANEL_BASE_PX.globalGraphHeight),
} as const;
