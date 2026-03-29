import 'server-only'

import { postEngineJson } from './client'

export interface EngineResponseMeta {
  request_id: string
  generated_at: string
  duration_ms: number
  cache_control: string
  retrieval_version: string
}

export interface EngineGraphContext {
  graph_release_id: string
  graph_run_id: string
  bundle_checksum: string | null
  graph_name: string
  is_current: boolean
  selected_layer_key: 'paper' | 'chunk' | null
  selected_node_id: string | null
  selected_paper_id: string | null
  selected_cluster_id: number | null
}

export interface EnginePaperSummary {
  corpus_id: number
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
  citation_count: number | null
  reference_count: number | null
}

export interface EngineCitationContextHit {
  corpus_id: number
  citation_id: number | null
  direction: 'incoming' | 'outgoing'
  neighbor_corpus_id: number | null
  neighbor_paper_id?: string | null
  context_text: string
  intents: string[]
  score: number
}

export interface EngineEntityMatchedPaperHit {
  corpus_id: number
  entity_type: string
  concept_id: string
  matched_terms: string[]
  score: number
}

export interface EngineRelationMatchedPaperHit {
  corpus_id: number
  relation_type: string
  subject_type: string
  subject_id: string
  object_type: string
  object_id: string
  score: number
}

export interface EnginePaperReference {
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

export interface EnginePaperAsset {
  corpus_id: number
  asset_id: number
  asset_kind: string
  remote_url: string | null
  storage_path: string | null
  access_status: string | null
  license: string | null
  metadata: Record<string, unknown>
}

export interface EngineGraphSignal {
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

export interface EngineEvidenceBundle {
  paper: EnginePaperSummary
  score: number
  rank: number
  snippet: string | null
  matched_channels: Array<
    'lexical' | 'entity_match' | 'relation_match' | 'citation_context' | 'semantic_neighbor'
  >
  match_reasons: string[]
  rank_features: Record<string, number>
  citation_contexts: EngineCitationContextHit[]
  entity_hits: EngineEntityMatchedPaperHit[]
  relation_hits: EngineRelationMatchedPaperHit[]
  references: EnginePaperReference[]
  assets: EnginePaperAsset[]
}

export interface EngineRetrievalChannelHit {
  corpus_id: number
  paper_id: string | null
  score: number
  reasons: string[]
}

export interface EngineRetrievalChannelResult {
  channel: 'lexical' | 'entity_match' | 'relation_match' | 'citation_context' | 'semantic_neighbor'
  hits: EngineRetrievalChannelHit[]
}

export interface EngineRagSearchRequest {
  graph_release_id: string
  query: string
  selected_layer_key: 'paper' | 'chunk' | null
  selected_node_id: string | null
  selected_paper_id: string | null
  selected_cluster_id: number | null
  evidence_intent?: 'support' | 'refute' | 'both' | null
  k?: number
  rerank_topn?: number
  use_lexical?: boolean
  generate_answer?: boolean
}

export interface EngineRagSearchResponse {
  meta: EngineResponseMeta
  graph_context: EngineGraphContext
  query: string
  answer: string | null
  answer_model: string | null
  evidence_bundles: EngineEvidenceBundle[]
  graph_signals: EngineGraphSignal[]
  retrieval_channels: EngineRetrievalChannelResult[]
}

export function searchEvidence(
  request: EngineRagSearchRequest,
  options?: {
    signal?: AbortSignal
  },
): Promise<EngineRagSearchResponse> {
  return postEngineJson<EngineRagSearchRequest, EngineRagSearchResponse>(
    '/api/v1/evidence/search',
    request,
    options,
  )
}
