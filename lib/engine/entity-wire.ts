export interface EngineEntityMatchRequest {
  text: string
  entity_types?: string[]
  limit?: number
  max_tokens_per_alias?: number
}

export interface EngineEntityMatchHit {
  match_id: string
  entity_type: string
  concept_namespace: string | null
  concept_id: string
  source_identifier: string
  canonical_name: string
  matched_text: string
  alias_text: string
  alias_source: string
  start: number
  end: number
  paper_count: number
  is_canonical_alias: boolean
  score: number
}

export interface EngineEntityMatchResponse {
  matches: EngineEntityMatchHit[]
}

export interface EngineEntityDetailRequest {
  entity_type: string
  source_identifier: string
}

export interface EngineEntityDetailResponse {
  entity: {
    entity_type: string
    concept_namespace: string | null
    concept_id: string
    source_identifier: string
    canonical_name: string
    paper_count: number
    aliases: Array<{
      alias_text: string
      is_canonical: boolean
      alias_source: string | null
    }>
  }
}

export interface EngineEntityOverlayRequest {
  entity_refs: Array<{ entity_type: string; source_identifier: string }>
  graph_release_id: string
  limit?: number
}

export interface EngineEntityOverlayResponse {
  graph_paper_refs: string[]
}
