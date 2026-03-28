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

export interface GraphBundleContractFileSet {
  corpus_points?: string
  corpus_clusters?: string
  corpus_documents?: string
  corpus_cluster_exemplars?: string
  corpus_links?: string
  manifest?: string
}

export interface GraphBundleArtifactSet {
  hot: string[]
  warm: string[]
  cold: string[]
}

export interface GraphBundleContract {
  artifactSets: GraphBundleArtifactSet
  files: GraphBundleContractFileSet
}

export interface GraphBundleManifest {
  bundleFormat: string
  bundleProfile: string
  bundleVersion: string
  contract: GraphBundleContract
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
  duckdbUrl: string | null
  graphName: string
  manifestUrl: string
  nodeKind: string
  qaSummary: Record<string, unknown> | null
  runId: string
  tableUrls: Record<string, string>
}

export interface GraphBundleLoadProgress {
  stage:
    | 'resolving'
    | 'views'
    | 'clusters'
    | 'facets'
    | 'points'
    | 'hydrating'
    | 'ready'
  message: string
  percent: number
  loadedRows?: number
  totalRows?: number
}
