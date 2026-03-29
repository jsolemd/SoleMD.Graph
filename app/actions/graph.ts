'use server'

import type {
  GraphEvidenceBundle,
  GraphNodeDetailResponsePayload,
  GraphAssetUrlResponsePayload,
  GraphRagGraphSignal,
  GraphNeighborhoodResponsePayload,
  GraphRagResult,
  GraphRagQueryResponsePayload,
} from '@/features/graph/types'
import { searchEvidence, type EngineEvidenceBundle, type EngineGraphSignal } from '@/lib/engine/rag'

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
  selected_paper_id?: string | null
  selected_cluster_id: number | null
  evidence_intent?: 'support' | 'refute' | 'both' | null
  k?: number
  rerank_topn?: number
  use_lexical?: boolean
  generate_answer?: boolean
}

// Phase 3 stubs — these server actions will be wired to the engine API once
// the graph detail endpoints are implemented. Return typed stubs so callers
// get a clean signal instead of an unhandled exception.

const NOT_IMPLEMENTED = 'Not implemented — awaiting engine API (Phase 3)'

function mapEvidenceBundleToResult(bundle: EngineEvidenceBundle): GraphRagResult {
  const paperId = bundle.paper.paper_id ?? String(bundle.paper.corpus_id)
  return {
    chunk_id: `paper:${bundle.paper.corpus_id}`,
    paper_id: paperId,
    citekey: null,
    doi: bundle.paper.doi,
    paper_title: bundle.paper.title,
    paper_year: bundle.paper.year,
    section:
      bundle.citation_contexts.length > 0
        ? 'citation context'
        : bundle.matched_channels[0]?.replaceAll('_', ' ') || 'paper evidence',
    kind: bundle.matched_channels[0] || 'paper',
    chunk_index: Math.max(0, bundle.rank - 1),
    page: null,
    text: bundle.snippet || bundle.paper.tldr || bundle.paper.abstract || bundle.paper.title || '',
    dense_score: bundle.rank_features.semantic_neighbor ?? 0,
    lex_score: bundle.rank_features.lexical ?? 0,
    fused_score: bundle.score,
    rerank_score: null,
  }
}

function mapEvidenceBundle(bundle: EngineEvidenceBundle): GraphEvidenceBundle {
  const paperId = bundle.paper.paper_id ?? String(bundle.paper.corpus_id)
  return {
    paper_id: paperId,
    paper: {
      paper_id: paperId,
      semantic_scholar_paper_id: bundle.paper.semantic_scholar_paper_id ?? bundle.paper.paper_id,
      title: bundle.paper.title,
      journal_name: bundle.paper.journal_name,
      year: bundle.paper.year,
      doi: bundle.paper.doi,
      pmid: bundle.paper.pmid,
      pmcid: bundle.paper.pmcid,
      abstract: bundle.paper.abstract,
      tldr: bundle.paper.tldr,
      text_availability: bundle.paper.text_availability,
      is_open_access: bundle.paper.is_open_access,
    },
    score: bundle.score,
    rank: bundle.rank,
    snippet: bundle.snippet,
    matched_channels: bundle.matched_channels,
    match_reasons: bundle.match_reasons,
    rank_features: bundle.rank_features,
    citation_contexts: bundle.citation_contexts,
    entity_hits: bundle.entity_hits,
    relation_hits: bundle.relation_hits,
    references: bundle.references,
    assets: bundle.assets,
  }
}

function mapGraphSignal(signal: EngineGraphSignal): GraphRagGraphSignal {
  return {
    corpus_id: signal.corpus_id,
    paper_id: signal.paper_id,
    signal_kind: signal.signal_kind,
    channel: signal.channel,
    score: signal.score,
    rank: signal.rank,
    reason: signal.reason,
    matched_terms: signal.matched_terms,
  }
}

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
  input: GraphRagQueryInput,
): Promise<GraphRagQueryResponsePayload> {
  const response = await searchEvidence({
    graph_release_id: input.graph_release_id,
    query: input.query,
    selected_layer_key:
      input.selected_layer_key === 'paper' || input.selected_layer_key === 'chunk'
        ? input.selected_layer_key
        : null,
    selected_node_id: input.selected_node_id,
    selected_paper_id: input.selected_paper_id ?? input.selected_node_id,
    selected_cluster_id: input.selected_cluster_id,
    evidence_intent: input.evidence_intent,
    k: input.k,
    rerank_topn: input.rerank_topn,
    use_lexical: input.use_lexical,
    generate_answer: input.generate_answer,
  })

  return {
    meta: {
      request_id: response.meta.request_id,
      generated_at: response.meta.generated_at,
      duration_ms: response.meta.duration_ms,
      cache_control: response.meta.cache_control,
      retrieval_version: response.meta.retrieval_version,
    },
    release: {
      graph_release_id: response.graph_context.graph_release_id,
      graph_run_id: response.graph_context.graph_release_id,
      bundle_checksum: response.graph_context.graph_release_id,
      graph_name: response.graph_context.graph_name,
      layer_key: response.graph_context.selected_layer_key ?? 'paper',
      node_kind: response.graph_context.selected_layer_key === 'chunk' ? 'rag_chunk' : 'paper',
      is_current: true,
    },
    query: response.query,
    selected_layer_key: response.graph_context.selected_layer_key,
    selected_node_id: response.graph_context.selected_node_id,
    selected_paper_id: response.graph_context.selected_paper_id,
    selected_cluster_id: response.graph_context.selected_cluster_id,
    answer: response.answer,
    answer_model: response.answer_model,
    results: response.evidence_bundles.map(mapEvidenceBundleToResult),
    evidence_bundles: response.evidence_bundles.map(mapEvidenceBundle),
    graph_signals: response.graph_signals.map(mapGraphSignal),
    retrieval_channels: response.retrieval_channels,
  }
}
