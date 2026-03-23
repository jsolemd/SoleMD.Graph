import type { StateCreator } from 'zustand'
import { getColumnMeta, getColumnsForLayer } from '@/features/graph/lib/columns'
import type { InfoWidgetSlot } from '@/features/graph/lib/info-widgets'
import { getLayerConfig } from '@/features/graph/lib/layers'
import { useGraphStore } from '../graph-store'
import type { DashboardState } from '../dashboard-store'
import type {
  ColorSchemeName,
  DataColumnKey,
  FilterableColumnKey,
  MapLayer,
  NumericColumnKey,
  PointColorStrategy,
  PointSizeStrategy,
  SizeColumnKey,
} from '@/features/graph/types'

export type TableView = 'current' | 'selected'
export type InfoScopeMode = 'current' | 'selected' | 'dataset'

/** Curated default filters — one per concept, no redundant pairs. */
const CHUNK_FILTER_COLUMNS: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }> = [
  { column: 'nodeKind', type: 'categorical' },
  { column: 'clusterLabel', type: 'categorical' },
  { column: 'category', type: 'categorical' },
  { column: 'relationCertainty', type: 'categorical' },
  { column: 'journal', type: 'categorical' },
  { column: 'sectionCanonical', type: 'categorical' },
  { column: 'chunkKind', type: 'categorical' },
  { column: 'year', type: 'numeric' },
]

const PAPER_FILTER_COLUMNS: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }> = [
  { column: 'clusterLabel', type: 'categorical' },
  { column: 'journal', type: 'categorical' },
  { column: 'year', type: 'numeric' },
]

const GEO_FILTER_COLUMNS: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }> = [
  { column: 'clusterLabel', type: 'categorical' },
  { column: 'year', type: 'numeric' },
]

function getDefaultFiltersForLayer(layer: MapLayer) {
  if (layer === 'paper') return PAPER_FILTER_COLUMNS
  if (layer === 'geo') return GEO_FILTER_COLUMNS
  return CHUNK_FILTER_COLUMNS
}

export interface ConfigSlice {
  // Layer
  activeLayer: MapLayer
  availableLayers: MapLayer[]

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

  // Info widgets
  infoWidgets: InfoWidgetSlot[]

  // Filters
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

  // Actions
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
  setActiveLayer: (layer: MapLayer) => void
  setAvailableLayers: (layers: MapLayer[]) => void
}

export const createConfigSlice: StateCreator<DashboardState, [], [], ConfigSlice> = (set) => ({
  activeLayer: 'chunk',
  availableLayers: ['chunk'],

  pointColorColumn: 'hexColor',
  pointColorStrategy: 'direct',
  pointSizeColumn: 'clusterProbability',
  pointSizeRange: [2, 8],
  pointLabelColumn: 'clusterLabel',
  showPointLabels: false,
  showDynamicLabels: false,
  positionXColumn: 'x',
  positionYColumn: 'y',

  infoWidgets: getLayerConfig('chunk').defaultInfoWidgets,
  filterColumns: CHUNK_FILTER_COLUMNS,

  tablePage: 1,
  tablePageSize: 100,
  tableView: 'current',
  infoScopeMode: 'current',

  colorScheme: 'default',
  showColorLegend: false,

  pointSizeStrategy: 'auto',
  scalePointsOnZoom: false,
  showSizeLegend: false,

  showHoveredPointLabel: true,
  renderHoveredPointRing: true,

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
  setActiveLayer: (layer) => {
    set(() => {
      const config = getLayerConfig(layer)
      return {
        activeLayer: layer,
        pointColorColumn: config.defaultColorColumn as DataColumnKey | 'hexColor',
        pointColorStrategy: config.defaultColorStrategy,
        pointSizeColumn: (config.defaultSizeColumn ?? 'none') as SizeColumnKey,
        pointSizeStrategy: config.defaultSizeStrategy,
        pointSizeRange: config.pointSizeRange,
        renderLinks: false,
        linkVisibilityDistanceRange: layer === 'paper'
          ? [0, 10000] as [number, number]
          : [50, 150] as [number, number],
        linkVisibilityMinTransparency: layer === 'paper' ? 0.8 : 0.25,
        linkDefaultWidth: layer === 'paper' ? 2 : 1,
        linkGreyoutOpacity: layer === 'paper' ? 0.1 : 0,
        connectedSelect: false,
        currentPointIndices: null,
        selectedPointIndices: [],
        highlightedPointIndices: [],
        activeSelectionSourceId: null,
        lockedSelection: null,
        tablePage: 1,
        tableView: 'current',
        infoScopeMode: 'current',
        pointLabelColumn: (() => {
          const layerColumns = getColumnsForLayer(layer)
          return layerColumns.some(c => c.key === 'clusterLabel')
            ? 'clusterLabel' as DataColumnKey
            : (layerColumns[0]?.key ?? 'clusterLabel') as DataColumnKey
        })(),
        filterColumns: getDefaultFiltersForLayer(layer),
        infoWidgets: config.defaultInfoWidgets,
        geoFilters: {},
        geoSelection: null,
      }
    })
    // Intentional cross-store coordination: clearing graph-store's selected node
    // ensures the DetailPanel closes when the user switches layers. dashboard-store
    // owns layer state while graph-store owns node selection — this coupling is the
    // simplest way to keep them in sync without a shared event bus.
    useGraphStore.getState().selectNode(null)
  },
  setAvailableLayers: (layers) => set({ availableLayers: layers }),
})
