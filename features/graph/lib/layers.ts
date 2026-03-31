import type { InfoWidgetSlot } from './info-widgets'
import type { MapLayer, PointColorStrategy, PointSizeStrategy } from '@/features/graph/types'

/** Default link column names shared by layer configs. */
export const LINK_COLUMNS = {
  sourceBy: 'source_node_id',
  sourceIndexBy: 'source_point_index',
  targetBy: 'target_node_id',
  targetIndexBy: 'target_point_index',
} as const

/** Configuration for a single map layer. */
export interface LayerConfig {
  key: MapLayer
  label: string
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
  corpus: {
    key: 'corpus',
    label: 'Corpus',
    pointsTable: 'current_points_canvas_web',
    linksTable: 'current_links_web',
    hasLinks: true,
    linkSourceBy: LINK_COLUMNS.sourceBy,
    linkSourceIndexBy: LINK_COLUMNS.sourceIndexBy,
    linkTargetBy: LINK_COLUMNS.targetBy,
    linkTargetIndexBy: LINK_COLUMNS.targetIndexBy,
    defaultColorColumn: 'hexColor',
    defaultColorStrategy: 'direct',
    defaultSizeColumn: 'paperReferenceCount',
    defaultSizeStrategy: 'auto',
    pointSizeRange: [1.5, 5],
    requiredTable: 'base_points',
    defaultInfoWidgets: [
      { column: 'year', kind: 'histogram', label: 'Year' },
      { column: 'paperReferenceCount', kind: 'histogram', label: 'References' },
      { column: 'journal', kind: 'facet-summary', label: 'Journals' },
      { column: 'semanticGroups', kind: 'facet-summary', label: 'Entity Groups' },
    ],
    searchableFields: {
      displayLabel: 'Label',
      clusterLabel: 'Cluster',
      paperTitle: 'Paper',
      journal: 'Journal',
      semanticGroups: 'Entity Groups',
      relationCategories: 'Relation Categories',
      citekey: 'Citekey',
      year: 'Year',
      id: 'Node ID',
    },
  },
}

/** Ordered list of layers for rendering in the UI. */
export const LAYER_ORDER: MapLayer[] = ['corpus']

/** Get layer config by key. */
export function getLayerConfig(layer: MapLayer): LayerConfig {
  return LAYERS[layer]
}
