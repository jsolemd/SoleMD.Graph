'use server'

import type {
  GraphNodeDetailResponsePayload,
  GraphAssetUrlResponsePayload,
  GraphNeighborhoodResponsePayload,
  GraphRagQueryResponsePayload,
} from '@/features/graph/lib/detail-service'

interface GraphNodeDetailInput {
  graph_release_id: string
  layer_key: string
  node_id: string
}

interface GraphAssetUrlInput {
  graph_release_id: string
  layer_key: string
  node_id: string
  asset_id: string | null
  asset_type: string
  storage_path: string
  expires_in_seconds?: number
}

interface GraphNeighborhoodInput {
  graph_release_id: string
  layer_key: string
  node_id: string
  limit?: number
  include_incoming?: boolean
  include_outgoing?: boolean
}

interface GraphRagQueryInput {
  graph_release_id: string
  query: string
  selected_layer_key: string | null
  selected_node_id: string | null
  selected_cluster_id: number | null
  k?: number
  rerank_topn?: number
  use_lexical?: boolean
  generate_answer?: boolean
}

// Phase 3 stubs — these server actions will be wired to the engine API once
// the graph detail endpoints are implemented. Return typed stubs so callers
// get a clean signal instead of an unhandled exception.

const NOT_IMPLEMENTED = 'Not implemented — awaiting engine API (Phase 3)'

export async function getGraphNodeDetail(
  _input: GraphNodeDetailInput,
): Promise<GraphNodeDetailResponsePayload> {
  return { error: NOT_IMPLEMENTED } as unknown as GraphNodeDetailResponsePayload
}

export async function getGraphAssetUrl(
  _input: GraphAssetUrlInput,
): Promise<GraphAssetUrlResponsePayload> {
  return { error: NOT_IMPLEMENTED } as unknown as GraphAssetUrlResponsePayload
}

export async function getGraphNeighborhood(
  _input: GraphNeighborhoodInput,
): Promise<GraphNeighborhoodResponsePayload> {
  return { error: NOT_IMPLEMENTED } as unknown as GraphNeighborhoodResponsePayload
}

export async function getGraphRagQuery(
  _input: GraphRagQueryInput,
): Promise<GraphRagQueryResponsePayload> {
  return { error: NOT_IMPLEMENTED } as unknown as GraphRagQueryResponsePayload
}
