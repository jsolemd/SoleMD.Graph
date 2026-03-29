import { create } from 'zustand'

import { createPanelSlice } from './slices/panel-slice'
import { createConfigSlice } from './slices/config-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createGeoSlice } from './slices/geo-slice'
import { createTimelineSlice } from './slices/timeline-slice'
import { createLinksSlice } from './slices/links-slice'
import { createVisibilitySlice } from './slices/visibility-slice'

import type { PanelSlice } from './slices/panel-slice'
import type { ConfigSlice } from './slices/config-slice'
import type { SelectionSlice } from './slices/selection-slice'
import type { GeoSlice } from './slices/geo-slice'
import type { TimelineSlice } from './slices/timeline-slice'
import type { LinksSlice } from './slices/links-slice'
import type { VisibilitySlice } from './slices/visibility-slice'

/* ───── Convenience re-exports ───── */

export type { ActivePanel, MapControls } from './slices/panel-slice'
export type { TableView, InfoScopeMode } from './slices/config-slice'
export type { GeoSelection } from './slices/geo-slice'

/* ───── Composite state type ───── */

export type DashboardState =
  PanelSlice &
  ConfigSlice &
  SelectionSlice &
  GeoSlice &
  TimelineSlice &
  LinksSlice &
  VisibilitySlice

/* ───── Clearance selectors ─────
 * Single source of truth for bottom/left space occupied by docked elements.
 * Any positioned element that sits above/beside the dock reads these.
 */

/** Height constants for bottom-docked elements. */
const BOTTOM_DOCK = {
  timeline: 44,
  toolbarIcon: 34,
  toolbarBase: 12,
  gap: 8,
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
const PANEL_WIDTHS: Record<string, number> = {
  about: 320,
  config: 300,
  filters: 300,
  info: 320,
  query: 420,
};
const PANEL_MARGIN = 24; // panel left (12) + gap (12)

/** Total px of left-edge space occupied by an open panel. */
export function selectLeftClearance(s: DashboardState): number {
  if (!s.activePanel) return 0;
  // About panel renders regardless of panelsVisible
  if (s.activePanel === 'about') return PANEL_WIDTHS.about + PANEL_MARGIN;
  if (!s.panelsVisible) return 0;
  return (PANEL_WIDTHS[s.activePanel] ?? 300) + PANEL_MARGIN;
}

/** Right-side detail panel: width (380) + margin (12 + 12). */
const DETAIL_PANEL_CLEARANCE = 380 + PANEL_MARGIN;

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
  ...createGeoSlice(...a),
  ...createTimelineSlice(...a),
  ...createLinksSlice(...a),
  ...createVisibilitySlice(...a),
}))
