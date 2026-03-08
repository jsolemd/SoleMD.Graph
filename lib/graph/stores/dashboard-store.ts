import { create } from 'zustand'
import { getColumnMeta } from '../columns'
import type {
  ColorSchemeName,
  FilterableColumnKey,
  GraphFilter,
  PointColorStrategy,
  PointSizeStrategy,
} from '../types'

export type ActivePanel = 'config' | 'filters' | 'info' | null
export type TableView = 'visible' | 'selected'

interface DashboardState {
  // Panel visibility
  activePanel: ActivePanel
  tableOpen: boolean
  tableHeight: number

  // Config: Points
  pointColorColumn: string
  pointColorStrategy: PointColorStrategy
  pointSizeColumn: string
  pointSizeRange: [number, number]
  pointLabelColumn: string
  showPointLabels: boolean
  showDynamicLabels: boolean
  positionXColumn: string
  positionYColumn: string

  // Filters
  filters: GraphFilter[]
  filtersResetVersion: number

  // Table
  tablePage: number
  tablePageSize: number
  tableView: TableView

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

  // Timeline
  showTimeline: boolean
  timelineSelection?: [number, number]

  // Write mode
  writeContent: string

  // Crossfilter state mirrored from Cosmograph callbacks
  filteredPointIndices: number[] | null
  selectedPointIndices: number[]
  activeSelectionSourceId: string | null

  // Actions
  setActivePanel: (panel: ActivePanel) => void
  togglePanel: (panel: ActivePanel) => void
  setTableOpen: (open: boolean) => void
  toggleTable: () => void
  setTableHeight: (height: number) => void
  setPointColorColumn: (col: string) => void
  setPointColorStrategy: (strategy: PointColorStrategy) => void
  setPointSizeColumn: (col: string) => void
  setPointSizeRange: (range: [number, number]) => void
  setPointLabelColumn: (col: string) => void
  setShowPointLabels: (show: boolean) => void
  setShowDynamicLabels: (show: boolean) => void
  setPositionXColumn: (col: string) => void
  setPositionYColumn: (col: string) => void
  addFilter: (column: FilterableColumnKey) => void
  removeFilter: (column: FilterableColumnKey) => void
  clearFilterSelection: (column: FilterableColumnKey) => void
  clearAllFilterSelections: () => void
  setCategoricalFilterSelection: (
    column: FilterableColumnKey,
    selection?: string
  ) => void
  setNumericFilterSelection: (
    column: FilterableColumnKey,
    selection?: [number, number]
  ) => void
  setTablePage: (page: number) => void
  setTablePageSize: (size: number) => void
  setTableView: (view: TableView) => void
  setColorScheme: (scheme: ColorSchemeName) => void
  setShowColorLegend: (show: boolean) => void
  setPointSizeStrategy: (strategy: PointSizeStrategy) => void
  setScalePointsOnZoom: (scale: boolean) => void
  setShowSizeLegend: (show: boolean) => void
  setShowHoveredPointLabel: (show: boolean) => void
  setRenderHoveredPointRing: (show: boolean) => void
  setShowTimeline: (show: boolean) => void
  toggleTimeline: () => void
  setTimelineSelection: (selection?: [number, number]) => void
  setWriteContent: (content: string) => void
  setFilteredPointIndices: (indices: number[] | null) => void
  setSelectedPointIndices: (indices: number[]) => void
  setActiveSelectionSourceId: (sourceId: string | null) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // Panel visibility
  activePanel: null,
  tableOpen: false,
  tableHeight: 280,

  // Config defaults
  pointColorColumn: 'clusterLabel',
  pointColorStrategy: 'categorical',
  pointSizeColumn: 'clusterProbability',
  pointSizeRange: [1, 4],
  pointLabelColumn: 'clusterLabel',
  showPointLabels: true,
  showDynamicLabels: true,
  positionXColumn: 'x',
  positionYColumn: 'y',

  // Filters
  filters: [],
  filtersResetVersion: 0,

