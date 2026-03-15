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

/** Fields shared by all node types (chunk and paper). */
export interface GraphNodeBase {
  index: number
  id: string
  x: number
  y: number
  color: string
  colorLight: string
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
}

export interface ChunkNode extends GraphNodeBase {
  nodeKind: 'chunk'
  stableChunkId: string | null
  chunkIndex: number | null
  sectionCanonical: string | null
  pageNumber: number | null
  tokenCount: number | null
  charCount: number | null
  chunkKind: string | null
  hasTableContext: boolean
  hasFigureContext: boolean
}

export interface PaperNode extends GraphNodeBase {
  nodeKind: 'paper'
  displayPreview: string | null
  payloadWasTruncated: boolean
}

/** Geographic institution node for the map layer. */
export interface GeoNode extends GraphNodeBase {
  nodeKind: 'institution'
  institution: string | null
  rorId: string | null
  city: string | null
  region: string | null
  country: string | null
  countryCode: string | null
  paperCount: number
  authorCount: number
  firstYear: number | null
  lastYear: number | null
}

export type GraphNode = ChunkNode | PaperNode | GeoNode

/** Collaboration edge between two institutions for the geo layer. */
export interface GeoLink {
  sourceId: string
  targetId: string
  sourceIndex: number
  targetIndex: number
  paperCount: number
  sourceLng: number
  sourceLat: number
  targetLng: number
  targetLat: number
}

/** Author row from the graph_author_geo table for institution drill-down. */
export interface AuthorGeoRow {
  authorId: string
  name: string | null
  surname: string | null
  givenName: string | null
  orcid: string | null
  citekey: string | null
  paperTitle: string | null
  year: number | null
  institution: string | null
  department: string | null
  institutionKey: string | null
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
  points: number
  pointLabel: string
  papers: number
  clusters: number
  noise: number
}

export interface GraphData {
  clusters: ClusterInfo[]
  facets: GraphFacet[]
  nodes: ChunkNode[]
  paperNodes: PaperNode[]
  geoNodes: GeoNode[]
  geoLinks: GeoLink[]
  paperStats: GraphStats | null
  geoStats: GraphStats | null
  stats: GraphStats
}

export interface PaperDocument {
  paperId: string
  sourceEmbeddingId: string | null
  citekey: string | null
  title: string | null
  sourcePayloadPolicy: string | null
  sourceTextHash: string | null
  contextLabel: string | null
  displayPreview: string | null
  wasTruncated: boolean
  contextCharCount: number | null
  bodyCharCount: number | null
  textCharCount: number | null
  contextTokenCount: number | null
  bodyTokenCount: number | null
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
  paperDocument: PaperDocument | null
}

export interface GraphClusterDetail {
  cluster: ClusterInfo | null
  exemplars: ClusterExemplar[]
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
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getInstitutionAuthors: (institutionKey: string) => Promise<AuthorGeoRow[]>
  getSelectionDetail: (node: GraphNode) => Promise<GraphSelectionDetail>
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}

export type GraphMode = 'ask' | 'explore' | 'learn' | 'create'

export type MapLayer = 'chunk' | 'paper' | 'geo'

export type ColorTheme = 'light' | 'dark'
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

export type FilterableColumnKey = Exclude<keyof ChunkNode, 'index' | 'color' | 'colorLight' | 'nodeKind'>

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
