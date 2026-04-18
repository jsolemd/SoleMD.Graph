import type { GraphLayer } from "@solemd/graph"

export type ColumnType = 'categorical' | 'numeric' | 'text'

export interface ColumnMeta {
  key: string
  facetName?: string
  label: string
  type: ColumnType
  isMultiValue?: boolean
}

export const COLUMNS: ColumnMeta[] = [
  { key: 'clusterId', facetName: 'cluster_id', label: 'Cluster ID', type: 'categorical' },
  { key: 'clusterLabel', facetName: 'cluster_label', label: 'Cluster Label', type: 'categorical' },
  { key: 'journal', facetName: 'journal', label: 'Journal', type: 'categorical' },
  { key: 'textAvailability', facetName: 'text_availability', label: 'Text Availability', type: 'categorical' },
  { key: 'semanticGroups', facetName: 'semantic_groups_csv', label: 'Entity Groups', type: 'categorical', isMultiValue: true },
  { key: 'relationCategories', facetName: 'relation_categories_csv', label: 'Relation Categories', type: 'categorical', isMultiValue: true },
  { key: 'year', facetName: 'year', label: 'Publication Year', type: 'numeric' },
  { key: 'paperAuthorCount', label: 'Author Count', type: 'numeric' },
  { key: 'paperReferenceCount', label: 'Reference Count', type: 'numeric' },
  { key: 'paperEntityCount', label: 'Entity Count', type: 'numeric' },
  { key: 'paperRelationCount', label: 'Relation Count', type: 'numeric' },
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
const RENDER_COLUMN_KEYS = new Set([
  'clusterId',
  'clusterLabel',
  'journal',
  'year',
  'paperAuthorCount',
  'paperReferenceCount',
  'paperEntityCount',
  'paperRelationCount',
  'x',
  'y',
  'id',
  'displayLabel',
  'paperTitle',
  'citekey',
])
export const RENDER_COLUMNS = COLUMNS.filter((column) =>
  RENDER_COLUMN_KEYS.has(column.key)
)

export const TABLE_COLUMNS: string[] = [
  'paperTitle',
  'citekey',
  'journal',
  'textAvailability',
  'semanticGroups',
  'relationCategories',
  'year',
  'clusterLabel',
  'paperAuthorCount',
  'paperReferenceCount',
  'paperEntityCount',
  'paperRelationCount',
]

export const PAPER_COLUMNS = COLUMNS
export const PAPER_NUMERIC_COLUMNS = NUMERIC_COLUMNS
export const ALL_PAPER_DATA_COLUMNS = ALL_DATA_COLUMNS
export const PAPER_TABLE_COLUMNS = TABLE_COLUMNS

export const GEO_COLUMNS: ColumnMeta[] = []
export const ALL_GEO_DATA_COLUMNS = GEO_COLUMNS
export const GEO_TABLE_COLUMNS: string[] = []

export function getColumnsForLayer(layer: GraphLayer): ColumnMeta[] {
  void layer
  return ALL_DATA_COLUMNS
}

export function getRenderableColumnsForLayer(layer: GraphLayer): ColumnMeta[] {
  void layer
  return RENDER_COLUMNS
}

export function getTableColumnsForLayer(layer: GraphLayer): string[] {
  void layer
  return TABLE_COLUMNS
}

export function getColumnMetaForLayer(key: string, layer: GraphLayer): ColumnMeta | undefined {
  void layer
  return COLUMNS.find((column) => column.key === key)
}

export function getColumnMeta(key: string): ColumnMeta | undefined {
  return COLUMNS.find((column) => column.key === key)
}
