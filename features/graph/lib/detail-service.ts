'use client'

import { createBrowserClient } from '@/lib/supabase/client'

import type { GraphBundle, GraphNode } from '@/features/graph/types'

export interface GraphDetailAssetAccess {
  access_kind: 'public' | 'signed' | 'unavailable'
  url: string | null
  issued_at: string
  expires_in_seconds?: number | null
}

export interface GraphDetailAsset {
  asset_id: string | null
  asset_type: string
  page_number: number | null
  storage_path: string
  content_type: string | null
  byte_size: number | null
  caption: string | null
  preview_text: string | null
  block_id: string | null
  section_path: string[]
  access: GraphDetailAssetAccess | null
  metadata: Record<string, unknown>
  table_json: Record<string, unknown> | unknown[] | null
}

export interface GraphDetailAuthor {
  author_index: number
  name: string
  surname: string | null
  given_name: string | null
  affiliation: string | null
  email: string | null
  orcid: string | null
  source: string | null
}

export interface GraphDetailPaperRef {
  paper_id: string
  citekey: string | null
  title: string | null
  journal: string | null
  year: number | null
  doi: string | null
  pmid: string | null
  pmcid: string | null
}

export interface GraphDetailReference {
  ref_index: number
  title: string | null
  authors: unknown[]
  year: number | null
  journal: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  publisher: string | null
  doi: string | null
  pmid: string | null
  pmcid: string | null
  arxiv_id: string | null
  raw_citation_text: string | null
  contexts: unknown[]
  resolved_paper_id: string | null
  resolution_method: string | null
  resolution_confidence: number | null
  resolved_paper: GraphDetailPaperRef | null
}

export interface GraphDetailCitation {
  citation_id: string
  related_paper_id: string | null
  related_paper: GraphDetailPaperRef | null
  confidence: number | null
  extraction_method: string | null
  cited_title_raw: string | null
  cited_doi: string | null
  cited_pmid: string | null
  cited_reference_id: string | null
}

export interface GraphDetailChunkSummary {
  chunk_id: string
  stable_chunk_id: string
  chunk_index: number
  page_number: number | null
  chunk_kind: string | null
  section_type: string | null
  section_canonical: string | null
  preview: string
}

export interface GraphDetailChunkEntity {
  entity_id: string
  text: string
  label: string
  mention_count: number | null
  salience_score: number | null
  entity_text_in_chunk: string | null
  match_method: string | null
  confidence: number | null
  assertion_status: string | null
  temporal_status: string | null
  is_negated: boolean | null
  umls_cui: string | null
  rxnorm_cui: string | null
  semantic_types: string[]
}

export interface GraphNodeDetailResponsePayload {
  meta: {
    request_id: string
    generated_at: string
    duration_ms: number
    cache_control: string
  }
  release: {
    graph_release_id: string
    graph_run_id: string
    bundle_checksum: string | null
    graph_name: string
    layer_key: 'paper' | 'chunk'
    node_kind: 'paper' | 'rag_chunk'
    is_current: boolean
  }
  node_id: string
  layer_key: 'paper' | 'chunk'
  node_kind: 'paper' | 'rag_chunk'
  paper: {
    paper_id: string
    doc_hash: string
    citekey: string | null
    title: string | null
    abstract: string | null
    journal: string | null
    year: number | null
    doi: string | null
    pmid: string | null
    pmcid: string | null
    page_count: number | null
    table_count: number | null
    figure_count: number | null
    reference_count: number | null
    author_count: number | null
    chunk_count: number | null
    entity_count: number | null
    relation_count: number | null
    asset_count: number | null
    paper_metrics: Record<string, unknown>
    pdf_asset: GraphDetailAsset | null
    authors: GraphDetailAuthor[]
    references: GraphDetailReference[]
    outgoing_citations: GraphDetailCitation[]
    incoming_citations: GraphDetailCitation[]
    assets: GraphDetailAsset[]
    narrative_chunks: GraphDetailChunkSummary[]
  } | null
  chunk: {
    chunk_id: string
    paper_id: string
    stable_chunk_id: string
    chunk_text: string
    chunk_index: number
    token_count: number | null
    char_count: number | null
    page_number: number | null
    chunk_kind: string | null
    section_type: string | null
    section_canonical: string | null
    section_path: string[]
    block_id: string | null
    block_type: string | null
    metadata: Record<string, unknown>
    paper: GraphDetailPaperRef
    paper_pdf_asset: GraphDetailAsset | null
    page_assets: GraphDetailAsset[]
    neighboring_chunks: GraphDetailChunkSummary[]
    entities: GraphDetailChunkEntity[]
  } | null
}

export interface GraphAssetUrlResponsePayload {
  meta: {
    request_id: string
    generated_at: string
    duration_ms: number
    cache_control: string
  }
  release: GraphNodeDetailResponsePayload['release']
  node_id: string
  layer_key: 'paper' | 'chunk'
  asset_id: string | null
  asset_type: string
  storage_path: string | null
  access: GraphDetailAssetAccess | null
}

export interface GraphPaperNeighborhoodItem {
  relation_kind: 'citation'
  direction: 'incoming' | 'outgoing'
  citation_id: string
  paper: GraphDetailPaperRef | null
  confidence: number | null
  extraction_method: string | null
}

export interface GraphChunkNeighborhoodItem {
  relation_kind: 'adjacent_chunk'
  direction: 'neighbor'
  chunk: GraphDetailChunkSummary
}

export interface GraphNeighborhoodResponsePayload {
  meta: {
    request_id: string
    generated_at: string
    duration_ms: number
    cache_control: string
  }
  release: GraphNodeDetailResponsePayload['release']
  node_id: string
  layer_key: 'paper' | 'chunk'
  node_kind: 'paper' | 'rag_chunk'
  paper_neighbors: GraphPaperNeighborhoodItem[]
  chunk_neighbors: GraphChunkNeighborhoodItem[]
}

