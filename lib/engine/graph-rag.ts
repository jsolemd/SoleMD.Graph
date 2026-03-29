import 'server-only'

import type {
  GraphEvidenceBundle,
  GraphRagErrorResponsePayload,
  GraphRagGraphSignal,
  GraphRagQueryRequestPayload,
  GraphRagQueryResponsePayload,
  GraphRagResult,
} from '@/features/graph/types'
import { EngineApiError } from './client'
import {
  searchEvidence,
  type EngineEvidenceBundle,
  type EngineGraphSignal,
  type EngineRagSearchRequest,
  type EngineRagSearchResponse,
} from './rag'

export type GraphEvidenceSearchInput = GraphRagQueryRequestPayload

export async function searchGraphEvidence(
  input: GraphEvidenceSearchInput,
  options?: {
    signal?: AbortSignal
  },
): Promise<GraphRagQueryResponsePayload> {
  const response = await searchEvidence(mapGraphQueryToEngineRequest(input), options)
  return mapEngineRagResponse(response)
}

export function toGraphRagErrorResponse(
  error: unknown,
): GraphRagErrorResponsePayload {
  if (error instanceof EngineApiError) {
    return {
      error_code:
        isGraphRagErrorCode(error.errorCode) ? error.errorCode : getErrorCode(error.status),
      error_message: error.message,
      request_id: error.requestId ?? getBodyStringField(error.body, 'request_id'),
      retry_after: error.retryAfter,
      status: error.status,
    }
  }

  if (error instanceof Error) {
    return {
      error_code: 'unknown_error',
      error_message: error.message,
      request_id: null,
      retry_after: null,
      status: 500,
    }
  }

  return {
    error_code: 'unknown_error',
    error_message: 'Unknown graph evidence error',
    request_id: null,
    retry_after: null,
    status: 500,
  }
}

function mapGraphQueryToEngineRequest(
  input: GraphEvidenceSearchInput,
): EngineRagSearchRequest {
  return {
    graph_release_id: input.graph_release_id,
    query: input.query,
    selected_layer_key: input.selected_layer_key,
    selected_node_id: input.selected_node_id,
    selected_paper_id: input.selected_paper_id ?? input.selected_node_id,
    selected_cluster_id: input.selected_cluster_id,
    evidence_intent: input.evidence_intent,
    k: input.k,
    rerank_topn: input.rerank_topn,
    use_lexical: input.use_lexical,
    generate_answer: input.generate_answer,
  }
}

function mapEngineRagResponse(
  response: EngineRagSearchResponse,
): GraphRagQueryResponsePayload {
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
    text:
      bundle.snippet ||
      bundle.paper.tldr ||
      bundle.paper.abstract ||
      bundle.paper.title ||
      '',
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
      semantic_scholar_paper_id:
        bundle.paper.semantic_scholar_paper_id ?? bundle.paper.paper_id,
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

function getErrorCode(
  status: number,
): GraphRagErrorResponsePayload['error_code'] {
  if (status === 400) {
    return 'bad_request'
  }
  if (status === 401) {
    return 'unauthorized'
  }
  if (status === 403) {
    return 'forbidden'
  }
  if (status === 404) {
    return 'not_found'
  }
  if (status === 429) {
    return 'rate_limited'
  }
  return 'engine_request_failed'
}

function isGraphRagErrorCode(
  value: string | null,
): value is GraphRagErrorResponsePayload['error_code'] {
  return (
    value === 'bad_request' ||
    value === 'unauthorized' ||
    value === 'forbidden' ||
    value === 'not_found' ||
    value === 'rate_limited' ||
    value === 'engine_request_failed' ||
    value === 'unknown_error'
  )
}

function getBodyStringField(body: unknown, key: string) {
  if (!body || typeof body !== 'object') {
    return null
  }

  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}
