export type GraphApiLayerKey = 'paper' | 'chunk'

export type GraphApiNodeKind = 'paper' | 'rag_chunk'

export interface GraphApiReleaseDescriptor {
  graph_release_id: string
  graph_run_id: string
  bundle_checksum: string | null
  graph_name: string
  layer_key: GraphApiLayerKey
  node_kind: GraphApiNodeKind
  is_current: boolean
}

// The live graph action boundary is paper-centric RAG. The prior remote
// paper/chunk detail payloads were never enabled in the corpus runtime and were
// removed so this file only carries the active request/response contract.
export interface GraphRagResult {
  result_id: string
  corpus_id: number
  graph_paper_ref: string
  paper_id: string | null
  citekey: string | null
  doi: string | null
  paper_title: string | null
  paper_year: number | null
  section: string | null
  kind: string
  result_index: number
  page: number | null
  text: string
  dense_score: number
  lex_score: number
  fused_score: number
  rerank_score: number | null
}

export interface GraphEvidencePaper {
  corpus_id: number
  graph_paper_ref: string
  paper_id: string | null
  semantic_scholar_paper_id: string | null
  title: string | null
  journal_name: string | null
  year: number | null
  doi: string | null
  pmid: number | null
  pmcid: string | null
  abstract: string | null
  tldr: string | null
  text_availability: string | null
  is_open_access: boolean | null
}

export interface GraphEvidenceCitationContextHit {
  corpus_id: number
  citation_id: number | null
  direction: 'incoming' | 'outgoing'
  neighbor_corpus_id: number | null
  neighbor_paper_id?: string | null
  context_text: string
  intents: string[]
  score: number
}

export interface GraphEvidenceEntityHit {
  corpus_id: number
  entity_type: string
  concept_id: string
  matched_terms: string[]
  score: number
}

export interface GraphEvidenceRelationHit {
  corpus_id: number
  relation_type: string
  subject_type: string
  subject_id: string
  object_type: string
  object_id: string
  score: number
}

export interface GraphEvidenceReference {
  corpus_id: number
  reference_id: number
  reference_index: number
  title: string | null
  year: number | null
  doi: string | null
  pmid: string | null
  pmcid: string | null
  referenced_paper_id: string | null
  referenced_corpus_id: number | null
}

export interface GraphEvidenceAsset {
  corpus_id: number
  asset_id: number
  asset_kind: string
  remote_url: string | null
  storage_path: string | null
  access_status: string | null
  license: string | null
  metadata: Record<string, unknown>
}

export interface GraphEvidenceBundle {
  corpus_id: number
  graph_paper_ref: string
  paper_id: string | null
  paper: GraphEvidencePaper
  score: number
  rank: number
  snippet: string | null
  matched_channels: string[]
  match_reasons: string[]
  rank_features: Record<string, number>
  citation_contexts: GraphEvidenceCitationContextHit[]
  entity_hits: GraphEvidenceEntityHit[]
  relation_hits: GraphEvidenceRelationHit[]
  references: GraphEvidenceReference[]
  assets: GraphEvidenceAsset[]
}

export interface GraphCitedEntityPacket {
  entity_type: string
  text: string
  concept_namespace: string | null
  concept_id: string | null
  source_identifier: string | null
}

export interface GraphCitedSpanPacket {
  packet_id: string
  corpus_id: number
  canonical_section_ordinal: number
  canonical_block_ordinal: number
  canonical_sentence_ordinal: number | null
  section_role: string
  block_kind: string
  span_origin: string
  alignment_status: string
  alignment_confidence: number | null
  text: string
  quote_text: string | null
  source_citation_keys: string[]
  source_reference_keys: string[]
  entity_mentions: GraphCitedEntityPacket[]
}

export interface GraphInlineCitationAnchor {
  anchor_id: string
  label: string
  cited_span_ids: string[]
  cited_corpus_ids: number[]
  short_evidence_label: string | null
}

export interface GraphAnswerSegment {
  segment_ordinal: number
  text: string
  citation_anchor_ids: string[]
}

export interface GraphGroundedAnswer {
  segments: GraphAnswerSegment[]
  inline_citations: GraphInlineCitationAnchor[]
  cited_spans: GraphCitedSpanPacket[]
  answer_linked_corpus_ids: number[]
}

export interface GraphRagGraphSignal {
  corpus_id: number
  graph_paper_ref: string
  paper_id: string | null
  signal_kind:
    | 'entity_match'
    | 'relation_match'
    | 'citation_neighbor'
    | 'semantic_neighbor'
    | 'answer_evidence'
    | 'answer_support'
    | 'answer_refute'
  channel:
    | 'lexical'
    | 'chunk_lexical'
    | 'entity_match'
    | 'relation_match'
    | 'citation_context'
    | 'semantic_neighbor'
  score: number
  rank: number
  reason: string | null
  matched_terms: string[]
}

export interface GraphRagRetrievalChannelHit {
  corpus_id: number
  paper_id: string | null
  score: number
  reasons: string[]
}

export interface GraphRagRetrievalChannelResult {
  channel:
    | 'lexical'
    | 'chunk_lexical'
    | 'entity_match'
    | 'relation_match'
    | 'citation_context'
    | 'semantic_neighbor'
  hits: GraphRagRetrievalChannelHit[]
}

export interface GraphRagQueryRequestPayload {
  graph_release_id: string
  query: string
  selected_layer_key: GraphApiLayerKey | null
  selected_node_id: string | null
  selected_graph_paper_ref?: string | null
  selected_paper_id?: string | null
  selection_graph_paper_refs?: string[] | null
  selected_cluster_id: number | null
  scope_mode?: 'global' | 'selection_only' | null
  evidence_intent?: 'support' | 'refute' | 'both' | null
  cited_corpus_ids?: number[]
  k?: number
  rerank_topn?: number
  use_lexical?: boolean
  generate_answer?: boolean
}

export interface GraphRagErrorResponsePayload {
  error_code:
    | 'bad_request'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'rate_limited'
    | 'engine_request_failed'
    | 'unknown_error'
  error_message: string
  request_id: string | null
  retry_after: number | null
  status: number
}

export type GraphRagQueryActionResponsePayload =
  | {
      ok: true
      data: GraphRagQueryResponsePayload
    }
  | {
      ok: false
      error: GraphRagErrorResponsePayload
    }

export interface GraphRagQueryResponsePayload {
  meta: {
    request_id: string
    generated_at: string
    duration_ms: number
    cache_control: string
    retrieval_version: string
  }
  release: GraphApiReleaseDescriptor
  query: string
  selected_layer_key: GraphApiLayerKey | null
  selected_node_id: string | null
  selected_graph_paper_ref: string | null
  selected_paper_id: string | null
  selection_graph_paper_refs: string[]
  selected_cluster_id: number | null
  scope_mode: 'global' | 'selection_only'
  answer: string | null
  answer_model: string | null
  answer_graph_paper_refs: string[]
  grounded_answer: GraphGroundedAnswer | null
  results: GraphRagResult[]
  evidence_bundles: GraphEvidenceBundle[]
  graph_signals: GraphRagGraphSignal[]
  retrieval_channels: GraphRagRetrievalChannelResult[]
  evidence_flags: Record<string, boolean>
}
