import type { GraphNode, AuthorGeoRow } from './nodes'
import type { GraphClusterDetail } from './detail'
import type { PaperDocument } from './detail'
import type { GraphSelectionDetail } from './detail'
import type { MapLayer } from './config'

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
  rows: GraphNode[]
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

export interface GraphSearchResult {
  id: string
  index: number
  label: string
  matchedValue: string | null
  subtitle: string | null
}

export interface GraphVisibilityBudget {
  seedIndex: number
  clusterId: number | null
  includeCluster: boolean
  xMin: number | null
  xMax: number | null
  yMin: number | null
  yMax: number | null
}

export interface GraphScopeQueryArgs {
  layer: MapLayer
  scope: GraphInfoScope
  currentPointIndices: number[] | null
  currentPointScopeSql: string | null
  selectedPointIndices: number[]
}

export interface GraphBundleQueries {
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getInstitutionAuthors: (institutionKey: string) => Promise<AuthorGeoRow[]>
  /** Query all institutions an author has been affiliated with. Uses ORCID when available, falls back to name. */
  getAuthorInstitutions: (name: string, orcid: string | null) => Promise<AuthorGeoRow[]>
  getSelectionDetail: (node: GraphNode) => Promise<GraphSelectionDetail>
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
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
  getInfoSummary: (args: GraphScopeQueryArgs) => Promise<GraphInfoSummary>
  getInfoBars: (
    args: GraphScopeQueryArgs & { column: string; maxItems?: number }
  ) => Promise<Array<{ value: string; count: number }>>
  getInfoHistogram: (
    args: GraphScopeQueryArgs & { column: string; bins?: number }
  ) => Promise<{ bins: GraphInfoHistogramBin[]; totalCount: number }>
  getFacetSummary: (
    args: GraphScopeQueryArgs & { column: string; maxItems?: number }
  ) => Promise<GraphInfoFacetRow[]>
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
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}
