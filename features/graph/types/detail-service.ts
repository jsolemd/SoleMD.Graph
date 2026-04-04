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

// Remote detail/evidence payloads may remain paper/chunk-capable over time, but
// they are not the graph hot path. Cosmograph and DuckDB-native corpus widgets
// should depend on the paper-point runtime types in `points.ts` / `nodes.ts`.
export interface GraphNodeDetailResponsePayload {
  meta: {
    request_id: string
    generated_at: string
    duration_ms: number
    cache_control: string
  }
  release: GraphApiReleaseDescriptor
  node_id: string
  layer_key: GraphApiLayerKey
  node_kind: GraphApiNodeKind
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
  release: GraphApiReleaseDescriptor
  node_id: string
  layer_key: GraphApiLayerKey
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
  release: GraphApiReleaseDescriptor
  node_id: string
  layer_key: GraphApiLayerKey
  node_kind: GraphApiNodeKind
  paper_neighbors: GraphPaperNeighborhoodItem[]
  chunk_neighbors: GraphChunkNeighborhoodItem[]
}

// RAG search results are paper-centric in the current baseline. They may later
// be backed by block/chunk evidence, but the list contract itself should not
// pretend the current paper baseline is a chunk graph surface.
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
