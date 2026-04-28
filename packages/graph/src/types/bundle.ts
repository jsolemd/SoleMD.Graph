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
  base_points?: string
  base_clusters?: string
  universe_points?: string
  paper_documents?: string
  cluster_exemplars?: string
  universe_links?: string
  orb_entity_edges?: string
  manifest?: string
}

export interface GraphBundleArtifactSet {
  base: string[]
  universe: string[]
  evidence: string[]
}

export type GraphBundleProfile = 'base' | 'full'

export interface GraphBundleContract {
  artifactSets: GraphBundleArtifactSet
  files: GraphBundleContractFileSet
}

export interface GraphBundleManifest {
  bundleFormat: string
  bundleProfile: GraphBundleProfile
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
