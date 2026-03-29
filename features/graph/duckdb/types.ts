import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type {
  AuthorGeoRow,
  ChunkNode,
  GraphBundleLoadProgress,
  GraphClusterDetail,
  GraphInfoFacetRow,
  GraphInfoHistogramBin,
  GraphInfoScope,
  GraphInfoSummary,
  GraphData,
  GraphNode,
  GraphSearchResult,
  GraphVisibilityBudget,
  GraphQueryResult,
  GraphTablePageResult,
  GraphSelectionDetail,
  MapLayer,
  OverlayActivationRequest,
  OverlayActivationResult,
  PaperDocument,
  PaperNode,
} from '@/features/graph/types'

export interface GraphCanvasSource {
  duckDBConnection: {
    connection: AsyncDuckDBConnection
    duckdb: import('@duckdb/duckdb-wasm').AsyncDuckDB
  }
  layerTables: Record<MapLayer, { points: string; links: string }>
  pointCounts: Record<MapLayer, number>
  overlayCount: number
  overlayRevision: number
}

export type GraphCanvasListener = (canvas: GraphCanvasSource) => void

export interface GraphBundleSession {
  availableLayers: MapLayer[]
  canvas: GraphCanvasSource
  subscribeCanvas: (listener: GraphCanvasListener) => () => void
  getData: () => Promise<GraphData>
  setOverlayPointIds: (pointIds: string[]) => Promise<{ overlayCount: number }>
  clearOverlay: () => Promise<{ overlayCount: number }>
  activateOverlay: (args: OverlayActivationRequest) => Promise<OverlayActivationResult>
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getInstitutionAuthors: (institutionKey: string) => Promise<AuthorGeoRow[]>
  getAuthorInstitutions: (name: string, orcid: string | null) => Promise<AuthorGeoRow[]>
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
  getPaperNodesByPaperIds: (paperIds: string[]) => Promise<Record<string, PaperNode>>
  getUniversePointIdsByPaperIds: (paperIds: string[]) => Promise<Record<string, string>>
  getChunkNodesByChunkIds: (chunkIds: string[]) => Promise<Record<string, ChunkNode>>
  resolvePointSelection: (
    layer: MapLayer,
    selector: { id?: string; index?: number }
  ) => Promise<GraphNode | null>
  getTablePage: (args: {
    layer: MapLayer
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<GraphTablePageResult>
  getInfoSummary: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<GraphInfoSummary>
  getInfoBars: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<Array<{ value: string; count: number }>>
  getInfoHistogram: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    bins?: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<{ bins: GraphInfoHistogramBin[]; totalCount: number }>
  getFacetSummary: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<GraphInfoFacetRow[]>
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
  getPointIndicesForScope: (args: {
    layer: MapLayer
    scopeSql: string
  }) => Promise<number[]>
  getSelectionDetail: (node: GraphNode) => Promise<GraphSelectionDetail>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}

export type ProgressCallback = (
  bundleChecksum: string,
  progress: GraphBundleLoadProgress
) => void
