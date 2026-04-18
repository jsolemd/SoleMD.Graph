import type { GraphBundleContract } from "@solemd/graph"

export const GRAPH_NAME = 'cosmograph'
export const NODE_KIND = 'corpus'
export const GRAPH_BUNDLE_ROOT =
  process.env.GRAPH_BUNDLE_ROOT ??
  '/mnt/solemd-graph/bundles'
export const GRAPH_BUNDLE_PUBLISHED_ROOT = `${GRAPH_BUNDLE_ROOT}/by-checksum`

// Contract taxonomy is not bootstrap policy:
// - `base` is the only mandatory first-load/autoload set
// - `universe` is browser-attachable only on demand
// - `evidence` stays off the startup browser path
export const DEFAULT_BUNDLE_CONTRACT: GraphBundleContract = {
  artifactSets: {
    base: ['base_points', 'base_clusters'],
    universe: ['universe_points', 'paper_documents', 'cluster_exemplars'],
    // These describe optional non-hot-path evidence surfaces in the manifest.
    // They are not permission to autoattach evidence payloads to the live graph
    // runtime or to widen the browser render/query path. `universe_links` is
    // the overlay-activation exception: browser-attachable when needed, but
    // still not a first-load artifact.
    evidence: [
      'universe_links',
      'citation_neighborhood',
      'pubtator_annotations',
      'pubtator_relations',
      'paper_assets',
      'full_text',
      'rag_chunks',
    ],
  },
  files: {
    base_points: 'base_points.parquet',
    base_clusters: 'base_clusters.parquet',
    universe_points: 'universe_points.parquet',
    paper_documents: 'paper_documents.parquet',
    cluster_exemplars: 'cluster_exemplars.parquet',
    universe_links: 'universe_links.parquet',
    manifest: 'manifest.json',
  },
}

export const CANONICAL_BUNDLE_VERSION = '4'
// Only the base tables belong to the mandatory browser startup path.
export const REQUIRED_BUNDLE_TABLES = ['base_points', 'base_clusters'] as const
export const DEPRECATED_BUNDLE_TABLES = [
  'corpus_points',
  'corpus_clusters',
  'reservoir_points',
  'corpus_documents',
  'corpus_cluster_exemplars',
  'corpus_links',
  'graph_points',
  'graph_clusters',
  'graph_facets',
  'graph_cluster_exemplars',
  'paper_points',
] as const

export interface GraphRunRow {
  bundle_bytes: number | string | null
  bundle_checksum: string
  bundle_format: string
  bundle_manifest: Record<string, unknown> | null
  bundle_uri: string
  bundle_version: string
  created_at: string
  graph_name: string
  id: string
  node_kind: string
  qa_summary: Record<string, unknown> | null
}
