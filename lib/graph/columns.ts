import type { ChunkNode } from './types'

export type ColumnType = 'categorical' | 'numeric' | 'text'

export interface ColumnMeta {
  key: keyof ChunkNode
  facetName?: string
  label: string
  type: ColumnType
}

export const COLUMNS: ColumnMeta[] = [
  {
    key: 'clusterId',
    facetName: 'cluster_id',
    label: 'Cluster ID',
    type: 'categorical',
  },
  {
    key: 'clusterLabel',
    facetName: 'cluster_label',
    label: 'Cluster Label',
    type: 'categorical',
  },
  { key: 'paperId', label: 'Paper ID', type: 'categorical' },
  { key: 'citekey', label: 'Citekey', type: 'categorical' },
  { key: 'journal', facetName: 'journal', label: 'Journal', type: 'categorical' },
  {
    key: 'sectionType',
    facetName: 'section_type',
    label: 'Section Type',
    type: 'categorical',
  },
  {
    key: 'sectionCanonical',
    facetName: 'section_canonical',
    label: 'Section',
    type: 'categorical',
  },
  {
    key: 'chunkKind',
    facetName: 'chunk_kind',
    label: 'Chunk Kind',
    type: 'categorical',
  },
  {
    key: 'blockType',
    facetName: 'block_type',
    label: 'Block Type',
    type: 'categorical',
  },
  { key: 'clusterProbability', label: 'Cluster Probability', type: 'numeric' },
  { key: 'outlierScore', label: 'Outlier Score', type: 'numeric' },
  { key: 'year', facetName: 'year', label: 'Publication Year', type: 'numeric' },
  { key: 'pageNumber', label: 'Page', type: 'numeric' },
  { key: 'tokenCount', label: 'Token Count', type: 'numeric' },
  { key: 'x', label: 'X', type: 'numeric' },
  { key: 'y', label: 'Y', type: 'numeric' },
  { key: 'id', label: 'Chunk ID', type: 'text' },
  { key: 'paperTitle', label: 'Paper Title', type: 'text' },
  { key: 'chunkPreview', label: 'Chunk Preview', type: 'text' },
]

export const CATEGORICAL_COLUMNS = COLUMNS.filter((c) => c.type === 'categorical')
export const NUMERIC_COLUMNS = COLUMNS.filter((c) => c.type === 'numeric')
export const FACET_COLUMNS = COLUMNS.filter((c) => c.facetName)
export const ALL_DATA_COLUMNS = COLUMNS.filter((c) => c.key !== 'index' && c.key !== 'color')

export const TABLE_COLUMNS: (keyof ChunkNode)[] = [
  'id',
  'clusterId',
  'clusterLabel',
  'sectionCanonical',
  'paperTitle',
  'journal',
  'citekey',
  'year',
  'chunkKind',
  'pageNumber',
  'tokenCount',
  'clusterProbability',
  'outlierScore',
]

export function getColumnMeta(key: string): ColumnMeta | undefined {
  return COLUMNS.find((c) => c.key === key)
}
