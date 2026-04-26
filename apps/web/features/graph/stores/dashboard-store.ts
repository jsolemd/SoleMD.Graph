import { create } from 'zustand'

import { createPanelSlice } from './slices/panel-slice'
import { createConfigSlice } from './slices/config-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createTimelineSlice } from './slices/timeline-slice'
import { createLinksSlice } from './slices/links-slice'
import { createVisibilitySlice } from './slices/visibility-slice'
import { createSqlExplorerSlice } from './slices/sql-explorer-slice'
import { createRagSlice } from './slices/rag-slice'
import { createViewSlice } from './slices/view-slice'

import type { PanelSlice } from './slices/panel-slice'
import type { ConfigSlice } from './slices/config-slice'
import type { SelectionSlice } from './slices/selection-slice'
import type { TimelineSlice } from './slices/timeline-slice'
import type { LinksSlice } from './slices/links-slice'
import type { VisibilitySlice } from './slices/visibility-slice'
import type { SqlExplorerSlice } from './slices/sql-explorer-slice'
import type { RagSlice } from './slices/rag-slice'
import type { ViewSlice } from './slices/view-slice'
import {
  APP_CHROME_BASE_PX,
  APP_CHROME_PX,
  DEFAULT_PANEL_WIDTH_PX,
  densityViewportHeight,
  densityViewportWidth,
  PANEL_DOCK_MIN_PX,
  PANEL_DOCK_WIDTH_BASE_PX,
  PANEL_DOCK_WIDTH_PX,
  WIKI_PANEL_BASE_PX,
  WIKI_PANEL_PX,
} from '@/lib/density'
import {
  BOTTOM_BASE,
  PROMPT_FALLBACK_NORMAL_HEIGHT,
} from '@/features/graph/components/panels/prompt/constants'

/* ───── Convenience re-exports ───── */

export type { ActivePanel, PanelId, PromptMode } from './slices/panel-slice'
export type { TableView } from './slices/config-slice'
export type { RendererMode } from './slices/view-slice'

/* ───── Composite state type ───── */

export type DashboardState =
  PanelSlice &
  ConfigSlice &
  SelectionSlice &
  TimelineSlice &
  LinksSlice &
  VisibilitySlice &
  SqlExplorerSlice &
  RagSlice &
  ViewSlice

/* ───── Clearance selectors ─────
 * Single source of truth for bottom/left space occupied by docked elements.
 * Any positioned element that sits above/beside the dock reads these.
 */

/** Height constants for bottom-docked elements. */
const BOTTOM_DOCK = {
  timeline: APP_CHROME_PX.timelineHeight,
  toolbarIcon: APP_CHROME_PX.toolbarIcon,
  toolbarBase: APP_CHROME_PX.toolbarBase,
  gap: APP_CHROME_PX.toolbarGap,
} as const;

/**
 * Canvas-level bottom obstacles (timeline + data table).
 * Elements that sit AT the bottom dock level (collapsed pill, toolbar) use this.
 */
export function selectBottomObstacles(s: DashboardState): number {
  let total = 0;
  if (s.showTimeline) total += BOTTOM_DOCK.timeline;
  if (s.tableOpen) total += s.tableHeight;
  return total;
}

/**
 * Full bottom clearance including toolbar icons.
 * Elements that float ABOVE the bottom dock (PromptBox normal/write, legends) use this.
 */
export function selectBottomClearance(s: DashboardState): number {
  let total = selectBottomObstacles(s);
  if (s.panelsVisible) total += BOTTOM_DOCK.toolbarBase + BOTTOM_DOCK.toolbarIcon + BOTTOM_DOCK.gap;
  return total;
}

/**
 * Bottom clearance for docked, unpinned panels — the base clearance plus the
 * space reserved by the prompt card. Docked-by-default panels clamp against
 * this so their bottom edge stops above the prompt instead of overlapping it.
 * Pinned panels and panels the user has explicitly dragged are exempt — they
 * keep using {@link selectBottomClearance} so a deliberate placement wins.
 */