  // Table
  tablePage: 1,
  tablePageSize: 100,
  tableView: 'visible',

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

  // Timeline
  showTimeline: true,
  timelineSelection: undefined,

  // Write mode
  writeContent: '',

  // Crossfilter state mirrored from Cosmograph callbacks
  filteredPointIndices: null,
  selectedPointIndices: [],
  activeSelectionSourceId: null,

  // Actions
  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) =>
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),
  setTableOpen: (open) => set({ tableOpen: open }),
  toggleTable: () => set((s) => ({ tableOpen: !s.tableOpen })),
  setTableHeight: (height) => set({ tableHeight: height }),
  setPointColorColumn: (col) => set({ pointColorColumn: col }),
  setPointColorStrategy: (strategy) => set({ pointColorStrategy: strategy }),
  setPointSizeColumn: (col) => set({ pointSizeColumn: col }),
  setPointSizeRange: (range) => set({ pointSizeRange: range }),
  setPointLabelColumn: (col) => set({ pointLabelColumn: col }),
  setShowPointLabels: (show) => set({ showPointLabels: show }),
  setShowDynamicLabels: (show) => set({ showDynamicLabels: show }),
  setPositionXColumn: (col) => set({ positionXColumn: col }),
  setPositionYColumn: (col) => set({ positionYColumn: col }),
  addFilter: (column) =>
    set((s) => ({
      filters: s.filters.some((filter) => filter.column === column)
        ? s.filters
        : [
            ...s.filters,
            {
              column,
              type: getColumnMeta(column)?.type === 'numeric'
                ? 'numeric'
                : 'categorical',
            },
          ],
    })),
  removeFilter: (column) =>
    set((s) => ({
      filters: s.filters.filter((filter) => filter.column !== column),
    })),
  clearFilterSelection: (column) =>
    set((s) => ({
      filters: s.filters.map((filter) =>
        filter.column === column ? { ...filter, selection: undefined } : filter
      ),
    })),
  clearAllFilterSelections: () =>
    set((s) => ({
      filtersResetVersion: s.filtersResetVersion + 1,
      filters: s.filters.map((filter) => ({
        ...filter,
        selection: undefined,
      })),
    })),
  setCategoricalFilterSelection: (column, selection) =>
    set((s) => ({
      filters: s.filters.map((filter) =>
        filter.column === column && filter.type === 'categorical'
          ? { ...filter, selection }
          : filter
      ),
    })),
  setNumericFilterSelection: (column, selection) =>
    set((s) => ({
      filters: s.filters.map((filter) =>
        filter.column === column && filter.type === 'numeric'
          ? { ...filter, selection }
          : filter
      ),
    })),
  setTablePage: (page) => set({ tablePage: page }),
  setTablePageSize: (size) => set({ tablePageSize: size }),
  setTableView: (view) => set({ tableView: view }),
  setColorScheme: (scheme) => set({ colorScheme: scheme }),
  setShowColorLegend: (show) => set({ showColorLegend: show }),
  setPointSizeStrategy: (strategy) => set({ pointSizeStrategy: strategy }),
  setScalePointsOnZoom: (scale) => set({ scalePointsOnZoom: scale }),
  setShowSizeLegend: (show) => set({ showSizeLegend: show }),
  setShowHoveredPointLabel: (show) => set({ showHoveredPointLabel: show }),
  setRenderHoveredPointRing: (show) => set({ renderHoveredPointRing: show }),
  setShowTimeline: (show) => set({ showTimeline: show }),
  toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
  setTimelineSelection: (selection) => set({ timelineSelection: selection }),
  setWriteContent: (content) => set({ writeContent: content }),
  setFilteredPointIndices: (indices) => set({ filteredPointIndices: indices }),
  setSelectedPointIndices: (indices) => set({ selectedPointIndices: indices }),
  setActiveSelectionSourceId: (sourceId) =>
    set({ activeSelectionSourceId: sourceId }),
}))
