/** Wire types matching engine/app/wiki/schemas.py */

export interface WikiPageResponse {
  slug: string
  title: string
  content_md: string
  frontmatter: Record<string, unknown>
  entity_type: string | null
  concept_id: string | null
  family_key: string | null
  tags: string[]
  outgoing_links: string[]
  paper_pmids: number[]
  paper_graph_refs: Record<number, string>
  resolved_links: Record<string, string>
}

export interface WikiPageSummary {
  slug: string
  title: string
  entity_type: string | null
  family_key: string | null
  tags: string[]
}

export interface WikiSearchHitResponse {
  slug: string
  title: string
  entity_type: string | null
  family_key: string | null
  tags: string[]
  rank: number
  headline: string
}

export interface WikiSearchResponse {
  hits: WikiSearchHitResponse[]
  total: number
}

export interface WikiBacklinksResponse {
  slug: string
  backlinks: WikiPageSummary[]
}
