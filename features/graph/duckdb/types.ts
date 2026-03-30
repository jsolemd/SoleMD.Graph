import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type {
  GraphBundleLoadProgress,
  GraphClusterDetail,
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoScope,
  GraphInfoSummary,
  GraphPointRecord,
  GraphPaperAvailabilityResult,
  GraphSearchResult,
  GraphVisibilityBudget,
  GraphQueryResult,
  GraphTablePageResult,
  GraphSelectionDetail,
  MapLayer,
  OverlayActivationRequest,
  OverlayActivationResult,
  OverlayProducerId,
  PaperDocument,
} from '@/features/graph/types'

export interface GraphCanvasSource {
  duckDBConnection: {
    connection: AsyncDuckDBConnection
    duckdb: import('@duckdb/duckdb-wasm').AsyncDuckDB
  }
  pointCounts: Record<MapLayer, number>
  overlayCount: number
  overlayRevision: number
}

export type GraphCanvasListener = (canvas: GraphCanvasSource) => void

export interface GraphBundleSession {
  availableLayers: MapLayer[]
  canvas: GraphCanvasSource
  dispose: () => Promise<void>
  subscribeCanvas: (listener: GraphCanvasListener) => () => void
  setSelectedPointIndices: (pointIndices: number[]) => Promise<void>
  setSelectedPointScopeSql: (scopeSql: string | null) => Promise<void>
  getOverlayPointIds: () => Promise<string[]>
  setOverlayProducerPointIds: (args: {
    producerId: OverlayProducerId
    pointIds: string[]
  }) => Promise<{ overlayCount: number }>
  clearOverlayProducer: (producerId: OverlayProducerId) => Promise<{ overlayCount: number }>
  reconcileOverlayPointIds: (args: {
    previousPointIds: string[]
    nextPointIds: string[]
  }) => Promise<{ overlayCount: number }>
  setOverlayPointIds: (pointIds: string[]) => Promise<{ overlayCount: number }>
  clearOverlay: () => Promise<{ overlayCount: number }>
  activateOverlay: (args: OverlayActivationRequest) => Promise<OverlayActivationResult>
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
  getSelectedGraphPaperRefs: () => Promise<string[]>
  getPaperNodesByGraphPaperRefs: (
    graphPaperRefs: string[]
  ) => Promise<Record<string, GraphPointRecord>>
  ensureGraphPaperRefsAvailable: (
    graphPaperRefs: string[]
  ) => Promise<GraphPaperAvailabilityResult>
  getUniversePointIdsByGraphPaperRefs: (
    graphPaperRefs: string[]
  ) => Promise<Record<string, string>>
  resolvePointSelection: (
    layer: MapLayer,
    selector: { id?: string; index?: number }
  ) => Promise<GraphPointRecord | null>
  getTablePage: (args: {
    layer: MapLayer
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointScopeSql: string | null
  }) => Promise<GraphTablePageResult>
  getInfoSummary: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    currentPointScopeSql: string | null
  }) => Promise<GraphInfoSummary>
  getCategoricalValues: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    currentPointScopeSql: string | null
  }) => Promise<string[]>
  getNumericValues: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    currentPointScopeSql: string | null
  }) => Promise<number[]>
  getInfoBars: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<Array<{ value: string; count: number }>>
  getInfoHistogram: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    bins?: number
    extent?: [number, number] | null
    useQuantiles?: boolean
    currentPointScopeSql: string | null
  }) => Promise<GraphInfoHistogramResult>
  getFacetSummary: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<GraphInfoFacetRow[]>
  getFacetSummaries: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    columns: string[]
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<Record<string, GraphInfoFacetRow[]>>
  getInfoBarsBatch: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    columns: string[]
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<Record<string, Array<{ value: string; count: number }>>>
  getInfoHistogramsBatch: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    columns: string[]
    bins?: number
    extent?: [number, number] | null
    useQuantiles?: boolean
    currentPointScopeSql: string | null
  }) => Promise<Record<string, GraphInfoHistogramResult>>
  searchPoints: (args: {
    layer: MapLayer
    column: string
    query: string
    limit?: number
  }) => Promise<GraphSearchResult[]>
  getVisibilityBudget: (args: {
    layer: MapLayer
    selector: { id?: string; index?: number }
    scopeSql?: string | null
  }) => Promise<GraphVisibilityBudget | null>
  getScopeCoordinates: (args: {
    layer: MapLayer
    scope: 'current' | 'selected'
    currentPointScopeSql: string | null
  }) => Promise<number[] | null>
  getSelectionDetail: (point: GraphPointRecord) => Promise<GraphSelectionDetail>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
  exportTableCsv: (args: {
    layer: MapLayer
    view: 'current' | 'selected'
    currentPointScopeSql: string | null
  }) => Promise<string>
}

export type ProgressCallback = (
  bundleChecksum: string,
  progress: GraphBundleLoadProgress
) => void
