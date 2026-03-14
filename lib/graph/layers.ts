import type { InfoWidgetSlot } from './info-widgets'
import type { MapLayer, PointColorStrategy, PointSizeStrategy } from './types'

/**
 * Zero-row DuckDB view used for layers without links.
 * Cosmograph crashes when `links` transitions from a table name to undefined,
 * so every layer must provide a valid table — this sentinel satisfies that.
 */
export const EMPTY_LINKS_TABLE = '_empty_links'

/** Default link column names shared by the empty-links view and layer configs. */
export const LINK_COLUMNS = {
  sourceBy: 'source_node_id',
  sourceIndexBy: 'source_point_index',
  targetBy: 'target_node_id',
  targetIndexBy: 'target_point_index',
} as const

/** Which WebGL/canvas renderer to use for a layer. */
export type RendererType = 'cosmograph' | 'maplibre'

/** Configuration for a single map layer. */
export interface LayerConfig {
  key: MapLayer
  label: string
  /** Which renderer to use — Cosmograph (scatter) or MapLibre (geographic map). */
  rendererType: RendererType
  /** DuckDB table name for Cosmograph `points` prop */
  pointsTable: string
  /** DuckDB table name for Cosmograph `links` prop */
  linksTable: string
  /** Whether this layer has meaningful link data (controls UI + rendering). */
  hasLinks: boolean
  /** Source point ID column for layer links. */
  linkSourceBy: string
  /** Source point index column for layer links. */
  linkSourceIndexBy: string
  /** Target point ID column for layer links. */
  linkTargetBy: string
  /** Target point index column for layer links. */
  linkTargetIndexBy: string
  defaultColorColumn: string
  defaultColorStrategy: PointColorStrategy
  defaultSizeColumn?: string
  defaultSizeStrategy: PointSizeStrategy
  pointSizeRange: [number, number]
  /** Bundle manifest table name to check for availability */
  requiredTable: string
  /** Default info-panel widget slots for this layer. */
  defaultInfoWidgets: InfoWidgetSlot[]
  /** Columns meaningful for CosmographSearch suggestion fields on this layer. */
  searchableFields: Record<string, string>
}

export const LAYERS: Record<MapLayer, LayerConfig> = {
  chunk: {
    key: 'chunk',
    label: 'Chunks',
    rendererType: 'cosmograph',
    pointsTable: 'graph_points_web',
    linksTable: EMPTY_LINKS_TABLE,
    hasLinks: false,
    linkSourceBy: LINK_COLUMNS.sourceBy,
    linkSourceIndexBy: LINK_COLUMNS.sourceIndexBy,
    linkTargetBy: LINK_COLUMNS.targetBy,
    linkTargetIndexBy: LINK_COLUMNS.targetIndexBy,
    defaultColorColumn: 'clusterLabel',
    defaultColorStrategy: 'categorical',
    defaultSizeColumn: 'clusterProbability',
    defaultSizeStrategy: 'auto',
    pointSizeRange: [1, 6],
    requiredTable: 'graph_points',
    defaultInfoWidgets: [
      { column: 'sectionCanonical', kind: 'facet-summary', label: 'Sections' },
    ],
    searchableFields: {
      clusterLabel: 'Cluster',
      paperTitle: 'Paper',
      journal: 'Journal',
      sectionCanonical: 'Section',
      citekey: 'Citekey',
      year: 'Year',
      id: 'Chunk ID',
    },
  },
  paper: {
    key: 'paper',
    label: 'Papers',
    rendererType: 'cosmograph',
    pointsTable: 'paper_points_web',
    linksTable: 'paper_links',
    hasLinks: true,
    linkSourceBy: LINK_COLUMNS.sourceBy,
    linkSourceIndexBy: LINK_COLUMNS.sourceIndexBy,
    linkTargetBy: LINK_COLUMNS.targetBy,
    linkTargetIndexBy: LINK_COLUMNS.targetIndexBy,
    defaultColorColumn: 'journal',
    defaultColorStrategy: 'categorical',
    defaultSizeColumn: 'paperChunkCount',
    defaultSizeStrategy: 'auto',
    pointSizeRange: [5, 20],
    requiredTable: 'paper_points',
    defaultInfoWidgets: [
      { column: 'journal', kind: 'facet-summary', label: 'Journals' },
    ],
    searchableFields: {
      clusterLabel: 'Cluster',
      paperTitle: 'Paper',
      journal: 'Journal',
      citekey: 'Citekey',
      year: 'Year',
      id: 'Paper Node ID',
    },
  },
  geo: {
    key: 'geo',
    label: 'Geography',
    rendererType: 'maplibre',
    pointsTable: 'geo_points_web',
    linksTable: 'geo_links',
    hasLinks: true,
    linkSourceBy: LINK_COLUMNS.sourceBy,
    linkSourceIndexBy: LINK_COLUMNS.sourceIndexBy,
    linkTargetBy: LINK_COLUMNS.targetBy,
    linkTargetIndexBy: LINK_COLUMNS.targetIndexBy,
    defaultColorColumn: 'country',
    defaultColorStrategy: 'categorical',
    defaultSizeColumn: 'paperCount',
    defaultSizeStrategy: 'auto',
    pointSizeRange: [4, 24],
    requiredTable: 'geo_points',
    defaultInfoWidgets: [
      { column: 'country', kind: 'facet-summary', label: 'Countries' },
    ],
    searchableFields: {
      institution: 'Institution',
      country: 'Country',
      city: 'City',
      countryCode: 'Country Code',
      citekey: 'Citekey',
      paperTitle: 'Paper',
      year: 'Year',
    },
  },
}

/** Ordered list of layers for rendering in the UI. */
export const LAYER_ORDER: MapLayer[] = ['chunk', 'paper', 'geo']

/** Get layer config by key. */
export function getLayerConfig(layer: MapLayer): LayerConfig {
  return LAYERS[layer]
}
