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

export interface GraphEvidencePaper {
  paper_id: string
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
  paper_id: string
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

export interface GraphRagGraphSignal {
  corpus_id: number
  paper_id: string | null
  signal_kind:
    | 'entity_match'
    | 'relation_match'
    | 'citation_neighbor'
    | 'semantic_neighbor'
    | 'answer_support'
  channel:
    | 'lexical'
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
    | 'entity_match'
    | 'relation_match'
    | 'citation_context'
    | 'semantic_neighbor'
  hits: GraphRagRetrievalChannelHit[]
}

export interface GraphRagQueryResponsePayload {
  meta: {
    request_id: string
    generated_at: string
    duration_ms: number
    cache_control: string
    retrieval_version: string
  }
  release: GraphNodeDetailResponsePayload['release']
  query: string
  selected_layer_key: 'paper' | 'chunk' | null
  selected_node_id: string | null
  selected_paper_id: string | null
  selected_cluster_id: number | null
  answer: string | null
  answer_model: string | null
  results: GraphRagResult[]
  evidence_bundles: GraphEvidenceBundle[]
  graph_signals: GraphRagGraphSignal[]
  retrieval_channels: GraphRagRetrievalChannelResult[]
}
