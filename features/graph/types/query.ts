import type { GraphNode, AuthorGeoRow } from './nodes'
import type { GraphClusterDetail } from './detail'
import type { PaperDocument } from './detail'
import type { GraphSelectionDetail } from './detail'

export interface GraphQueryResult {
  appliedLimit: number | null
  columns: string[]
  durationMs: number
  executedSql: string
  rowCount: number
  rows: Array<Record<string, unknown>>
}

export interface GraphBundleQueries {
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getInstitutionAuthors: (institutionKey: string) => Promise<AuthorGeoRow[]>
  /** Query all institutions an author has been affiliated with. Uses ORCID when available, falls back to name. */
  getAuthorInstitutions: (name: string, orcid: string | null) => Promise<AuthorGeoRow[]>
  getSelectionDetail: (node: GraphNode) => Promise<GraphSelectionDetail>
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}
