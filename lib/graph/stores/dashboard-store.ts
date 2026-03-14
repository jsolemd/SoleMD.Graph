import { create } from 'zustand'
import { getColumnMeta } from '../columns'
import type { InfoWidgetSlot } from '../info-widgets'
import { getLayerConfig } from '../layers'
import type {
  ColorSchemeName,
  DataColumnKey,
  FilterableColumnKey,
  MapLayer,
  NumericColumnKey,
  PointColorStrategy,
  PointSizeStrategy,
  SizeColumnKey,
} from '../types'

/** Curated default filters — one per concept, no redundant pairs. */
const CHUNK_FILTER_COLUMNS: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }> = [
  { column: 'clusterLabel', type: 'categorical' },
  { column: 'journal', type: 'categorical' },
  { column: 'sectionCanonical', type: 'categorical' },
  { column: 'chunkKind', type: 'categorical' },
  { column: 'year', type: 'numeric' },
]

const PAPER_FILTER_COLUMNS: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }> = [
  { column: 'clusterLabel' as FilterableColumnKey, type: 'categorical' },
  { column: 'journal' as FilterableColumnKey, type: 'categorical' },
  { column: 'year' as FilterableColumnKey, type: 'numeric' },
]

const GEO_FILTER_COLUMNS: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }> = [
  { column: 'clusterLabel' as FilterableColumnKey, type: 'categorical' },
  { column: 'year' as FilterableColumnKey, type: 'numeric' },
]

function getDefaultFiltersForLayer(layer: MapLayer) {
  if (layer === 'paper') return PAPER_FILTER_COLUMNS
  if (layer === 'geo') return GEO_FILTER_COLUMNS
  return CHUNK_FILTER_COLUMNS
}

export type ActivePanel = 'about' | 'config' | 'filters' | 'info' | 'query' | null
export type TableView = 'current' | 'selected'
export type InfoScopeMode = 'current' | 'selected' | 'dataset'

interface DashboardState {
  // Layer
  activeLayer: MapLayer
  availableLayers: MapLayer[]

  // Panel visibility
  activePanel: ActivePanel
  panelsVisible: boolean
  panelBottomY: { left: number; right: number }
  tableOpen: boolean
  tableHeight: number
  uiHidden: boolean

  // Config: Points
  pointColorColumn: DataColumnKey | 'hexColor'
  pointColorStrategy: PointColorStrategy
  pointSizeColumn: SizeColumnKey
  pointSizeRange: [number, number]
  pointLabelColumn: DataColumnKey
  showPointLabels: boolean
  showDynamicLabels: boolean
  positionXColumn: NumericColumnKey
  positionYColumn: NumericColumnKey

  // Info widgets — user-configurable insight slots in the info panel
  infoWidgets: InfoWidgetSlot[]

