/** Wire types matching engine/app/wiki/schemas.py */

export interface WikiLinkedEntity {
  entity_type: string
  concept_id: string
}

export interface WikiPagePaperResponse {
  pmid: number
  graph_paper_ref: string | null
  title: string
  year: number | null
  venue: string | null
  citation_count: number | null
}

export interface WikiPageContextResponse {
  total_corpus_paper_count: number | null
  total_graph_paper_count: number | null
  top_graph_papers: WikiPagePaperResponse[]
}

export interface WikiPageResponse {
  slug: string
  title: string
  content_md: string
  frontmatter: Record<string, unknown>
  entity_type: string | null
  concept_id: string | null
  family_key: string | null
  page_kind: "index" | "section" | "entity" | "topic"
  section_slug: string | null
  graph_focus: "cited_papers" | "entity_exact" | "none"
  summary: string | null
  tags: string[]
  outgoing_links: string[]
  paper_pmids: number[]
  featured_pmids: number[]
  paper_graph_refs: Record<number, string>
  featured_graph_refs: Record<number, string>
  resolved_links: Record<string, string>
  linked_entities: Record<string, WikiLinkedEntity>
  context: WikiPageContextResponse | null
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

// ---------------------------------------------------------------------------
// Wiki graph types
// ---------------------------------------------------------------------------

export interface WikiGraphNode {
  id: string
  kind: "page" | "paper"
  label: string
  slug: string | null
  paper_id: string | null
  concept_id: string | null
  entity_type: string | null
  semantic_group: string | null
  tags: string[]
  year: number | null
  venue: string | null
}

export interface WikiGraphEdge {
  source: string
  target: string
  kind: "wikilink" | "paper_reference"
}

export interface WikiGraphResponse {
  nodes: WikiGraphNode[]
  edges: WikiGraphEdge[]
  signature: string
}
