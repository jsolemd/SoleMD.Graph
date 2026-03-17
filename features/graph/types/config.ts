import type { GraphNodeBase } from './nodes'

export type GraphMode = 'ask' | 'explore' | 'learn' | 'create'

export type MapLayer = 'chunk' | 'paper' | 'geo'

export type ColorTheme = 'light' | 'dark'
export type PointColorStrategy = 'categorical' | 'continuous' | 'direct' | 'single'
export type PointSizeStrategy = 'auto' | 'direct' | 'single'
export type ColorSchemeName =
  | 'default'
  | 'warm'
  | 'cool'
  | 'spectral'
  | 'viridis'
  | 'plasma'
  | 'turbo'

export type FilterableColumnKey =
  | Exclude<keyof GraphNodeBase, 'index' | 'color' | 'colorLight'>
  | 'nodeKind'
  | 'sectionCanonical'
  | 'chunkKind'
  | 'pageNumber'
  | 'tokenCount'
  | 'hasTableContext'
  | 'hasFigureContext'
  | 'institution'
  | 'country'
  | 'countryCode'
  | 'city'
  | 'region'
  | 'rorId'
  | 'authorCount'

export type NumericColumnKey =
  | 'clusterProbability'
  | 'outlierScore'
  | 'year'
  | 'pageNumber'
  | 'tokenCount'
  | 'mentionCount'
  | 'paperCount'
  | 'chunkCount'
  | 'relationCount'
  | 'aliasCount'
  | 'aliasQualityScore'
  | 'authorCount'
  | 'x'
  | 'y'

export type DataColumnKey = FilterableColumnKey

export type SizeColumnKey = 'none' | NumericColumnKey