export function selectDockedBottomClearance(
  s: DashboardState,
  viewportHeight: number,
): number {
  const base = selectBottomClearance(s);
  if (viewportHeight <= 0) return base;
  // promptTopY is the prompt card's top Y in viewport coords. The space the
  // panel must leave clear = (viewport bottom ↔ prompt top) + a panel gap.
  const measured = s.promptTopY > 0
    ? Math.max(0, viewportHeight - s.promptTopY) + APP_CHROME_PX.panelGap
    : 0;
  // Frame-1 fallback: ResizeObserver hasn't published promptTopY yet, but we
  // still need to reserve enough space for the normal-mode prompt so the
  // initial paint doesn't overshoot and then shrink.
  const fallback = BOTTOM_BASE + PROMPT_FALLBACK_NORMAL_HEIGHT + APP_CHROME_PX.panelGap;
  return Math.max(base, measured, fallback);
}

/** Width of each left-side panel — must match PanelShell `width` props. */
export const PANEL_WIDTHS: Record<string, number> = PANEL_DOCK_WIDTH_PX;
export const PANEL_EDGE_MARGIN = APP_CHROME_PX.edgeMargin;
export const PANEL_GAP = APP_CHROME_PX.panelGap;
const PANEL_MARGIN = APP_CHROME_PX.panelMargin;

/**
 * Fixed dock order — determines stacking when multiple panels are docked.
 * Panels earlier in the list sit closer to the left edge.
 */
export const PANEL_DOCK_ORDER: readonly string[] = ['about', 'config', 'filters', 'info', 'query', 'wiki'];

/** Pure wiki width computation — legacy helper kept for existing tests.
 *  Prefer `resolveWikiPanelGeometry` for new call sites; it understands the
 *  graph-route square and shares its formula with the dock. */
export function resolveWikiPanelWidth(viewportWidth: number, expanded: boolean): number {
  return expanded
    ? densityViewportWidth(viewportWidth, 0.70, {
        minBase: PANEL_DOCK_WIDTH_BASE_PX.wiki,
        maxBase: WIKI_PANEL_BASE_PX.expandedWidthMax,
      })
    : PANEL_WIDTHS.wiki;
}

export interface WikiPanelGeometry {
  width: number;
  height: number;
  minHeight: number;
  maxHeight?: number;
}

interface WikiGeometryState {
  wikiRouteIsGraph: boolean;
  wikiExpanded: boolean;
}

/** Single source of truth for wiki panel geometry across dock reservation
 *  and rendered panel. Width stays constant from graph home to wiki page so
 *  route flips don't move the width edge; graph home is a real square
 *  (`width === height`) until the viewport clamps it. */
export function resolveWikiPanelGeometry(
  viewportWidth: number,
  viewportHeight: number,
  s: WikiGeometryState,
  dockedBottomClearance: number = 0,
): WikiPanelGeometry {
  // Width shared by graph home and wiki page: the square side, clamped to
  // the viewport minus edge margins, floored by the graph-route min side.
  const base = Math.min(
    WIKI_PANEL_PX.baseWidth,
    Math.max(
      WIKI_PANEL_PX.routeGraphMinHeight,
      viewportWidth - 2 * PANEL_EDGE_MARGIN,
    ),
  );

  // Docked ceiling: the viewport height minus the panel top and any space
  // reserved by the prompt/toolbar/timeline/data-table below. Floored by the
  // graph-route min so the panel never collapses past its viz floor.
  const allowedDockedHeight = Math.max(
    WIKI_PANEL_PX.routeGraphMinHeight,
    viewportHeight - APP_CHROME_PX.panelTop - dockedBottomClearance - APP_CHROME_PX.edgeMargin,
  );

  if (s.wikiExpanded) {
    const natural = densityViewportHeight(viewportHeight, {
      subtractBase: APP_CHROME_BASE_PX.wikiExpandedViewportInset,
      minBase: WIKI_PANEL_BASE_PX.contentMinHeight,
    });
    return {
      width: resolveWikiPanelWidth(viewportWidth, true),
      height: Math.min(natural, allowedDockedHeight),
      minHeight: WIKI_PANEL_PX.contentMinHeight,
      maxHeight: allowedDockedHeight,
    };
  }

  if (s.wikiRouteIsGraph) {
    return {
      width: base,
      height: base, // real square
      minHeight: WIKI_PANEL_PX.routeGraphMinHeight,
      maxHeight: WIKI_PANEL_PX.routeGraphMaxHeight,
    };
  }

  // Wiki page: width matches graph home so route flips don't move the edge;
  // height fills the available viewport below the panel top, clamped so the
  // bottom edge never crosses the prompt.
  const natural = densityViewportHeight(viewportHeight, {
    subtractBase: APP_CHROME_BASE_PX.panelTop * 2,
    minBase: WIKI_PANEL_BASE_PX.contentMinHeight,
  });
  return {
    width: base,
    height: Math.min(natural, allowedDockedHeight),
    minHeight: WIKI_PANEL_PX.contentMinHeight,
    maxHeight: allowedDockedHeight,
  };
}

