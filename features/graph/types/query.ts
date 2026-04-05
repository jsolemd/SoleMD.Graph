import type { GraphPointRecord } from './points'
import type { GraphClusterDetail } from './detail'
import type { PaperDocument } from './detail'
import type { GraphSelectionDetail } from './detail'
import type { MapLayer } from './config'
import type { NumericStatsRow } from '@/features/graph/duckdb/queries'

export interface GraphQueryResult {
  appliedLimit: number | null
  columns: string[]
  durationMs: number
  executedSql: string
  rowCount: number
  rows: Array<Record<string, unknown>>
}

export interface GraphTablePageResult {
  totalRows: number
  page: number
  pageSize: number
  rows: GraphPointRecord[]
}

export type GraphInfoScope = 'dataset' | 'current' | 'selected'

export interface GraphInfoClusterStat {
  clusterId: number
  label: string
  count: number
}

export interface GraphInfoSummary {
  totalCount: number
  scopedCount: number
  baseCount: number
  overlayCount: number
  scope: GraphInfoScope
  isSubset: boolean
  hasSelection: boolean
  papers: number
  clusters: number
  noise: number
  yearRange: { min: number; max: number } | null
  topClusters: GraphInfoClusterStat[]
}

export interface GraphInfoFacetRow {
  value: string
  scopedCount: number
  totalCount: number
}

export interface GraphInfoHistogramBin {
  min: number
  max: number
  count: number
}

export interface GraphInfoHistogramResult {
  bins: GraphInfoHistogramBin[]
  totalCount: number
}

export interface GraphSearchResult {
  id: string
  index: number
  label: string
  matchedValue: string | null
  subtitle: string | null
  point: GraphPointRecord
}

export type OverlayActivationScope = 'current' | 'selected'
export type OverlayActivationKind = 'cluster-neighborhood'

export interface OverlayActivationRequest {
  kind: OverlayActivationKind
  layer: MapLayer
  scope: OverlayActivationScope
  currentPointScopeSql?: string | null
  maxPoints?: number
  maxClusters?: number
  perClusterLimit?: number
}

export interface OverlayActivationResult {
  kind: OverlayActivationKind
  layer: MapLayer
  scope: OverlayActivationScope
  overlayCount: number
  addedCount: number
  seedCount: number
  clusterCount: number
}

export type OverlayProducerId = string

export interface GraphVisibilityBudget {
  seedIndex: number
  clusterId: number | null
  includeCluster: boolean
  xMin: number | null
  xMax: number | null
  yMin: number | null
  yMax: number | null
}

export interface GraphPaperAvailabilityResult {
  activeGraphPaperRefs: string[]
  universePointIdsByGraphPaperRef: Record<string, string>
  unresolvedGraphPaperRefs: string[]
}

export interface GraphScopeQueryArgs {
  layer: MapLayer
  scope: GraphInfoScope
  currentPointScopeSql: string | null
}

export interface GraphBundleQueries {
  setSelectedPointIndices: (pointIndices: number[]) => Promise<void>
  setSelectedPointScopeSql: (scopeSql: string | null) => Promise<void>
  getOverlayPointIds: () => Promise<string[]>
  setOverlayProducerPointIds: (args: {
    producerId: OverlayProducerId
    pointIds: string[]
  }) => Promise<{ overlayCount: number }>
  clearOverlayProducer: (producerId: OverlayProducerId) => Promise<{ overlayCount: number }>
  setOverlayPointIds: (pointIds: string[]) => Promise<{ overlayCount: number }>
  clearOverlay: () => Promise<{ overlayCount: number }>
  activateOverlay: (args: OverlayActivationRequest) => Promise<OverlayActivationResult>
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getSelectionDetail: (point: GraphPointRecord) => Promise<GraphSelectionDetail>
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
  getInfoSummary: (args: GraphScopeQueryArgs) => Promise<GraphInfoSummary>
  getCategoricalValues: (
    args: GraphScopeQueryArgs & { column: string }
  ) => Promise<string[]>
  getNumericValues: (
    args: GraphScopeQueryArgs & { column: string }
  ) => Promise<number[]>
  getInfoBars: (
    args: GraphScopeQueryArgs & { column: string; maxItems?: number }
  ) => Promise<Array<{ value: string; count: number }>>
  getInfoHistogram: (
    args: GraphScopeQueryArgs & {
      column: string
      bins?: number
      extent?: [number, number] | null
      useQuantiles?: boolean
    }
  ) => Promise<GraphInfoHistogramResult>
  getFacetSummary: (
    args: GraphScopeQueryArgs & { column: string; maxItems?: number }
  ) => Promise<GraphInfoFacetRow[]>
  getFacetSummaries: (
    args: GraphScopeQueryArgs & { columns: string[]; maxItems?: number }
  ) => Promise<Record<string, GraphInfoFacetRow[]>>
  getInfoBarsBatch: (
    args: GraphScopeQueryArgs & { columns: string[]; maxItems?: number }
  ) => Promise<Record<string, Array<{ value: string; count: number }>>>
  getInfoHistogramsBatch: (
    args: GraphScopeQueryArgs & {
      columns: string[]
      bins?: number
      extent?: [number, number] | null
      extentsByColumn?: Record<string, [number, number] | null>
      useQuantiles?: boolean
    }
  ) => Promise<Record<string, GraphInfoHistogramResult>>
  getNumericStatsBatch: (
    args: GraphScopeQueryArgs & { columns: string[] }
  ) => Promise<Record<string, NumericStatsRow>>
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
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
  exportTableCsv: (args: {
    layer: MapLayer
    view: 'current' | 'selected'
    currentPointScopeSql: string | null
  }) => Promise<string>
}
