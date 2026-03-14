import type { InfoWidgetSlot } from './info-widgets'
import type { MapLayer, PointColorStrategy, PointSizeStrategy } from './types'

/** Configuration for a single map layer. */
export interface LayerConfig {
  key: MapLayer
  label: string
  /** DuckDB table name for Cosmograph `points` prop */
  pointsTable: string
  /** DuckDB table name for Cosmograph `links` prop (optional — chunks have no links) */
  linksTable?: string
  /** Source point ID column for layer links. */
  linkSourceBy?: string
  /** Source point index column for layer links. */
  linkSourceIndexBy?: string
  /** Target point ID column for layer links. */
  linkTargetBy?: string
  /** Target point index column for layer links. */
  linkTargetIndexBy?: string
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
    pointsTable: 'graph_points_web',
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
    pointsTable: 'paper_points_web',
    linksTable: 'paper_links',
    linkSourceBy: 'source_node_id',
    linkSourceIndexBy: 'source_point_index',
    linkTargetBy: 'target_node_id',
    linkTargetIndexBy: 'target_point_index',
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
}

/** Ordered list of layers for rendering in the UI. */
export const LAYER_ORDER: MapLayer[] = ['chunk', 'paper']

/** Get layer config by key. */
export function getLayerConfig(layer: MapLayer): LayerConfig {
  return LAYERS[layer]
}