/** Preferred (user-intent) width of a panel. Wiki always goes through
 *  `resolveWikiPanelGeometry` so the dock reservation matches what the
 *  panel actually renders — no publish/subscribe, no frame-1 disagreement,
 *  no stored-width drift across routes. */
function resolvePreferredPanelWidth(
  panelId: string,
  s: DashboardState,
  viewportWidth: number,
): number {
  if (panelId === 'wiki') {
    // Width-only: the viewportHeight/clearance path is unused for dock width
    // math. Pass the base clearance as a conservative default in case future
    // geometry changes couple width to the bottom budget.
    return resolveWikiPanelGeometry(viewportWidth, 0, s, selectBottomClearance(s)).width;
  }
  const stored = s.panelPositions[panelId]?.preferredWidth;
  if (stored != null && Number.isFinite(stored)) return stored;
  return PANEL_WIDTHS[panelId] ?? DEFAULT_PANEL_WIDTH_PX;
}

/** Minimum width a docked panel shrinks to before the overflow fallback. */
function resolveMinPanelWidth(panelId: string): number {
  return PANEL_DOCK_MIN_PX[panelId as keyof typeof PANEL_DOCK_MIN_PX]
    ?? Math.min(DEFAULT_PANEL_WIDTH_PX, PANEL_WIDTHS[panelId] ?? DEFAULT_PANEL_WIDTH_PX);
}

/** Is a panel docked (open, visible, not dragged away)? */
function isPanelDocked(panelId: string, s: DashboardState): boolean {
  if (!s.openPanels[panelId as keyof typeof s.openPanels]) return false;
  // About panel renders regardless of panelsVisible
  if (panelId !== 'about' && !s.panelsVisible) return false;
  // Floating (dragged away) panels don't reserve dock space
  if (panelId in s.floatingObstacles) return false;
  return true;
}

/* ───── Elastic dock layout ─────
 * Single source of truth: computes each docked panel's rendered width and
 * left offset given viewport width. Pinned panels keep `preferredWidth`;
 * unpinned panels shrink (last-in-order first) down to `minWidth`. If the
 * min-sum still exceeds the budget, all panels clamp to min and the
 * rightmost right-aligns so nothing leaves the viewport.
 */

export interface DockedLayout {
  widths: Record<string, number>;
  offsets: Record<string, number>;
  dockedIds: readonly string[];
}

interface LayoutCacheKey {
  openPanels: DashboardState['openPanels'];
  panelsVisible: boolean;
  floatingObstacles: DashboardState['floatingObstacles'];
  panelPositions: DashboardState['panelPositions'];
  wikiExpanded: boolean;
  wikiRouteIsGraph: boolean;
  viewportWidth: number;
}

let layoutCache: { key: LayoutCacheKey; result: DockedLayout } | null = null;

function sameLayoutKey(a: LayoutCacheKey, b: LayoutCacheKey): boolean {
  return a.openPanels === b.openPanels
    && a.panelsVisible === b.panelsVisible
    && a.floatingObstacles === b.floatingObstacles
    && a.panelPositions === b.panelPositions
    && a.wikiExpanded === b.wikiExpanded
    && a.wikiRouteIsGraph === b.wikiRouteIsGraph
    && a.viewportWidth === b.viewportWidth;
}

