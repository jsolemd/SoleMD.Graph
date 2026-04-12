import { create } from 'zustand'

import { createPanelSlice } from './slices/panel-slice'
import { createConfigSlice } from './slices/config-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createTimelineSlice } from './slices/timeline-slice'
import { createLinksSlice } from './slices/links-slice'
import { createVisibilitySlice } from './slices/visibility-slice'
import { createSqlExplorerSlice } from './slices/sql-explorer-slice'
import { createRagSlice } from './slices/rag-slice'

import type { PanelSlice } from './slices/panel-slice'
import type { ConfigSlice } from './slices/config-slice'
import type { SelectionSlice } from './slices/selection-slice'
import type { TimelineSlice } from './slices/timeline-slice'
import type { LinksSlice } from './slices/links-slice'
import type { VisibilitySlice } from './slices/visibility-slice'
import type { SqlExplorerSlice } from './slices/sql-explorer-slice'
import type { RagSlice } from './slices/rag-slice'
import {
  APP_CHROME_PX,
  DEFAULT_PANEL_WIDTH_PX,
  densityViewportWidth,
  PANEL_DOCK_WIDTH_BASE_PX,
  PANEL_DOCK_WIDTH_PX,
  WIKI_PANEL_BASE_PX,
} from '@/lib/density'

/* ───── Convenience re-exports ───── */

export type { ActivePanel, PanelId, PromptMode } from './slices/panel-slice'
export type { TableView } from './slices/config-slice'

/* ───── Composite state type ───── */

export type DashboardState =
  PanelSlice &
  ConfigSlice &
  SelectionSlice &
  TimelineSlice &
  LinksSlice &
  VisibilitySlice &
  SqlExplorerSlice &
  RagSlice

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

/** Pure wiki width computation — reusable in selector and components. */
export function resolveWikiPanelWidth(viewportWidth: number, expanded: boolean): number {
  return expanded
    ? densityViewportWidth(viewportWidth, 0.70, {
        minBase: PANEL_DOCK_WIDTH_BASE_PX.wiki,
        maxBase: WIKI_PANEL_BASE_PX.expandedWidthMax,
      })
    : PANEL_WIDTHS.wiki;
}

/** Resolve the effective width of a panel given current state. */
function resolvePanelWidth(panelId: string, s: DashboardState): number {
  if (panelId === 'wiki' && s.wikiExpanded) {
    return s.wikiExpandedWidth ?? PANEL_WIDTHS.wiki;
  }
  return PANEL_WIDTHS[panelId] ?? DEFAULT_PANEL_WIDTH_PX;
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

/** Total px of left-edge space occupied by all docked left panels. */
export function selectLeftClearance(s: DashboardState): number {
  let total = 0;
  for (const panelId of PANEL_DOCK_ORDER) {
    if (isPanelDocked(panelId, s)) {
      total += resolvePanelWidth(panelId, s) + PANEL_MARGIN;
    }
  }
  return total;
}

/**
 * Left offset for a specific panel — sum of all docked panels before it in dock order.
 * Used by FloatingPanelShell to position panels beside each other.
 */
export function selectPanelLeftOffset(s: DashboardState, panelId: string): number {
  if (!PANEL_DOCK_ORDER.includes(panelId)) {
    return 0;
  }

  let offset = 0;
  for (const id of PANEL_DOCK_ORDER) {
    if (id === panelId) break;
    if (isPanelDocked(id, s)) {
      offset += resolvePanelWidth(id, s) + PANEL_GAP;
    }
  }
  return offset;
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

  return {
    left: PANEL_EDGE_MARGIN + selectPanelLeftOffset(s, panelId),
    top: panelTop,
    width: s.panelPositions[panelId]?.width ?? resolvePanelWidth(panelId, s),
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

  const dockLeft = PANEL_EDGE_MARGIN + selectPanelLeftOffset(state, panelId);
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

  const dockLeft = PANEL_EDGE_MARGIN + selectPanelLeftOffset(state, panelId);
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
}))
