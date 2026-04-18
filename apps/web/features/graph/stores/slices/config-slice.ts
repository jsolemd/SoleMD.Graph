import type { StateCreator } from 'zustand'
import {
  getColumnMeta,
  getRenderableColumnsForLayer,
} from '@/features/graph/lib/columns'
import { hasSameRange } from '@/features/graph/lib/helpers'
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

export type TableView = 'selection' | 'dataset'

/** Curated default filters — one per concept, no redundant pairs. */
const CORPUS_FILTER_COLUMNS: Array<{ column: FilterableColumnKey; type: 'numeric' | 'categorical' }> = [
  { column: 'textAvailability', type: 'categorical' },
  { column: 'clusterLabel', type: 'categorical' },
  { column: 'year', type: 'numeric' },
  { column: 'paperReferenceCount', type: 'numeric' },
  { column: 'journal', type: 'categorical' },
  { column: 'relationCategories', type: 'categorical' },
  { column: 'semanticGroups', type: 'categorical' },
]

function getDefaultFiltersForLayer(layer: MapLayer) {
  void layer
  return CORPUS_FILTER_COLUMNS
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

  // Color scheme
  colorScheme: ColorSchemeName
  showColorLegend: boolean

  // Sizing
  pointSizeStrategy: PointSizeStrategy
  scalePointsOnZoom: boolean
  showSizeLegend: boolean

  // Hover & interaction
  showHoveredPointLabel: boolean
  hoverLabelAlwaysOn: boolean
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
  setColorScheme: (scheme: ColorSchemeName) => void
  setShowColorLegend: (show: boolean) => void
  setPointSizeStrategy: (strategy: PointSizeStrategy) => void
  setScalePointsOnZoom: (scale: boolean) => void
  setShowSizeLegend: (show: boolean) => void
  setShowHoveredPointLabel: (show: boolean) => void
  setHoverLabelAlwaysOn: (on: boolean) => void
  setRenderHoveredPointRing: (show: boolean) => void
  setActiveLayer: (layer: MapLayer) => void
  setAvailableLayers: (layers: MapLayer[]) => void
}

