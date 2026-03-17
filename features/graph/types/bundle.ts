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
