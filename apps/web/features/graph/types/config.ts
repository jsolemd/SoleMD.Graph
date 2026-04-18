import type { GraphPointRecord } from './points'

export type GraphMode = 'ask' | 'explore' | 'learn' | 'create'

export type MapLayer = 'corpus'

export type ColorTheme = 'light' | 'dark'
export type PointColorStrategy = 'categorical' | 'continuous' | 'direct' | 'single'
export type PointSizeStrategy = 'auto' | 'direct' | 'single'
export type ColorSchemeName =
  | 'seasons'
  | 'candy'
  | 'easy'
  | 'default'
  | 'warm'
  | 'evening'
  | 'bombay'
  | 'koi'
  | 'august'
  | 'scenery'
  | 'mango'
  | 'ember'
  | 'cranberry'
  | 'autumn'
  | 'dream'
  | 'vitamins'
  | 'confetti'
  | 'rainbow'
  | 'crayons'
  | 'vivid'
  | 'timo'
  | 'tropical'
  | 'tulips'
  | 'forestlake'
  | 'enchant'
  | 'woop'
  | 'unicorn'
  | 'tolvibrant'
  | 'bright'
  | 'vibrant'
  | 'okabeito'
  | 'tableau10'
  | 'tailoring'
  | 'vibrant2'
  | 'spectral'
  | 'classic'
  | 'royal'
  | 'warm2'
  | 'twilight'
  | 'turbo'
  | 'cool'
  | 'viridis'
  | 'plasma'

export type FilterableColumnKey =
  Exclude<
    keyof GraphPointRecord,
    | 'index'
    | 'color'
    | 'colorLight'
    | 'displayPreview'
    | 'isOverlayActive'
    | 'nodeKind'
    | 'nodeRole'
  >

export type NumericColumnKey =
  | 'year'
  | 'paperAuthorCount'
  | 'paperReferenceCount'
  | 'paperEntityCount'
  | 'paperRelationCount'
  | 'x'
  | 'y'

export type DataColumnKey = FilterableColumnKey

export type SizeColumnKey = 'none' | NumericColumnKey