export interface GraphRagResult {
  chunk_id: string
  paper_id: string | null
  citekey: string | null
  doi: string | null
  paper_title: string | null
  paper_year: number | null
  section: string | null
  kind: string
  chunk_index: number
  page: number | null
  text: string
  dense_score: number
  lex_score: number
  fused_score: number
  rerank_score: number | null
}

export interface GraphRagQueryResponsePayload {
  meta: {
    request_id: string
    generated_at: string
    duration_ms: number
    cache_control: string
  }
  release: GraphNodeDetailResponsePayload['release']
  query: string
  selected_layer_key: 'paper' | 'chunk' | null
  selected_node_id: string | null
  selected_cluster_id: number | null
  answer: string | null
  answer_model: string | null
  results: GraphRagResult[]
}

interface FetchGraphNodeDetailArgs {
  bundle: GraphBundle
  node: GraphNode
}

interface RefreshGraphAssetUrlArgs {
  bundle: GraphBundle
  node: GraphNode
  asset: GraphDetailAsset
  expiresInSeconds?: number
}

interface FetchGraphNeighborhoodArgs {
  bundle: GraphBundle
  node: GraphNode
  limit?: number
  includeIncoming?: boolean
  includeOutgoing?: boolean
}

interface FetchGraphRagQueryArgs {
  bundle: GraphBundle
  query: string
  selectedNode?: GraphNode | null
  selectedClusterId?: number | null
  k?: number
  rerankTopn?: number
  useLexical?: boolean
  generateAnswer?: boolean
}

const detailCache = new Map<string, Promise<GraphNodeDetailResponsePayload>>()
const CACHE_MAX = 100

function cacheSet(key: string, value: Promise<GraphNodeDetailResponsePayload>): Promise<GraphNodeDetailResponsePayload> {
  if (detailCache.size >= CACHE_MAX) {
    // Delete oldest entry (first key in insertion order)
    const firstKey = detailCache.keys().next().value
    if (firstKey !== undefined) detailCache.delete(firstKey)
  }
  detailCache.set(key, value)
  return value
}

function getGraphReleaseId(bundle: GraphBundle) {
  return bundle.bundleChecksum || bundle.runId || 'current'
}

export function supportsRemoteGraphNodeDetail(node: GraphNode) {
  return node.nodeKind === 'paper' || node.nodeKind === 'chunk'
}

export async function fetchGraphNodeDetail({
  bundle,
  node,
}: FetchGraphNodeDetailArgs): Promise<GraphNodeDetailResponsePayload> {
  if (!supportsRemoteGraphNodeDetail(node)) {
    throw new Error(`Remote graph detail is not supported for node kind "${node.nodeKind}"`)
  }
  const cacheKey = `${getGraphReleaseId(bundle)}:${node.nodeKind}:${node.id}`
  const cached = detailCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const next = (async () => {
    const supabase = createBrowserClient()
    const { data, error } = await supabase.functions.invoke('graph-node-detail', {
      body: {
        graph_release_id: getGraphReleaseId(bundle),
        layer_key: node.nodeKind,
        node_id: node.id,
      },
    })

    if (error) {
      throw error
    }

    return data as GraphNodeDetailResponsePayload
  })().catch((error) => {
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
    throw new Error(`Remote graph asset URLs are not supported for node kind "${node.nodeKind}"`)
  }
  const supabase = createBrowserClient()
  const { data, error } = await supabase.functions.invoke('graph-asset-url', {
    body: {
      graph_release_id: getGraphReleaseId(bundle),
      layer_key: node.nodeKind,
      node_id: node.id,
      asset_id: asset.asset_id,
      asset_type: asset.asset_type,
      storage_path: asset.storage_path,
      expires_in_seconds: expiresInSeconds,
    },
  })

  if (error) {
    throw error
  }

  return data as GraphAssetUrlResponsePayload
}

export async function fetchGraphNeighborhood({
  bundle,
  node,
  limit,
  includeIncoming,
  includeOutgoing,
}: FetchGraphNeighborhoodArgs): Promise<GraphNeighborhoodResponsePayload> {
  if (!supportsRemoteGraphNodeDetail(node)) {
    throw new Error(`Remote graph neighborhoods are not supported for node kind "${node.nodeKind}"`)
  }
  const supabase = createBrowserClient()
  const { data, error } = await supabase.functions.invoke('graph-neighborhood', {
    body: {
      graph_release_id: getGraphReleaseId(bundle),
      layer_key: node.nodeKind,
      node_id: node.id,
      limit,
      include_incoming: includeIncoming,
      include_outgoing: includeOutgoing,
    },
  })

  if (error) {
    throw error
  }

  return data as GraphNeighborhoodResponsePayload
}

export async function fetchGraphRagQuery({
  bundle,
  query,
  selectedNode,
  selectedClusterId,
  k,
  rerankTopn,
  useLexical,
  generateAnswer,
}: FetchGraphRagQueryArgs): Promise<GraphRagQueryResponsePayload> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.functions.invoke('graph-rag-query', {
    body: {
      graph_release_id: getGraphReleaseId(bundle),
      query,
      selected_layer_key:
        selectedNode?.nodeKind === 'paper'
          ? 'paper'
          : selectedNode?.nodeKind === 'chunk'
            ? 'chunk'
            : null,
      selected_node_id: selectedNode?.id ?? null,
      selected_cluster_id: selectedClusterId ?? null,
      k,
      rerank_topn: rerankTopn,
      use_lexical: useLexical,
      generate_answer: generateAnswer,
    },
  })

  if (error) {
    throw error
  }

  return data as GraphRagQueryResponsePayload
}