  // Filters — which widgets to show (selection state lives inside Cosmograph crossfilter)
  filterColumns: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }>

  // Table
  tablePage: number
  tablePageSize: number
  tableView: TableView
  infoScopeMode: InfoScopeMode

  // Color scheme
  colorScheme: ColorSchemeName
  showColorLegend: boolean

  // Sizing
  pointSizeStrategy: PointSizeStrategy
  scalePointsOnZoom: boolean
  showSizeLegend: boolean

  // Hover & interaction
  showHoveredPointLabel: boolean
  renderHoveredPointRing: boolean

  // Selection behavior
  /** When true, clicking a point selects it AND all connected points (via links). */
  connectedSelect: boolean

  // Links
  renderLinks: boolean
  linkOpacity: number
  linkGreyoutOpacity: number
  linkVisibilityDistanceRange: [number, number]
  linkVisibilityMinTransparency: number
  linkDefaultWidth: number
  curvedLinks: boolean
  linkDefaultArrows: boolean
  scaleLinksOnZoom: boolean

  // Timeline
  showTimeline: boolean
  timelineColumn: NumericColumnKey
  timelineSelection?: [number, number]

  // Prompt size: minimized (pill) / normal / maximized (full-height)
  promptMinimized: boolean
  promptMaximized: boolean

  // Write mode
  writeContent: string

  // Crossfilter state mirrored from Cosmograph callbacks:
  // current working set, persistent selection intent, and current canvas highlight.
  currentPointIndices: number[] | null
  selectedPointIndices: number[]
  highlightedPointIndices: number[]
  activeSelectionSourceId: string | null
  lockedSelection: Set<number> | null

  // Actions
  setActivePanel: (panel: ActivePanel) => void
  togglePanel: (panel: ActivePanel) => void
  setPanelsVisible: (visible: boolean) => void
  setPanelBottomY: (side: 'left' | 'right', y: number) => void
  togglePanelsVisible: () => void
  setTableOpen: (open: boolean) => void
  toggleTable: () => void
  setTableHeight: (height: number) => void
  setUiHidden: (hidden: boolean) => void
  toggleUiHidden: () => void
  setPointColorColumn: (col: DataColumnKey | 'hexColor') => void
  setPointColorStrategy: (strategy: PointColorStrategy) => void
  setPointSizeColumn: (col: SizeColumnKey) => void
  setPointSizeRange: (range: [number, number]) => void
  setPointLabelColumn: (col: DataColumnKey) => void
  setShowPointLabels: (show: boolean) => void
  setShowDynamicLabels: (show: boolean) => void
  setPositionXColumn: (col: NumericColumnKey) => void
  setPositionYColumn: (col: NumericColumnKey) => void
  addInfoWidget: (slot: InfoWidgetSlot) => void
  removeInfoWidget: (column: string) => void
  addFilter: (column: FilterableColumnKey) => void
  removeFilter: (column: FilterableColumnKey) => void
  setTablePage: (page: number) => void
  setTablePageSize: (size: number) => void
  setTableView: (view: TableView) => void
  setInfoScopeMode: (mode: InfoScopeMode) => void
  setColorScheme: (scheme: ColorSchemeName) => void
  setShowColorLegend: (show: boolean) => void
  setPointSizeStrategy: (strategy: PointSizeStrategy) => void
  setScalePointsOnZoom: (scale: boolean) => void
  setShowSizeLegend: (show: boolean) => void
  setShowHoveredPointLabel: (show: boolean) => void
  setRenderHoveredPointRing: (show: boolean) => void
  setConnectedSelect: (on: boolean) => void
  toggleConnectedSelect: () => void
  setRenderLinks: (show: boolean) => void
  setLinkOpacity: (opacity: number) => void
  setLinkGreyoutOpacity: (opacity: number) => void
  setLinkVisibilityDistanceRange: (range: [number, number]) => void
  setLinkVisibilityMinTransparency: (transparency: number) => void
  setLinkDefaultWidth: (width: number) => void
  setCurvedLinks: (curved: boolean) => void
  setLinkDefaultArrows: (arrows: boolean) => void
  setScaleLinksOnZoom: (scale: boolean) => void
  setShowTimeline: (show: boolean) => void
  toggleTimeline: () => void
  setTimelineColumn: (col: NumericColumnKey) => void
  setTimelineSelection: (selection?: [number, number]) => void
  setPromptMinimized: (minimized: boolean) => void
  setPromptMaximized: (maximized: boolean) => void
  togglePromptMinimized: () => void
  togglePromptMaximized: () => void
  setWriteContent: (content: string) => void
  setCurrentPointIndices: (indices: number[] | null) => void
  setSelectedPointIndices: (indices: number[]) => void
  setHighlightedPointIndices: (indices: number[]) => void
  setActiveSelectionSourceId: (sourceId: string | null) => void
  lockSelection: () => void
  unlockSelection: () => void
  setActiveLayer: (layer: MapLayer) => void
  setAvailableLayers: (layers: MapLayer[]) => void
}

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
const PANEL_WIDTHS: Record<NonNullable<ActivePanel>, number> = {
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

export const useDashboardStore = create<DashboardState>((set) => ({
  // Layer
  activeLayer: 'chunk',
  availableLayers: ['chunk'],

  // Panel visibility
  activePanel: null,
  panelsVisible: false,
  panelBottomY: { left: 0, right: 0 },
  tableOpen: false,
  tableHeight: 280,
  uiHidden: false,

  // Config defaults
  pointColorColumn: 'clusterLabel',
  pointColorStrategy: 'categorical',
  pointSizeColumn: 'clusterProbability',
  pointSizeRange: [1, 6],
  pointLabelColumn: 'clusterLabel',
  showPointLabels: false,
  showDynamicLabels: false,
  positionXColumn: 'x',
  positionYColumn: 'y',

  // Info widgets — curated defaults per layer; users can add/remove via panel
  infoWidgets: getLayerConfig('chunk').defaultInfoWidgets,

  // Filters — curated defaults; users can add/remove via panel
  filterColumns: CHUNK_FILTER_COLUMNS,

  // Table
  tablePage: 1,
  tablePageSize: 100,
  tableView: 'current',
  infoScopeMode: 'current',

  // Color scheme
  colorScheme: 'default',
  showColorLegend: false,

  // Sizing
  pointSizeStrategy: 'auto',
  scalePointsOnZoom: false,
  showSizeLegend: false,

  // Hover & interaction
  showHoveredPointLabel: true,
  renderHoveredPointRing: true,

  // Selection behavior
  connectedSelect: false,

  // Links
  renderLinks: true,
  linkOpacity: 1.0,
  linkGreyoutOpacity: 0.1,
  linkVisibilityDistanceRange: [50, 150] as [number, number],
  linkVisibilityMinTransparency: 0.25,
  linkDefaultWidth: 1,
  curvedLinks: false,
  linkDefaultArrows: false,
  scaleLinksOnZoom: false,

  // Timeline
  showTimeline: false,
  timelineColumn: 'year',
  timelineSelection: undefined,

  // Prompt size: minimized (pill) / normal / maximized (full-height)
  promptMinimized: false,
  promptMaximized: false,

  // Write mode
  writeContent: '',

  // Crossfilter state mirrored from Cosmograph callbacks
  currentPointIndices: null,
  selectedPointIndices: [],
  highlightedPointIndices: [],
  activeSelectionSourceId: null,
  lockedSelection: null,

  // Actions
  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) =>
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),
  setPanelsVisible: (visible) => set({ panelsVisible: visible }),
  setPanelBottomY: (side, y) =>
    set((s) => s.panelBottomY[side] === y ? s : { panelBottomY: { ...s.panelBottomY, [side]: y } }),
  togglePanelsVisible: () =>
    set((s) => {
      const next = !s.panelsVisible
      return { panelsVisible: next, ...(next ? {} : { activePanel: null }) }
    }),
  setTableOpen: (open) => set({ tableOpen: open }),
  toggleTable: () => set((s) => ({ tableOpen: !s.tableOpen })),
  setTableHeight: (height) => set({ tableHeight: height }),
  setUiHidden: (hidden) => set({ uiHidden: hidden }),
  toggleUiHidden: () => set((s) => ({ uiHidden: !s.uiHidden })),
  setPointColorColumn: (col) => set({ pointColorColumn: col }),
  setPointColorStrategy: (strategy) => set({ pointColorStrategy: strategy }),
  setPointSizeColumn: (col) => set({ pointSizeColumn: col }),
  setPointSizeRange: (range) => set({ pointSizeRange: range }),
  setPointLabelColumn: (col) => set({ pointLabelColumn: col }),
  setShowPointLabels: (show) => set({ showPointLabels: show }),
  setShowDynamicLabels: (show) => set({ showDynamicLabels: show }),
  setPositionXColumn: (col) => set({ positionXColumn: col }),
  setPositionYColumn: (col) => set({ positionYColumn: col }),
  addInfoWidget: (slot) =>
    set((s) => ({
      infoWidgets: s.infoWidgets.some((w) => w.column === slot.column)
        ? s.infoWidgets
        : [...s.infoWidgets, slot],
    })),
  removeInfoWidget: (column) =>
    set((s) => ({
      infoWidgets: s.infoWidgets.filter((w) => w.column !== column),
    })),
  addFilter: (column) =>
    set((s) => ({
      filterColumns: s.filterColumns.some((f) => f.column === column)
        ? s.filterColumns
        : [
            ...s.filterColumns,
            {
              column,
              type: getColumnMeta(column)?.type === 'numeric'
                ? ('numeric' as const)
                : ('categorical' as const),
            },
          ],
    })),
  removeFilter: (column) =>
    set((s) => ({
      filterColumns: s.filterColumns.filter((f) => f.column !== column),
    })),
  setTablePage: (page) => set({ tablePage: page }),
  setTablePageSize: (size) => set({ tablePageSize: size }),
  setTableView: (view) => set({ tableView: view }),
  setInfoScopeMode: (mode) => set({ infoScopeMode: mode }),
  setColorScheme: (scheme) => set({ colorScheme: scheme }),
  setShowColorLegend: (show) => set({ showColorLegend: show }),
  setPointSizeStrategy: (strategy) => set({ pointSizeStrategy: strategy }),
  setScalePointsOnZoom: (scale) => set({ scalePointsOnZoom: scale }),
  setShowSizeLegend: (show) => set({ showSizeLegend: show }),
  setShowHoveredPointLabel: (show) => set({ showHoveredPointLabel: show }),
  setRenderHoveredPointRing: (show) => set({ renderHoveredPointRing: show }),
  setConnectedSelect: (on) => set({ connectedSelect: on }),
  toggleConnectedSelect: () => set((s) => ({ connectedSelect: !s.connectedSelect })),
  setRenderLinks: (show) => set({ renderLinks: show }),
  setLinkOpacity: (opacity) => set({ linkOpacity: opacity }),
  setLinkGreyoutOpacity: (opacity) => set({ linkGreyoutOpacity: opacity }),
  setLinkVisibilityDistanceRange: (range) => set({ linkVisibilityDistanceRange: range }),
  setLinkVisibilityMinTransparency: (transparency) => set({ linkVisibilityMinTransparency: transparency }),
  setLinkDefaultWidth: (width) => set({ linkDefaultWidth: width }),
  setCurvedLinks: (curved) => set({ curvedLinks: curved }),
  setLinkDefaultArrows: (arrows) => set({ linkDefaultArrows: arrows }),
  setScaleLinksOnZoom: (scale) => set({ scaleLinksOnZoom: scale }),
  setShowTimeline: (show) => set({ showTimeline: show }),
  toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
  setTimelineColumn: (col) => set({ timelineColumn: col }),
  setTimelineSelection: (selection) => set({ timelineSelection: selection }),
  setPromptMinimized: (minimized) => set({ promptMinimized: minimized, promptMaximized: false }),
  setPromptMaximized: (maximized) => set({ promptMaximized: maximized, promptMinimized: false }),
  togglePromptMinimized: () => set((s) => ({ promptMinimized: !s.promptMinimized, promptMaximized: false })),
  togglePromptMaximized: () => set((s) => ({ promptMaximized: !s.promptMaximized, promptMinimized: false })),
  setWriteContent: (content) => set({ writeContent: content }),
  setCurrentPointIndices: (indices) => set({ currentPointIndices: indices }),
  setSelectedPointIndices: (indices) => set({ selectedPointIndices: indices }),
  setHighlightedPointIndices: (indices) => set({ highlightedPointIndices: indices }),
  setActiveSelectionSourceId: (sourceId) =>
    set({ activeSelectionSourceId: sourceId }),
  lockSelection: () => set((s) =>
    s.selectedPointIndices.length === 0 ? s
      : { lockedSelection: new Set(s.selectedPointIndices) }
  ),
  unlockSelection: () => set({ lockedSelection: null }),
  setActiveLayer: (layer) =>
    set(() => {
      const config = getLayerConfig(layer)
      return {
        activeLayer: layer,
        // Reset config to layer defaults
        pointColorColumn: config.defaultColorColumn as DataColumnKey | 'hexColor',
        pointColorStrategy: config.defaultColorStrategy,
        pointSizeColumn: (config.defaultSizeColumn ?? 'none') as SizeColumnKey,
        pointSizeStrategy: config.defaultSizeStrategy,
        pointSizeRange: config.pointSizeRange,
        // Reset selection/interaction state
        connectedSelect: false,
        currentPointIndices: null,
        selectedPointIndices: [],
        highlightedPointIndices: [],
        activeSelectionSourceId: null,
        lockedSelection: null,
        tablePage: 1,
        tableView: 'current',
        infoScopeMode: 'current',
        // Reset filters and info widgets to layer-appropriate defaults
        filterColumns: getDefaultFiltersForLayer(layer),
        infoWidgets: config.defaultInfoWidgets,
      }
    }),
  setAvailableLayers: (layers) => set({ availableLayers: layers }),
}))