export function computeDockedLayout(
  s: DashboardState,
  viewportWidth: number = Number.POSITIVE_INFINITY,
): DockedLayout {
  const key: LayoutCacheKey = {
    openPanels: s.openPanels,
    panelsVisible: s.panelsVisible,
    floatingObstacles: s.floatingObstacles,
    panelPositions: s.panelPositions,
    wikiExpanded: s.wikiExpanded,
    wikiRouteIsGraph: s.wikiRouteIsGraph,
    viewportWidth,
  };
  if (layoutCache && sameLayoutKey(layoutCache.key, key)) {
    return layoutCache.result;
  }

  const dockedIds = PANEL_DOCK_ORDER.filter((id) => isPanelDocked(id, s));
  const widths: Record<string, number> = {};
  const offsets: Record<string, number> = {};

  if (dockedIds.length === 0) {
    const result: DockedLayout = { widths, offsets, dockedIds };
    layoutCache = { key, result };
    return result;
  }

  const count = dockedIds.length;
  const hasBudget = Number.isFinite(viewportWidth);
  const totalBudget = hasBudget
    ? Math.max(0, viewportWidth - 2 * PANEL_EDGE_MARGIN - PANEL_GAP * (count - 1))
    : Number.POSITIVE_INFINITY;

  // Seed each docked panel at its preferred width.
  for (const id of dockedIds) {
    widths[id] = resolvePreferredPanelWidth(id, s, viewportWidth);
  }

  if (hasBudget) {
    let total = 0;
    for (const id of dockedIds) total += widths[id];

    if (total > totalBudget) {
      // Shrink unpinned panels last-in-order first, down to their min.
      let overshoot = total - totalBudget;
      for (let i = dockedIds.length - 1; i >= 0 && overshoot > 0; i--) {
        const id = dockedIds[i];
        if (s.panelPositions[id]?.pinned) continue;
        const min = resolveMinPanelWidth(id);
        const shrinkable = widths[id] - min;
        if (shrinkable <= 0) continue;
        const shrink = Math.min(shrinkable, overshoot);
        widths[id] -= shrink;
        overshoot -= shrink;
      }

      if (overshoot > 0) {
        // Pinned + unpinned mins still exceed the budget. Everyone clamps
        // to min; rightmost right-aligns and may overlap its neighbor.
        for (const id of dockedIds) {
          widths[id] = resolveMinPanelWidth(id);
        }
      }
    }
  }

  // Place pinned panels at their stored leftOffset so they don't shift when
  // siblings open/close. Unpinned panels flow linearly in dock order but skip
  // past pinned regions to avoid overlap.
  const pinnedSlots: Array<{ start: number; end: number }> = [];
  for (const id of dockedIds) {
    const stored = s.panelPositions[id];
    if (stored?.pinned && typeof stored.leftOffset === 'number') {
      offsets[id] = stored.leftOffset;
      pinnedSlots.push({ start: stored.leftOffset, end: stored.leftOffset + widths[id] });
    }
  }
  pinnedSlots.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const id of dockedIds) {
    if (offsets[id] != null) continue; // pinned, already placed
    const w = widths[id];
    // Advance past any pinned region whose footprint (plus gap) would collide.
    let blocked = true;
    while (blocked) {
      blocked = false;
      for (const slot of pinnedSlots) {
        if (cursor < slot.end + PANEL_GAP && cursor + w + PANEL_GAP > slot.start) {
          cursor = slot.end + PANEL_GAP;
          blocked = true;
          break;
        }
      }
    }
    offsets[id] = cursor;
    cursor += w + PANEL_GAP;
  }

  // Overflow fallback: if the rightmost panel's right edge exceeds the
  // viewport right edge, right-pin it. Overlap with previous panel is OK.
  if (hasBudget) {
    const lastId = dockedIds[dockedIds.length - 1];
    const lastRight = PANEL_EDGE_MARGIN + offsets[lastId] + widths[lastId];
    const viewportRight = viewportWidth - PANEL_EDGE_MARGIN;
    if (lastRight > viewportRight) {
      offsets[lastId] = Math.max(0, viewportWidth - PANEL_EDGE_MARGIN - widths[lastId] - PANEL_EDGE_MARGIN);
    }
  }

  const result: DockedLayout = { widths, offsets, dockedIds };
  layoutCache = { key, result };
  return result;
}

/** Rendered width of a panel at the given viewport. Docked panels reflect
 *  the elastic-dock clamp; floating panels get the full viewport ceiling. */
export function selectPanelAvailableWidth(
  s: DashboardState,
  panelId: string,
  viewportWidth: number = Number.POSITIVE_INFINITY,
): number {
  if (panelId in s.floatingObstacles || !PANEL_DOCK_ORDER.includes(panelId)) {
    return Math.max(0, viewportWidth - 2 * PANEL_EDGE_MARGIN);
  }
  const layout = computeDockedLayout(s, viewportWidth);
  const rendered = layout.widths[panelId];
  if (rendered != null) return rendered;
  return Math.max(0, viewportWidth - 2 * PANEL_EDGE_MARGIN);
}

/** Total px of left-edge space occupied by all docked left panels. */
export function selectLeftClearance(
  s: DashboardState,
  viewportWidth: number = Number.POSITIVE_INFINITY,
): number {
  const layout = computeDockedLayout(s, viewportWidth);
  let total = 0;
  for (const id of layout.dockedIds) {
    total += layout.widths[id] + PANEL_MARGIN;
  }
  return total;
}

