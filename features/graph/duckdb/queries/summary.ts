import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type {
  GraphInfoHistogramBin,
  GraphInfoScope,
  GraphInfoSummary,
  MapLayer,
} from '@/features/graph/types'

import {
  buildScopedLayerPredicate,
  getColumnMetaForLayer,
  getLayerTableName,
  resolveInfoColumn,
} from '../sql-helpers'

import { queryRows } from './core'

export async function queryInfoSummary(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
): Promise<GraphInfoSummary> {
  const { layer, scope, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )
  const rows = await queryRows<{
    total_count: number
    scoped_count: number
    base_count: number
    overlay_count: number
    paper_count: number
    cluster_count: number
    noise_count: number
    year_min: number | null
    year_max: number | null
  }>(
    conn,
    `WITH scoped AS (
       SELECT * FROM ${tableName} WHERE ${scopedPredicate}
     ),
     totals AS (
       SELECT
         count(*)::INTEGER AS total_count
       FROM ${tableName}
     )
     SELECT
       totals.total_count,
       count(*)::INTEGER AS scoped_count,
       count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') <> 'overlay')::INTEGER AS base_count,
       count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') = 'overlay')::INTEGER AS overlay_count,
       count(DISTINCT CASE WHEN paperId IS NOT NULL AND paperId <> '' THEN paperId END)::INTEGER AS paper_count,
       count(DISTINCT CASE WHEN COALESCE(clusterId, 0) > 0 THEN clusterId END)::INTEGER AS cluster_count,
       count(*) FILTER (WHERE COALESCE(clusterId, 0) <= 0)::INTEGER AS noise_count,
       min(year)::INTEGER AS year_min,
       max(year)::INTEGER AS year_max
     FROM scoped, totals
     GROUP BY totals.total_count`
  )
  const summaryRow = rows[0] ?? {
    total_count: 0,
    scoped_count: 0,
    base_count: 0,
    overlay_count: 0,
    paper_count: 0,
    cluster_count: 0,
    noise_count: 0,
    year_min: null,
    year_max: null,
  }

  const clusterRows = await queryRows<{
    cluster_id: number
    label: string | null
    count: number
  }>(
    conn,
    `SELECT
       COALESCE(clusterId, 0)::INTEGER AS cluster_id,
       COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR)) AS label,
       count(*)::INTEGER AS count
     FROM ${tableName}
     WHERE ${scopedPredicate}
       AND COALESCE(clusterId, 0) > 0
     GROUP BY COALESCE(clusterId, 0), COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR))
     ORDER BY count DESC, cluster_id
     LIMIT 8`
  )

  return {
    totalCount: summaryRow.total_count,
    scopedCount: summaryRow.scoped_count,
    baseCount: summaryRow.base_count,
    overlayCount: summaryRow.overlay_count,
    scope,
    isSubset: scope !== 'dataset' && summaryRow.scoped_count < summaryRow.total_count,
    hasSelection: scope === 'selected',
    papers: summaryRow.paper_count,
    clusters: summaryRow.cluster_count,
    noise: summaryRow.noise_count,
    yearRange:
      summaryRow.year_min != null && summaryRow.year_max != null
        ? { min: summaryRow.year_min, max: summaryRow.year_max }
        : null,
    topClusters: clusterRows.map((row) => ({
      clusterId: row.cluster_id,
      label: row.label ?? `Cluster ${row.cluster_id}`,
      count: row.count,
    })),
  }
}

export async function queryInfoBars(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
): Promise<Array<{ value: string; count: number }>> {
  const { layer, scope, column, maxItems, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const safeColumn = resolveInfoColumn(layer, column)
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )

  const rows = await queryRows<{ value: string | null; count: number }>(
    conn,
    `SELECT
       CAST(${safeColumn} AS VARCHAR) AS value,
       count(*)::INTEGER AS count
     FROM ${tableName}
     WHERE ${scopedPredicate}
       AND ${safeColumn} IS NOT NULL
       AND CAST(${safeColumn} AS VARCHAR) <> ''
     GROUP BY CAST(${safeColumn} AS VARCHAR)
     ORDER BY count DESC, value
     LIMIT ${Math.max(1, maxItems)}`
  )

  return rows
    .filter((row): row is { value: string; count: number } => Boolean(row.value))
    .map((row) => ({ value: row.value, count: row.count }))
}

export async function queryInfoHistogram(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    bins: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
): Promise<{ bins: GraphInfoHistogramBin[]; totalCount: number }> {
  const { layer, scope, column, bins, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const safeColumn = resolveInfoColumn(layer, column)
  const columnMeta = getColumnMetaForLayer(column, layer)
  if (columnMeta?.type !== 'numeric') {
    return { bins: [], totalCount: 0 }
  }
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )
  const safeBins = Math.max(1, Math.min(64, bins))

  const rows = await queryRows<{
    bin_min: number
    bin_max: number
    count: number
  }>(
    conn,
    `WITH scoped AS (
       SELECT CAST(${safeColumn} AS DOUBLE) AS value
       FROM ${tableName}
       WHERE ${scopedPredicate}
         AND ${safeColumn} IS NOT NULL
     ),
     stats AS (
       SELECT min(value) AS min_value, max(value) AS max_value, count(*)::INTEGER AS total_count
       FROM scoped
     ),
     binned AS (
       SELECT
         CASE
           WHEN stats.min_value = stats.max_value THEN stats.min_value
           ELSE stats.min_value + ((stats.max_value - stats.min_value) / ${safeBins}) *
             LEAST(FLOOR((value - stats.min_value) / ((stats.max_value - stats.min_value) / ${safeBins})), ${safeBins - 1})
         END AS bin_min,
         CASE
           WHEN stats.min_value = stats.max_value THEN stats.max_value
           ELSE stats.min_value + ((stats.max_value - stats.min_value) / ${safeBins}) *
             (LEAST(FLOOR((value - stats.min_value) / ((stats.max_value - stats.min_value) / ${safeBins})), ${safeBins - 1}) + 1)
         END AS bin_max
       FROM scoped, stats
       WHERE stats.total_count > 0
     )
     SELECT
       bin_min,
       bin_max,
       count(*)::INTEGER AS count
     FROM binned
     GROUP BY bin_min, bin_max
     ORDER BY bin_min`
  )

  const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
  return {
    bins: rows.map((row) => ({
      min: row.bin_min,
      max: row.bin_max,
      count: row.count,
    })),
    totalCount,
  }
}
