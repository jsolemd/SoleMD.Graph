import 'server-only'

import type {
  GraphAnswerSegment,
  GraphCitedEntityPacket,
  GraphCitedSpanPacket,
  GraphEvidenceBundle,
  GraphGroundedAnswer,
  GraphInlineCitationAnchor,
  GraphRagErrorResponsePayload,
  GraphRagGraphSignal,
  GraphRagQueryRequestPayload,
  GraphRagQueryResponsePayload,
  GraphRagResult,
} from '../shared/graph-rag'
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
  const response = await searchEvidence(buildEngineRagSearchRequest(input), options)
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

export function buildEngineRagSearchRequest(
  input: GraphEvidenceSearchInput,
): EngineRagSearchRequest {
  const selectionGraphPaperRefs = normalizeStringList(input.selection_graph_paper_refs ?? null)

  return {
    graph_release_id: input.graph_release_id,
    query: input.query,
    selected_layer_key: input.selected_layer_key || undefined,
    selected_node_id: normalizeString(input.selected_node_id ?? null) ?? undefined,
    selected_graph_paper_ref:
      normalizeString(input.selected_graph_paper_ref ?? null) ?? undefined,
    selection_graph_paper_refs: selectionGraphPaperRefs.length > 0 ? selectionGraphPaperRefs : undefined,
    selected_cluster_id: typeof input.selected_cluster_id === 'number' ? input.selected_cluster_id : undefined,
    scope_mode: input.scope_mode === 'selection_only' ? input.scope_mode : undefined,
    evidence_intent: input.evidence_intent || undefined,
    k: input.k,
    rerank_topn: input.rerank_topn,
    use_lexical: input.use_lexical,
    generate_answer: input.generate_answer,
    cited_corpus_ids: input.cited_corpus_ids && input.cited_corpus_ids.length > 0 ? input.cited_corpus_ids : undefined,
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
      graph_run_id: response.graph_context.graph_run_id,
      bundle_checksum: response.graph_context.bundle_checksum,
      graph_name: response.graph_context.graph_name,
      layer_key: response.graph_context.selected_layer_key ?? 'paper',
      node_kind: response.graph_context.selected_layer_key === 'chunk' ? 'rag_chunk' : 'paper',
      is_current: response.graph_context.is_current,
    },
    query: response.query,
    selected_layer_key: response.graph_context.selected_layer_key,
    selected_node_id: response.graph_context.selected_node_id,
    selected_graph_paper_ref: response.graph_context.selected_graph_paper_ref,
    selection_graph_paper_refs: response.graph_context.selection_graph_paper_refs,
    selected_cluster_id: response.graph_context.selected_cluster_id,
    scope_mode: response.graph_context.scope_mode,
    answer: response.answer,
    answer_model: response.answer_model,
    answer_graph_paper_refs: mapAnswerGraphPaperRefs(response),
    grounded_answer: mapGroundedAnswer(response),
    results: response.evidence_bundles.map(mapEvidenceBundleToResult),
    evidence_bundles: response.evidence_bundles.map(mapEvidenceBundle),
    graph_signals: response.graph_signals.map(mapGraphSignal),
    retrieval_channels: response.retrieval_channels,
    evidence_flags: response.evidence_flags ?? {},
  }
}

function mapAnswerGraphPaperRefs(
  response: EngineRagSearchResponse,
): string[] {
  const answerLinkedCorpusIds =
    response.answer_corpus_ids.length > 0
      ? response.answer_corpus_ids
      : (response.grounded_answer?.answer_linked_corpus_ids ?? [])

  if (!answerLinkedCorpusIds.length) {
    return []
  }

  const graphPaperRefByCorpusId = new Map<number, string>()
  for (const bundle of response.evidence_bundles) {
    graphPaperRefByCorpusId.set(
      bundle.paper.corpus_id,
      toGraphPaperRef(bundle.paper.paper_id, bundle.paper.corpus_id),
    )
  }

  return Array.from(
    new Set(
      answerLinkedCorpusIds.map((corpusId) =>
        graphPaperRefByCorpusId.get(corpusId) ?? `corpus:${corpusId}`,
      ),
    ),
  )
}

function mapGroundedAnswer(
  response: EngineRagSearchResponse,
): GraphGroundedAnswer | null {
  if (!response.grounded_answer) {
    return null
  }

  return {
    ...response.grounded_answer,
    segments: response.grounded_answer.segments.map(
      (segment): GraphAnswerSegment => ({ ...segment }),
    ),
    inline_citations: response.grounded_answer.inline_citations.map(
      (anchor): GraphInlineCitationAnchor => ({ ...anchor }),
    ),
    cited_spans: response.grounded_answer.cited_spans.map(
      (packet): GraphCitedSpanPacket => ({
        ...packet,
        entity_mentions: packet.entity_mentions.map(
          (entity): GraphCitedEntityPacket => ({ ...entity }),
        ),
      }),
    ),
  }
}

function mapEvidenceBundleToResult(bundle: EngineEvidenceBundle): GraphRagResult {
  const graphPaperRef = toGraphPaperRef(bundle.paper.paper_id, bundle.paper.corpus_id)

  return {
    result_id: graphPaperRef,
    corpus_id: bundle.paper.corpus_id,
    graph_paper_ref: graphPaperRef,
    paper_id: bundle.paper.paper_id,
    citekey: null,
    doi: bundle.paper.doi,
    paper_title: bundle.paper.title,
    paper_year: bundle.paper.year,
    section:
      bundle.citation_contexts.length > 0
        ? 'citation context'
        : bundle.matched_channels[0]?.replaceAll('_', ' ') || 'paper evidence',
    kind: bundle.matched_channels[0] || 'paper',
    result_index: Math.max(0, bundle.rank - 1),
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
  const graphPaperRef = toGraphPaperRef(bundle.paper.paper_id, bundle.paper.corpus_id)

  return {
    ...bundle,
    corpus_id: bundle.paper.corpus_id,
    graph_paper_ref: graphPaperRef,
    paper_id: bundle.paper.paper_id,
    paper: {
      ...bundle.paper,
      graph_paper_ref: graphPaperRef,
      semantic_scholar_paper_id:
        bundle.paper.semantic_scholar_paper_id ?? bundle.paper.paper_id,
    },
  }
}

function mapGraphSignal(signal: EngineGraphSignal): GraphRagGraphSignal {
  return {
    ...signal,
    graph_paper_ref: toGraphPaperRef(signal.paper_id, signal.corpus_id),
  }
}

function toGraphPaperRef(paperId: string | null, corpusId: number): string {
  return paperId ?? `corpus:${corpusId}`
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

function normalizeString(value: string | null) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeStringList(values: string[] | null) {
  if (!Array.isArray(values)) {
    return []
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  )
}
