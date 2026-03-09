export interface GraphBundleDuckDBFile {
  path: string
  bytes: number
  sha256: string
}

export interface GraphBundleTableManifest {
  bytes: number
  columns: string[]
  parquetFile: string
  rowCount: number
  schema: Array<{
    name: string
    type: string
  }>
  sha256: string
}

export interface GraphBundleManifest {
  bundleFormat: string
  bundleVersion: string
  createdAt: string | null
  duckdbFile: GraphBundleDuckDBFile | null
  graphName: string
  graphRunId: string
  nodeKind: string
  tables: Record<string, GraphBundleTableManifest>
}

export interface GraphBundle {
  assetBaseUrl: string
  bundleBytes: number
  bundleChecksum: string
  bundleFormat: string
  bundleManifest: GraphBundleManifest
  bundleUri: string
  bundleVersion: string
  duckdbUrl: string
  graphName: string
  manifestUrl: string
  nodeKind: string
  qaSummary: Record<string, unknown> | null
  runId: string
  tableUrls: Record<string, string>
}

export interface ChunkNode {
  index: number
  id: string
  x: number
  y: number
  color: string
  clusterId: number
  clusterLabel: string | null
  clusterProbability: number
  outlierScore: number
  paperId: string
  paperTitle: string
  citekey: string
  year: number | null
  journal: string | null
  doi: string | null
  pmid: string | null
  pmcid: string | null
  stableChunkId: string | null
  chunkIndex: number | null
  sectionType: string | null
  sectionCanonical: string | null
  sectionPath: string | null
  pageNumber: number | null
  tokenCount: number | null
  charCount: number | null
  chunkKind: string | null
  blockType: string | null
  blockId: string | null
  chunkPreview: string | null
  paperAuthorCount: number | null
  paperReferenceCount: number | null
  paperAssetCount: number | null
  paperChunkCount: number | null
  paperEntityCount: number | null
  paperRelationCount: number | null
  paperSentenceCount: number | null
  paperPageCount: number | null
  paperTableCount: number | null
  paperFigureCount: number | null
  hasTableContext: boolean
  hasFigureContext: boolean
}

export interface ClusterInfo {
  clusterId: number
  label: string
  labelMode: string | null
  labelSource: string | null
  memberCount: number
  centroidX: number
  centroidY: number
  representativeRagChunkId: string | null
  candidateCount: number | null
  entityCandidateCount: number | null
  lexicalCandidateCount: number | null
  meanClusterProbability: number | null
  meanOutlierScore: number | null
  paperCount: number | null
  isNoise: boolean
}

export interface ClusterExemplar {
  clusterId: number
  rank: number
  ragChunkId: string
  paperId: string
  citekey: string | null
  paperTitle: string | null
  sectionType: string | null
  sectionCanonical: string | null
  pageNumber: number | null
  exemplarScore: number
  isRepresentative: boolean
  chunkPreview: string | null
}

export interface GraphFacet {
  facetName: string
  facetValue: string
  facetLabel: string | null
  pointCount: number
  paperCount: number
  clusterCount: number
  sortKey: string | null
}

export interface GraphStats {
  chunks: number
  papers: number
  clusters: number
  noise: number
}

export interface GraphData {
  clusters: ClusterInfo[]
  clusterColors: Record<number, string>
  facets: GraphFacet[]
  nodes: ChunkNode[]
  stats: GraphStats
}

export interface PaperAuthor {
  affiliation: string | null
  givenName: string | null
  name: string
  orcid: string | null
  surname: string | null
}

export interface GraphPaperDetail {
  abstract: string | null
  assetCount: number | null
  authorCount: number | null
  authors: PaperAuthor[]
  chunkCount: number | null
  citekey: string | null
  doi: string | null
  entityCount: number | null
  figureCount: number | null
  graphClusterCount: number | null
  graphPointCount: number | null
  journal: string | null
  paperId: string
  pageCount: number | null
  pmcid: string | null
  pmid: string | null
  referenceCount: number | null
  relationCount: number | null
  sentenceCount: number | null
  tableCount: number | null
  title: string | null
  year: number | null
}

export interface ChunkDetail {
  abstract: string | null
  blockId: string | null
  blockType: string | null
  charCount: number | null
  chunkIndex: number | null
  chunkKind: string | null
  chunkPreview: string | null
  chunkText: string | null
  citekey: string | null
  clusterId: number | null
  clusterLabel: string | null
  clusterProbability: number | null
  doi: string | null
  journal: string | null
  outlierScore: number | null
  pageNumber: number | null
  paperId: string
  pmcid: string | null
  pmid: string | null
  ragChunkId: string
  sectionCanonical: string | null
  sectionPath: string | null
  sectionType: string | null
  sourceEmbeddingId: string | null
  stableChunkId: string | null
  title: string | null
  tokenCount: number | null
  year: number | null
}

export interface GraphSelectionDetail {
  chunk: ChunkDetail | null
  cluster: ClusterInfo | null
  exemplars: ClusterExemplar[]
  paper: GraphPaperDetail | null
}

export interface GraphQueryResult {
  appliedLimit: number | null
  columns: string[]
  durationMs: number
  executedSql: string
  rowCount: number
  rows: Array<Record<string, unknown>>
}

export interface GraphBundleQueries {
  getSelectionDetail: (node: ChunkNode) => Promise<GraphSelectionDetail>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}

export type GraphMode = 'ask' | 'explore' | 'learn' | 'write'

export type PointColorStrategy = 'categorical' | 'continuous' | 'direct' | 'single'
export type PointSizeStrategy = 'auto' | 'direct' | 'single'
export type ColorSchemeName =
  | 'default'
  | 'warm'
  | 'cool'
  | 'spectral'
  | 'viridis'
  | 'plasma'
  | 'turbo'

export type FilterableColumnKey = Exclude<keyof ChunkNode, 'index' | 'color'>

export type NumericColumnKey =
  | 'clusterProbability'
  | 'outlierScore'
  | 'year'
  | 'pageNumber'
  | 'tokenCount'
  | 'x'
  | 'y'

export type DataColumnKey = FilterableColumnKey

export type SizeColumnKey = 'none' | NumericColumnKey

