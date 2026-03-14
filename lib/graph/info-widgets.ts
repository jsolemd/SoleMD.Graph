import type { ColumnType } from './columns'
import type { GraphData, GraphNode, GraphStats, MapLayer } from './types'

/* ─── Widget slot types ──────────────────────────────────────── */

export type InfoWidgetKind = 'histogram' | 'bars' | 'facet-summary'

export interface InfoWidgetSlot {
  /** Unique key AND data accessor (typed as `string`, NOT `FilterableColumnKey`). */
  column: string
  kind: InfoWidgetKind
  label: string
}

/* ─── Layer data helper ──────────────────────────────────────── */

/**
 * Resolve active-layer nodes and stats from `GraphData`.
 * Current model splits chunks (`nodes`) from papers (`paperNodes`).
 */
export function getActiveLayerData(
  data: GraphData,
  layer: MapLayer,
): { nodes: GraphNode[]; stats: GraphStats } {
  if (layer === 'paper') {
    return { nodes: data.paperNodes, stats: data.paperStats ?? data.stats }
  }
  if (layer === 'geo') {
    return { nodes: data.geoNodes, stats: data.geoStats ?? data.stats }
  }
  return { nodes: data.nodes as GraphNode[], stats: data.stats }
}

/* ─── Auto-detect widget kind ────────────────────────────────── */

/** Map column type → default widget kind. Text columns return `null` (excluded). */
export function autoDetectWidgetKind(type: ColumnType): InfoWidgetKind | null {
  if (type === 'numeric') return 'histogram'
  if (type === 'categorical') return 'bars'
  return null
}

/* ─── Safe column reader ─────────────────────────────────────── */

/**
 * Centralized safe dynamic property accessor for `GraphNode` union.
 * Every widget and hook reads `node[column]` through this instead of
 * repeating unsafe dynamic indexing and null normalization.
 */
export function readNodeColumnValue(
  node: GraphNode,
  column: string,
): string | number | boolean | null {
  const value = (node as unknown as Record<string, unknown>)[column]
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return null
}
