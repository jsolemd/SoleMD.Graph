export interface GraphPointRow {
  alias_count: number | null
  alias_quality_score: number | null
  alias_source: string | null
  alias_text: string | null
  alias_type: string | null
  assertion_status: string | null
  canonical_name: string | null
  category: string | null
  definition: string | null
  semantic_types_csv: string | null
  aliases_csv: string | null
  char_count: number | null
  chunk_count: number | string | null
  chunk_index: number | null
  chunk_kind: string | null
  chunk_preview: string | null
  display_label: string | null
  display_preview: string | null
  citekey: string | null
  cluster_id: number | null
  cluster_label: string | null
  cluster_probability: number | null
  doi: string | null
  evidence_status: string | null
  has_open_access_pdf: boolean | null
  has_figure_context: boolean | null
  has_table_context: boolean | null
  id: string
  is_in_base: boolean | null
  base_rank: number | null
  is_open_access: boolean | null
  journal: string | null
  mention_count: number | null
  node_kind: string | null
  node_role: string | null
  node_id: string
  organ_systems_csv: string | null
  paper_asset_count: number | null
  paper_author_count: number | null
  paper_chunk_count: number | null
  paper_cluster_index: number | null
  paper_entity_count: number | string | null
  paper_figure_count: number | null
  paper_id: string
  paper_page_count: number | null
  paper_count: number | string | null
  paper_reference_count: number | null
  paper_relation_count: number | string | null
  paper_sentence_count: number | null
  paper_table_count: number | null
  page_number: number | null
  payload_json: string | null
  point_index: number | null
  pmcid: string | null
  pmid: number | string | null
  relation_category: string | null
  relation_certainty: string | null
  relation_count: number | string | null
  relation_direction: string | null
  relation_categories_csv: string | null
  relation_type: string | null
  search_text: string | null
  semantic_groups_csv: string | null
  section_canonical: string | null
  stable_chunk_id: string | null
  text_availability: string | null
  title: string | null
  top_entities_csv: string | null
  token_count: number | null
  x: number
  y: number
  year: number | null
}

export interface GraphClusterRow {
  candidate_count: number | null
  centroid_x: number
  centroid_y: number
  cluster_id: number
  entity_candidate_count: number | null
  is_noise: boolean | null
  label: string | null
  label_mode: string | null
  label_source: string | null
  lexical_candidate_count: number | null
  mean_cluster_probability: number | null
  mean_outlier_score: number | null
  member_count: number
  paper_count: number | null
  representative_rag_chunk_id: string | null
}

export interface GraphFacetRow {
  cluster_count: number | null
  facet_label: string | null
  facet_name: string
  facet_value: string
  paper_count: number | null
  point_count: number | null
  sort_key: string | null
}

export interface BuildGraphDataArgs {
  clusters: GraphClusterRow[]
  facets: GraphFacetRow[]
  points: GraphPointRow[]
}

export interface GeoPointRow {
  point_index: number | null
  id: string
  node_id: string
  x: number
  y: number
  cluster_id: number | null
  cluster_label: string | null
  color_hex: string | null
  size_value: number | null
  institution: string | null
  ror_id: string | null
  city: string | null
  region: string | null
  country: string | null
  country_code: string | null
  paper_count: number | null
  author_count: number | null
  first_year: number | null
  last_year: number | null
}
