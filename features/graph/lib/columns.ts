import type { MapLayer } from '@/features/graph/types'

export type ColumnType = 'categorical' | 'numeric' | 'text'

export interface ColumnMeta {
  key: string
  facetName?: string
  label: string
  type: ColumnType
}

export const COLUMNS: ColumnMeta[] = [
  { key: 'clusterId', facetName: 'cluster_id', label: 'Cluster ID', type: 'categorical' },
  { key: 'clusterLabel', facetName: 'cluster_label', label: 'Cluster Label', type: 'categorical' },
  { key: 'journal', facetName: 'journal', label: 'Journal', type: 'categorical' },
  { key: 'textAvailability', facetName: 'text_availability', label: 'Text Availability', type: 'categorical' },
  { key: 'semanticGroups', facetName: 'semantic_groups_csv', label: 'Entity Groups', type: 'categorical' },
  { key: 'organSystems', facetName: 'organ_systems_csv', label: 'Organ Systems', type: 'categorical' },
  { key: 'relationCategories', facetName: 'relation_categories_csv', label: 'Relation Categories', type: 'categorical' },
  { key: 'year', facetName: 'year', label: 'Publication Year', type: 'numeric' },
  { key: 'paperAuthorCount', label: 'Author Count', type: 'numeric' },
  { key: 'paperReferenceCount', label: 'Reference Count', type: 'numeric' },
  { key: 'paperEntityCount', label: 'Entity Count', type: 'numeric' },
  { key: 'paperRelationCount', label: 'Relation Count', type: 'numeric' },
  { key: 'clusterProbability', label: 'Cluster Probability', type: 'numeric' },
  { key: 'x', label: 'X', type: 'numeric' },
  { key: 'y', label: 'Y', type: 'numeric' },
  { key: 'id', label: 'Point ID', type: 'text' },
  { key: 'paperId', label: 'Paper ID', type: 'text' },
  { key: 'displayLabel', label: 'Label', type: 'text' },
  { key: 'paperTitle', label: 'Paper Title', type: 'text' },
  { key: 'citekey', label: 'Citekey', type: 'text' },
]

export const NUMERIC_COLUMNS = COLUMNS.filter((column) => column.type === 'numeric')
export const ALL_DATA_COLUMNS = COLUMNS

export const TABLE_COLUMNS: string[] = [
  'paperTitle',
  'citekey',
  'journal',
  'textAvailability',
  'semanticGroups',
  'organSystems',
  'relationCategories',
  'year',
  'clusterLabel',
  'paperAuthorCount',
  'paperReferenceCount',
  'paperEntityCount',
  'paperRelationCount',
  'clusterProbability',
]

export const PAPER_COLUMNS = COLUMNS
export const PAPER_NUMERIC_COLUMNS = NUMERIC_COLUMNS
export const ALL_PAPER_DATA_COLUMNS = ALL_DATA_COLUMNS
export const PAPER_TABLE_COLUMNS = TABLE_COLUMNS

export const GEO_COLUMNS: ColumnMeta[] = []
export const ALL_GEO_DATA_COLUMNS = GEO_COLUMNS
export const GEO_TABLE_COLUMNS: string[] = []

export function getColumnsForLayer(layer: MapLayer): ColumnMeta[] {
  void layer
  return ALL_DATA_COLUMNS
}

export function getTableColumnsForLayer(layer: MapLayer): string[] {
  void layer
  return TABLE_COLUMNS
}

export function getColumnMetaForLayer(key: string, layer: MapLayer): ColumnMeta | undefined {
  void layer
  return COLUMNS.find((column) => column.key === key)
}

export function getColumnMeta(key: string): ColumnMeta | undefined {
  return COLUMNS.find((column) => column.key === key)
}