export const createConfigSlice: StateCreator<DashboardState, [], [], ConfigSlice> = (set) => {
  const guard = <K extends keyof DashboardState>(key: K) =>
    (val: DashboardState[K]) => set((s) => (s[key] === val ? s : { [key]: val } as Partial<DashboardState>))

  return {
  activeLayer: 'corpus',
  availableLayers: ['corpus'],

  pointColorColumn: 'clusterLabel',
  pointColorStrategy: 'categorical',
  pointSizeColumn: 'paperReferenceCount',
  pointSizeRange: [1.5, 5],
  pointLabelColumn: 'clusterLabel',
  showPointLabels: false,
  showDynamicLabels: false,
  positionXColumn: 'x',
  positionYColumn: 'y',

  infoWidgets: getLayerConfig('corpus').defaultInfoWidgets,
  filterColumns: CORPUS_FILTER_COLUMNS,

  tablePage: 1,
  tablePageSize: 100,
  tableView: 'dataset',

  colorScheme: 'vibrant',
  showColorLegend: false,

  pointSizeStrategy: 'auto',
  scalePointsOnZoom: true,
  showSizeLegend: false,

  showHoveredPointLabel: true,
  hoverLabelAlwaysOn: false,
  renderHoveredPointRing: true,

  setPointColorColumn: guard('pointColorColumn'),
  setPointColorStrategy: guard('pointColorStrategy'),
  setPointSizeColumn: guard('pointSizeColumn'),
  setPointSizeRange: (range) => set((s) => (
    hasSameRange(s.pointSizeRange, range) ? s : { pointSizeRange: range }
  )),
  setPointLabelColumn: guard('pointLabelColumn'),
  setShowPointLabels: guard('showPointLabels'),
  setShowDynamicLabels: guard('showDynamicLabels'),
  setPositionXColumn: guard('positionXColumn'),
  setPositionYColumn: guard('positionYColumn'),
  addInfoWidget: (slot) =>
    set((s) => (
      s.infoWidgets.some((w) => w.column === slot.column)
        ? s
        : { infoWidgets: [...s.infoWidgets, slot] }
    )),
  removeInfoWidget: (column) =>
    set((s) => {
      const nextInfoWidgets = s.infoWidgets.filter((w) => w.column !== column)
      return nextInfoWidgets.length === s.infoWidgets.length
        ? s
        : { infoWidgets: nextInfoWidgets }
    }),
  addFilter: (column) =>
    set((s) => (
      s.filterColumns.some((f) => f.column === column)
        ? s
        : {
            filterColumns: [
              ...s.filterColumns,
              {
                column,
                type: getColumnMeta(column)?.type === 'numeric'
                  ? ('numeric' as const)
                  : ('categorical' as const),
              },
            ],
          }
    )),
  removeFilter: (column) =>
    set((s) => {
      const nextFilterColumns = s.filterColumns.filter((f) => f.column !== column)
      return nextFilterColumns.length === s.filterColumns.length
        ? s
        : { filterColumns: nextFilterColumns }
    }),
  setTablePage: guard('tablePage'),
  setTablePageSize: guard('tablePageSize'),
  setTableView: guard('tableView'),
  setColorScheme: guard('colorScheme'),
  setShowColorLegend: guard('showColorLegend'),
  setPointSizeStrategy: guard('pointSizeStrategy'),
  setScalePointsOnZoom: guard('scalePointsOnZoom'),
  setShowSizeLegend: guard('showSizeLegend'),
  setShowHoveredPointLabel: guard('showHoveredPointLabel'),
  setHoverLabelAlwaysOn: guard('hoverLabelAlwaysOn'),
  setRenderHoveredPointRing: guard('renderHoveredPointRing'),
  setActiveLayer: (layer) => {
    set((s) => {
      if (s.activeLayer === layer) {
        return s
      }
      const config = getLayerConfig(layer)
      return {
        activeLayer: layer,
        pointColorColumn: config.defaultColorColumn as DataColumnKey | 'hexColor',
        pointColorStrategy: config.defaultColorStrategy,
        pointSizeColumn: (config.defaultSizeColumn ?? 'none') as SizeColumnKey,
        pointSizeStrategy: config.defaultSizeStrategy,
        pointSizeRange: config.pointSizeRange,
        renderLinks: false,
        linkVisibilityDistanceRange: [50, 150] as [number, number],
        linkVisibilityMinTransparency: 0.25,
        linkDefaultWidth: 1,
        linkGreyoutOpacity: 0,
        connectedSelect: false,
        currentPointScopeSql: null,
        currentScopeRevision: 0,
        selectedPointCount: 0,
        selectedPointRevision: 0,
        activeSelectionSourceId: null,
        selectionLocked: false,
        tablePage: 1,
        tableView: 'dataset',
        pointLabelColumn: (() => {
          const layerColumns = getRenderableColumnsForLayer(layer)
          return layerColumns.some(c => c.key === 'clusterLabel')
            ? 'clusterLabel' as DataColumnKey
            : layerColumns.some(c => c.key === 'displayLabel')
            ? 'displayLabel' as DataColumnKey
            : (layerColumns[0]?.key ?? 'displayLabel') as DataColumnKey
        })(),
        filterColumns: getDefaultFiltersForLayer(layer),
        infoWidgets: config.defaultInfoWidgets,
      }
    })
    // Intentional cross-store coordination: clearing graph-store's selected node
    // ensures the DetailPanel closes when the user switches layers. dashboard-store
    // owns layer state while graph-store owns node selection — this coupling is the
    // simplest way to keep them in sync without a shared event bus.
    useGraphStore.getState().selectNode(null)
  },
  setAvailableLayers: (layers) => set((state) => (
    state.availableLayers.length === layers.length &&
    state.availableLayers.every((layer, index) => layer === layers[index])
      ? state
      : { availableLayers: layers }
  )),
}}
