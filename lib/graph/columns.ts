import type { ChunkNode } from './types'

export type ColumnType = 'categorical' | 'numeric' | 'text'

export interface ColumnMeta {
  key: keyof ChunkNode
  label: string
  type: ColumnType
}

export const COLUMNS: ColumnMeta[] = [
  { key: 'clusterId', label: 'Cluster ID', type: 'categorical' },
  { key: 'clusterLabel', label: 'Cluster Label', type: 'categorical' },
  { key: 'paperId', label: 'Paper ID', type: 'categorical' },
  { key: 'citekey', label: 'Citekey', type: 'categorical' },
  { key: 'clusterProbability', label: 'Cluster Probability', type: 'numeric' },
  { key: 'outlierScore', label: 'Outlier Score', type: 'numeric' },
  { key: 'year', label: 'Publication Year', type: 'numeric' },
  { key: 'x', label: 'X', type: 'numeric' },
  { key: 'y', label: 'Y', type: 'numeric' },
  { key: 'id', label: 'Chunk ID', type: 'text' },
  { key: 'paperTitle', label: 'Paper Title', type: 'text' },
]

export const CATEGORICAL_COLUMNS = COLUMNS.filter((c) => c.type === 'categorical')
export const NUMERIC_COLUMNS = COLUMNS.filter((c) => c.type === 'numeric')
export const ALL_DATA_COLUMNS = COLUMNS.filter((c) => c.key !== 'index' && c.key !== 'color')

export const TABLE_COLUMNS: (keyof ChunkNode)[] = [
  'id', 'clusterId', 'clusterLabel', 'paperTitle', 'citekey',
  'year', 'clusterProbability', 'outlierScore', 'x', 'y',
]

export function getColumnMeta(key: string): ColumnMeta | undefined {
  return COLUMNS.find((c) => c.key === key)
}
