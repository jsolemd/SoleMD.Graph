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
  GraphLayer,
  OverlayActivationRequest,
  OverlayActivationResult,
  OverlayProducerId,
  PaperDocument,
} from "@solemd/graph"
import type { NumericStatsRow } from './queries'

export interface GraphCanvasSource {
  duckDBConnection: {
    connection: AsyncDuckDBConnection
    duckdb: import('@duckdb/duckdb-wasm').AsyncDuckDB
  }
  pointCounts: Record<GraphLayer, number>
  overlayCount: number
  overlayRevision: number
}

export type GraphCanvasListener = (canvas: GraphCanvasSource) => void

export interface GraphBundleSession {
  availableLayers: GraphLayer[]
  canvas: GraphCanvasSource
  /**
   * Live DuckDB-Wasm connection for callers that need streaming
   * (`conn.send(sql, true)`) or temp-table creation beyond what the
   * typed query methods expose. Used by the orb paper-attribute baker;
   * general-purpose consumers should prefer the typed methods on this
   * session instead of reaching into the connection directly.
   */
  duckdbConnection: AsyncDuckDBConnection
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
  getSelectionScopeGraphPaperRefs: (args: {
    currentPointScopeSql: string | null
  }) => Promise<string[]>
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
    layer: GraphLayer,
    selector: { id?: string; index?: number }
  ) => Promise<GraphPointRecord | null>
  getTablePage: (args: {
    layer: GraphLayer
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointScopeSql: string | null
  }) => Promise<GraphTablePageResult>
  getInfoSummary: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    currentPointScopeSql: string | null
  }) => Promise<GraphInfoSummary>
  getInfoBars: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<Array<{ value: string; count: number }>>
  getInfoHistogram: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    column: string
    bins?: number
    extent?: [number, number] | null
    useQuantiles?: boolean
    currentPointScopeSql: string | null
  }) => Promise<GraphInfoHistogramResult>
  getFacetSummary: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<GraphInfoFacetRow[]>
  getFacetSummaries: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    columns: string[]
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<Record<string, GraphInfoFacetRow[]>>
  getInfoBarsBatch: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    columns: string[]
    maxItems?: number
    currentPointScopeSql: string | null
  }) => Promise<Record<string, Array<{ value: string; count: number }>>>
  getInfoHistogramsBatch: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    columns: string[]
    bins?: number
    extent?: [number, number] | null
    extentsByColumn?: Record<string, [number, number] | null>
    useQuantiles?: boolean
    currentPointScopeSql: string | null
  }) => Promise<Record<string, GraphInfoHistogramResult>>
  getNumericStatsBatch: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    columns: string[]
    currentPointScopeSql: string | null
  }) => Promise<Record<string, NumericStatsRow>>
  getNumericColumnValues: (args: {
    layer: GraphLayer
    scope: GraphInfoScope
    column: string
    currentPointScopeSql: string | null
  }) => Promise<number[]>
  searchPoints: (args: {
    layer: GraphLayer
    column: string
    query: string
    limit?: number
  }) => Promise<GraphSearchResult[]>
  getVisibilityBudget: (args: {
    layer: GraphLayer
    selector: { id?: string; index?: number }
    scopeSql?: string | null
  }) => Promise<GraphVisibilityBudget | null>
  getScopeCoordinates: (args: {
    layer: GraphLayer
    scope: 'current' | 'selected'
    currentPointScopeSql: string | null
  }) => Promise<number[] | null>
  getSelectionDetail: (point: GraphPointRecord) => Promise<GraphSelectionDetail>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
  exportTableCsv: (args: {
    layer: GraphLayer
    view: 'current' | 'selected'
    currentPointScopeSql: string | null
  }) => Promise<string>
}

export type ProgressCallback = (
  bundleChecksum: string,
  progress: GraphBundleLoadProgress
) => void
