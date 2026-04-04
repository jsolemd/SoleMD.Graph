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
  const request: EngineRagSearchRequest = {
    graph_release_id: input.graph_release_id,
    query: input.query,
  }

  const selectedGraphPaperRef = normalizeString(
    input.selected_graph_paper_ref ?? input.selected_paper_id ?? null,
  )
  const selectedPaperId = normalizeString(input.selected_paper_id ?? null)
  const selectedNodeId = normalizeString(input.selected_node_id ?? null)
  const selectionGraphPaperRefs = normalizeStringList(input.selection_graph_paper_refs ?? null)

  if (input.selected_layer_key) {
    request.selected_layer_key = input.selected_layer_key
  }
  if (selectedNodeId) {
    request.selected_node_id = selectedNodeId
  }
  if (selectedGraphPaperRef) {
    request.selected_graph_paper_ref = selectedGraphPaperRef
  }
  if (selectedPaperId) {
    request.selected_paper_id = selectedPaperId
  }
  if (selectionGraphPaperRefs.length > 0) {
    request.selection_graph_paper_refs = selectionGraphPaperRefs
  }
  if (typeof input.selected_cluster_id === 'number') {
    request.selected_cluster_id = input.selected_cluster_id
  }
  if (input.scope_mode === 'selection_only') {
    request.scope_mode = input.scope_mode
  }
  if (input.evidence_intent) {
    request.evidence_intent = input.evidence_intent
  }
  if (typeof input.k === 'number') {
    request.k = input.k
  }
  if (typeof input.rerank_topn === 'number') {
    request.rerank_topn = input.rerank_topn
  }
  if (typeof input.use_lexical === 'boolean') {
    request.use_lexical = input.use_lexical
  }
  if (typeof input.generate_answer === 'boolean') {
    request.generate_answer = input.generate_answer
  }

  return request
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
    selected_paper_id: response.graph_context.selected_paper_id,
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
    segments: response.grounded_answer.segments.map(
      (segment): GraphAnswerSegment => ({
        segment_ordinal: segment.segment_ordinal,
        text: segment.text,
        citation_anchor_ids: segment.citation_anchor_ids,
      }),
    ),
    inline_citations: response.grounded_answer.inline_citations.map(
      (anchor): GraphInlineCitationAnchor => ({
        anchor_id: anchor.anchor_id,
        label: anchor.label,
        cited_span_ids: anchor.cited_span_ids,
        cited_corpus_ids: anchor.cited_corpus_ids,
        short_evidence_label: anchor.short_evidence_label,
      }),
    ),
    cited_spans: response.grounded_answer.cited_spans.map(
      (packet): GraphCitedSpanPacket => ({
        packet_id: packet.packet_id,
        corpus_id: packet.corpus_id,
        canonical_section_ordinal: packet.canonical_section_ordinal,
        canonical_block_ordinal: packet.canonical_block_ordinal,
        canonical_sentence_ordinal: packet.canonical_sentence_ordinal,
        section_role: packet.section_role,
        block_kind: packet.block_kind,
        span_origin: packet.span_origin,
        alignment_status: packet.alignment_status,
        alignment_confidence: packet.alignment_confidence,
        text: packet.text,
        quote_text: packet.quote_text,
        source_citation_keys: packet.source_citation_keys,
        source_reference_keys: packet.source_reference_keys,
        entity_mentions: packet.entity_mentions.map(
          (entity): GraphCitedEntityPacket => ({
            entity_type: entity.entity_type,
            text: entity.text,
            concept_namespace: entity.concept_namespace,
            concept_id: entity.concept_id,
            source_identifier: entity.source_identifier,
          }),
        ),
      }),
    ),
    answer_linked_corpus_ids: response.grounded_answer.answer_linked_corpus_ids,
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
    corpus_id: bundle.paper.corpus_id,
    graph_paper_ref: graphPaperRef,
    paper_id: bundle.paper.paper_id,
    paper: {
      corpus_id: bundle.paper.corpus_id,
      graph_paper_ref: graphPaperRef,
      paper_id: bundle.paper.paper_id,
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
    graph_paper_ref: toGraphPaperRef(signal.paper_id, signal.corpus_id),
    paper_id: signal.paper_id,
    signal_kind: signal.signal_kind,
    channel: signal.channel,
    score: signal.score,
    rank: signal.rank,
    reason: signal.reason,
    matched_terms: signal.matched_terms,
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
