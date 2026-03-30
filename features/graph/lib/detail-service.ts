'use client'

import {
  getGraphNodeDetail,
  getGraphAssetUrl,
  getGraphNeighborhood,
  getGraphRagQuery,
} from '@/app/actions/graph'

import type { GraphBundle, GraphPointRecord } from '@/features/graph/types'
import type {
  GraphAssetUrlResponsePayload,
  GraphDetailAsset,
  GraphNeighborhoodResponsePayload,
  GraphNodeDetailResponsePayload,
  GraphRagErrorResponsePayload,
  GraphRagQueryResponsePayload,
} from '@/features/graph/types/detail-service'

interface FetchGraphNodeDetailArgs {
  bundle: GraphBundle
  node: GraphPointRecord
}

interface RefreshGraphAssetUrlArgs {
  bundle: GraphBundle
  node: GraphPointRecord
  asset: GraphDetailAsset
  expiresInSeconds?: number
}

interface FetchGraphNeighborhoodArgs {
  bundle: GraphBundle
  node: GraphPointRecord
  limit?: number
  includeIncoming?: boolean
  includeOutgoing?: boolean
}

interface FetchGraphRagQueryArgs {
  bundle: GraphBundle
  query: string
  selectedNode?: GraphPointRecord | null
  selectionGraphPaperRefs?: string[] | null
  scopeMode?: 'global' | 'selection_only' | null
  selectedClusterId?: number | null
  evidenceIntent?: 'support' | 'refute' | 'both' | null
  k?: number
  rerankTopn?: number
  useLexical?: boolean
  generateAnswer?: boolean
}

interface CacheEntry {
  promise: Promise<GraphNodeDetailResponsePayload>
  timestamp: number
}

export class GraphRagRequestError extends Error {
  readonly payload: GraphRagErrorResponsePayload

  constructor(payload: GraphRagErrorResponsePayload) {
    super(payload.error_message)
    this.name = 'GraphRagRequestError'
    this.payload = payload
  }
}

const detailCache = new Map<string, CacheEntry>()
const CACHE_MAX = 100
const CACHE_TTL_MS = 5 * 60 * 1000

function cacheSet(key: string, promise: Promise<GraphNodeDetailResponsePayload>): Promise<GraphNodeDetailResponsePayload> {
  if (detailCache.size >= CACHE_MAX) {
    // Delete oldest entry (first key in insertion order)
    const firstKey = detailCache.keys().next().value
    if (firstKey !== undefined) detailCache.delete(firstKey)
  }
  detailCache.set(key, { promise, timestamp: Date.now() })
  return promise
}

function cacheGet(key: string): Promise<GraphNodeDetailResponsePayload> | undefined {
  const entry = detailCache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    detailCache.delete(key)
    return undefined
  }
  return entry.promise
}

export function clearDetailCache(): void {
  detailCache.clear()
}

function getGraphReleaseId(bundle: GraphBundle) {
  return bundle.bundleChecksum || bundle.runId || 'current'
}

export function supportsRemoteGraphNodeDetail(_node: GraphPointRecord) {
  return false
}

export async function fetchGraphNodeDetail({
  bundle,
  node,
}: FetchGraphNodeDetailArgs): Promise<GraphNodeDetailResponsePayload> {
  if (!supportsRemoteGraphNodeDetail(node)) {
    throw new Error('Remote graph detail is not enabled for the corpus runtime')
  }
  const cacheKey = `${getGraphReleaseId(bundle)}:${node.nodeKind}:${node.id}`
  const cached = cacheGet(cacheKey)

  if (cached) {
    return cached
  }

  const next = getGraphNodeDetail({
    graph_release_id: getGraphReleaseId(bundle),
    layer_key: node.nodeKind,
    node_id: node.id,
  }).catch((error) => {
    detailCache.delete(cacheKey)
    throw error
  })

  cacheSet(cacheKey, next)
  return next
}

export async function refreshGraphAssetUrl({
  bundle,
  node,
  asset,
  expiresInSeconds,
}: RefreshGraphAssetUrlArgs): Promise<GraphAssetUrlResponsePayload> {
  if (!supportsRemoteGraphNodeDetail(node)) {
    throw new Error('Remote graph asset URLs are not enabled for the corpus runtime')
  }

  return getGraphAssetUrl({
    graph_release_id: getGraphReleaseId(bundle),
    layer_key: node.nodeKind,
    node_id: node.id,
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    storage_path: asset.storage_path,
    expires_in_seconds: expiresInSeconds,
  })
}

export async function fetchGraphNeighborhood({
  bundle,
  node,
  limit,
  includeIncoming,
  includeOutgoing,
}: FetchGraphNeighborhoodArgs): Promise<GraphNeighborhoodResponsePayload> {
  if (!supportsRemoteGraphNodeDetail(node)) {
    throw new Error('Remote graph neighborhoods are not enabled for the corpus runtime')
  }

  return getGraphNeighborhood({
    graph_release_id: getGraphReleaseId(bundle),
    layer_key: node.nodeKind,
    node_id: node.id,
    limit,
    include_incoming: includeIncoming,
    include_outgoing: includeOutgoing,
  })
}

export async function fetchGraphRagQuery({
  bundle,
  query,
  selectedNode,
  selectionGraphPaperRefs,
  scopeMode,
  selectedClusterId,
  evidenceIntent,
  k,
  rerankTopn,
  useLexical,
  generateAnswer,
}: FetchGraphRagQueryArgs): Promise<GraphRagQueryResponsePayload> {
  const result = await getGraphRagQuery({
    graph_release_id: getGraphReleaseId(bundle),
    query,
    selected_layer_key: selectedNode ? 'paper' : null,
    selected_node_id: selectedNode?.id ?? null,
    selected_graph_paper_ref: selectedNode?.paperId ?? selectedNode?.id ?? null,
    selected_paper_id: null,
    selection_graph_paper_refs: selectionGraphPaperRefs ?? null,
    selected_cluster_id: selectedClusterId ?? null,
    scope_mode: scopeMode ?? null,
    evidence_intent: evidenceIntent ?? null,
    k,
    rerank_topn: rerankTopn,
    use_lexical: useLexical,
    generate_answer: generateAnswer,
  })

  if (!result.ok) {
    throw new GraphRagRequestError(result.error)
  }

  return result.data
}
