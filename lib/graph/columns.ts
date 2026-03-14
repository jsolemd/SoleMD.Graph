import type { MapLayer } from './types'

export type ColumnType = 'categorical' | 'numeric' | 'text'

export interface ColumnMeta {
  key: string
  facetName?: string
  label: string
  type: ColumnType
}

/* ─── Chunk columns ────────────────────────────────────────────── */

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

export const NUMERIC_COLUMNS = COLUMNS.filter((c) => c.type === 'numeric')
export const ALL_DATA_COLUMNS = COLUMNS.filter((c) => c.key !== 'index' && c.key !== 'color' && c.key !== 'colorLight')

export const TABLE_COLUMNS: string[] = [
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

/* ─── Paper columns ────────────────────────────────────────────── */

export const PAPER_COLUMNS: ColumnMeta[] = [
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
  { key: 'journal', facetName: 'journal', label: 'Journal', type: 'categorical' },
  { key: 'year', facetName: 'year', label: 'Publication Year', type: 'numeric' },
  { key: 'paperAuthorCount', label: 'Author Count', type: 'numeric' },
  { key: 'paperChunkCount', label: 'Chunk Count', type: 'numeric' },
  { key: 'paperReferenceCount', label: 'Reference Count', type: 'numeric' },
  { key: 'paperAssetCount', label: 'Asset Count', type: 'numeric' },
  { key: 'paperFigureCount', label: 'Figure Count', type: 'numeric' },
  { key: 'paperTableCount', label: 'Table Count', type: 'numeric' },
  { key: 'clusterProbability', label: 'Cluster Probability', type: 'numeric' },
  { key: 'outlierScore', label: 'Outlier Score', type: 'numeric' },
  { key: 'x', label: 'X', type: 'numeric' },
  { key: 'y', label: 'Y', type: 'numeric' },
  { key: 'id', label: 'Paper Node ID', type: 'text' },
  { key: 'paperTitle', label: 'Paper Title', type: 'text' },
  { key: 'citekey', label: 'Citekey', type: 'text' },
  { key: 'chunkPreview', label: 'Display Preview', type: 'text' },
]

export const PAPER_NUMERIC_COLUMNS = PAPER_COLUMNS.filter((c) => c.type === 'numeric')
export const ALL_PAPER_DATA_COLUMNS = PAPER_COLUMNS.filter((c) => c.key !== 'index' && c.key !== 'color' && c.key !== 'colorLight')

export const PAPER_TABLE_COLUMNS: string[] = [
  'paperTitle',
  'citekey',
  'journal',
  'year',
  'clusterId',
  'clusterLabel',
  'paperAuthorCount',
  'paperChunkCount',
  'paperReferenceCount',
  'paperFigureCount',
  'clusterProbability',
  'outlierScore',
]

/* ─── Layer helpers ─────────────────────────────────────────────── */

export function getColumnsForLayer(layer: MapLayer): ColumnMeta[] {
  return layer === 'paper' ? ALL_PAPER_DATA_COLUMNS : ALL_DATA_COLUMNS
}

export function getTableColumnsForLayer(layer: MapLayer): string[] {
  return layer === 'paper' ? PAPER_TABLE_COLUMNS : TABLE_COLUMNS
}

export function getColumnMetaForLayer(key: string, layer: MapLayer): ColumnMeta | undefined {
  const columns = layer === 'paper' ? PAPER_COLUMNS : COLUMNS
  return columns.find((c) => c.key === key)
}

export function getColumnMeta(key: string): ColumnMeta | undefined {
  return COLUMNS.find((c) => c.key === key) ?? PAPER_COLUMNS.find((c) => c.key === key)
}
