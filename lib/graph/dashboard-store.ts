import { create } from 'zustand'
import type { ColorSchemeName, PointColorStrategy, PointSizeStrategy } from './types'

export type ActivePanel = 'config' | 'filters' | 'info' | null
export type ConfigTab = 'points' | 'links' | 'simulation'

interface DashboardState {
  // Panel visibility
  activePanel: ActivePanel
  tableOpen: boolean
  tableHeight: number

  // Config: Points
  configTab: ConfigTab
  pointColorColumn: string
  pointColorStrategy: PointColorStrategy
  pointSizeColumn: string
  pointSizeRange: [number, number]
  pointLabelColumn: string
  showPointLabels: boolean
  showDynamicLabels: boolean
  showClusterLabels: boolean
  clusterColumn: string
  positionXColumn: string
  positionYColumn: string

  // Filters
  activeFilters: string[]

  // Table
  tablePage: number
  tablePageSize: number
  tableShowAllPoints: boolean

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

  // Search
  searchQuery: string

  // Write mode
  writeContent: string

  // Actions
  setActivePanel: (panel: ActivePanel) => void
  togglePanel: (panel: ActivePanel) => void
  setTableOpen: (open: boolean) => void
  toggleTable: () => void
  setTableHeight: (height: number) => void
  setConfigTab: (tab: ConfigTab) => void
  setPointColorColumn: (col: string) => void
  setPointColorStrategy: (strategy: PointColorStrategy) => void
  setPointSizeColumn: (col: string) => void
  setPointSizeRange: (range: [number, number]) => void
  setPointLabelColumn: (col: string) => void
  setShowPointLabels: (show: boolean) => void
  setShowDynamicLabels: (show: boolean) => void
  setShowClusterLabels: (show: boolean) => void
  setClusterColumn: (col: string) => void
  setPositionXColumn: (col: string) => void
  setPositionYColumn: (col: string) => void
  addFilter: (column: string) => void
  removeFilter: (column: string) => void
  resetAllFilters: () => void
  setTablePage: (page: number) => void
  setTablePageSize: (size: number) => void
  setTableShowAllPoints: (all: boolean) => void
  setSearchQuery: (query: string) => void
  setColorScheme: (scheme: ColorSchemeName) => void
  setShowColorLegend: (show: boolean) => void
  setPointSizeStrategy: (strategy: PointSizeStrategy) => void
  setScalePointsOnZoom: (scale: boolean) => void
  setShowSizeLegend: (show: boolean) => void
  setShowHoveredPointLabel: (show: boolean) => void
  setRenderHoveredPointRing: (show: boolean) => void
  setShowTimeline: (show: boolean) => void
  toggleTimeline: () => void
  setWriteContent: (content: string) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // Panel visibility
  activePanel: null,
  tableOpen: false,
  tableHeight: 280,

  // Config defaults
  configTab: 'points',
  pointColorColumn: 'clusterLabel',
  pointColorStrategy: 'categorical',
  pointSizeColumn: 'clusterProbability',
  pointSizeRange: [4, 12],
  pointLabelColumn: 'clusterLabel',
  showPointLabels: true,
  showDynamicLabels: true,
  showClusterLabels: true,
  clusterColumn: 'clusterLabel',
  positionXColumn: 'x',
  positionYColumn: 'y',

  // Filters
  activeFilters: [],

  // Table
  tablePage: 1,
  tablePageSize: 100,
  tableShowAllPoints: true,

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

  // Search
  searchQuery: '',

  // Write mode
  writeContent: '',

  // Actions
  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) =>
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),
  setTableOpen: (open) => set({ tableOpen: open }),
  toggleTable: () => set((s) => ({ tableOpen: !s.tableOpen })),
  setTableHeight: (height) => set({ tableHeight: height }),
  setConfigTab: (tab) => set({ configTab: tab }),
  setPointColorColumn: (col) => set({ pointColorColumn: col }),
  setPointColorStrategy: (strategy) => set({ pointColorStrategy: strategy }),
  setPointSizeColumn: (col) => set({ pointSizeColumn: col }),
  setPointSizeRange: (range) => set({ pointSizeRange: range }),
  setPointLabelColumn: (col) => set({ pointLabelColumn: col }),
  setShowPointLabels: (show) => set({ showPointLabels: show }),
  setShowDynamicLabels: (show) => set({ showDynamicLabels: show }),
  setShowClusterLabels: (show) => set({ showClusterLabels: show }),
  setClusterColumn: (col) => set({ clusterColumn: col }),
  setPositionXColumn: (col) => set({ positionXColumn: col }),
  setPositionYColumn: (col) => set({ positionYColumn: col }),
  addFilter: (column) =>
    set((s) => ({
      activeFilters: s.activeFilters.includes(column)
        ? s.activeFilters
        : [...s.activeFilters, column],
    })),
  removeFilter: (column) =>
    set((s) => ({
      activeFilters: s.activeFilters.filter((f) => f !== column),
    })),
  resetAllFilters: () => set({ activeFilters: [] }),
  setTablePage: (page) => set({ tablePage: page }),
  setTablePageSize: (size) => set({ tablePageSize: size }),
  setTableShowAllPoints: (all) => set({ tableShowAllPoints: all }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setColorScheme: (scheme) => set({ colorScheme: scheme }),
  setShowColorLegend: (show) => set({ showColorLegend: show }),
  setPointSizeStrategy: (strategy) => set({ pointSizeStrategy: strategy }),
  setScalePointsOnZoom: (scale) => set({ scalePointsOnZoom: scale }),
  setShowSizeLegend: (show) => set({ showSizeLegend: show }),
  setShowHoveredPointLabel: (show) => set({ showHoveredPointLabel: show }),
  setRenderHoveredPointRing: (show) => set({ renderHoveredPointRing: show }),
  setShowTimeline: (show) => set({ showTimeline: show }),
  toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
  setWriteContent: (content) => set({ writeContent: content }),
}))