/**
 * Left offset for a specific panel — sum of all docked panels before it in
 * dock order, using rendered widths from the elastic layout.
 */
export function selectPanelLeftOffset(
  s: DashboardState,
  panelId: string,
  viewportWidth: number = Number.POSITIVE_INFINITY,
): number {
  if (!PANEL_DOCK_ORDER.includes(panelId)) {
    return 0;
  }
  const layout = computeDockedLayout(s, viewportWidth);
  return layout.offsets[panelId] ?? 0;
}

export interface PanelAnchorRect {
  left: number;
  top: number;
  width: number;
}

export function resolvePanelAnchorRect(
  s: DashboardState,
  panelId: string,
  panelTop: number,
  viewportWidth: number = Number.POSITIVE_INFINITY,
): PanelAnchorRect | null {
  const floating = s.floatingObstacles[panelId];
  if (floating) {
    return {
      left: floating.x,
      top: floating.y,
      width: floating.width,
    };
  }

  if (!isPanelDocked(panelId, s)) {
    return null;
  }

  const layout = computeDockedLayout(s, viewportWidth);
  const width = layout.widths[panelId] ?? resolvePreferredPanelWidth(panelId, s, viewportWidth);
  const offset = layout.offsets[panelId] ?? 0;

  return {
    left: PANEL_EDGE_MARGIN + offset,
    top: panelTop,
    width,
  };
}

export function resolveCenteredFloatingPanelOffsets(args: {
  state: DashboardState;
  panelId: string;
  panelWidth: number;
  panelHeight: number;
  panelTop: number;
  viewportWidth: number;
  viewportHeight: number;
}): { x: number; y: number } {
  const {
    state,
    panelId,
    panelWidth,
    panelHeight,
    panelTop,
    viewportWidth,
    viewportHeight,
  } = args;

  const dockLeft = PANEL_EDGE_MARGIN + selectPanelLeftOffset(state, panelId, viewportWidth);
  const desiredLeft = Math.max(
    PANEL_EDGE_MARGIN,
    Math.round((viewportWidth - panelWidth) / 2),
  );
  const desiredTop = Math.max(
    panelTop,
    Math.round((viewportHeight - panelHeight) / 2),
  );

  return {
    x: desiredLeft - dockLeft,
    y: Math.max(0, desiredTop - panelTop),
  };
}

export function resolveAdjacentFloatingPanelOffsets(args: {
  state: DashboardState;
  panelId: string;
  anchorRect: PanelAnchorRect;
  panelWidth: number;
  panelTop: number;
  viewportWidth: number;
}): { x: number; y: number } {
  const {
    state,
    panelId,
    anchorRect,
    panelWidth,
    panelTop,
    viewportWidth,
  } = args;

  const dockLeft = PANEL_EDGE_MARGIN + selectPanelLeftOffset(state, panelId, viewportWidth);
  const maxLeft = Math.max(PANEL_EDGE_MARGIN, viewportWidth - panelWidth - PANEL_EDGE_MARGIN);
  const desiredLeft = Math.min(anchorRect.left + anchorRect.width + PANEL_GAP, maxLeft);

  return {
    x: Math.max(PANEL_EDGE_MARGIN, desiredLeft) - dockLeft,
    y: Math.max(0, anchorRect.top - panelTop),
  };
}

/** Right-side detail panel: scaled width + scaled dock margin. */
const DETAIL_PANEL_CLEARANCE = APP_CHROME_PX.detailPanelWidth + PANEL_MARGIN;

/** Total px of right-edge space occupied by the detail panel. */
export function selectRightClearance(s: DashboardState): number {
  // DetailPanel renders when a node is selected — it's outside the panel toggle system,
  // so we check panelBottomY.right which PanelShell reports for side="right".
  if (s.panelBottomY.right === 0) return 0;
  return DETAIL_PANEL_CLEARANCE;
}

/* ───── Store ───── */

export const useDashboardStore = create<DashboardState>((...a) => ({
  ...createPanelSlice(...a),
  ...createConfigSlice(...a),
  ...createSelectionSlice(...a),
  ...createTimelineSlice(...a),
  ...createLinksSlice(...a),
  ...createVisibilitySlice(...a),
  ...createSqlExplorerSlice(...a),
  ...createRagSlice(...a),
  ...createViewSlice(...a),
}))
