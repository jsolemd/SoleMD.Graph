import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type {
  GraphInfoHistogramResult,
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

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''")
}

function getSafeScopedContext(args: {
  layer: MapLayer
  scope: GraphInfoScope
  currentPointScopeSql: string | null
}) {
  const { layer, scope, currentPointScopeSql } = args
  return {
    tableName: getLayerTableName(layer),
    scopedPredicate: buildScopedLayerPredicate(layer, scope, currentPointScopeSql),
  }
}

export async function queryInfoSummary(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    currentPointScopeSql: string | null
    datasetTotalCount?: number | null
    clusterLimit?: number
  }
): Promise<GraphInfoSummary> {
  const { layer, scope, currentPointScopeSql, datasetTotalCount, clusterLimit = 8 } = args
  const safeClusterLimit = Math.max(1, Math.min(100, clusterLimit))
  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  })
  const rows = await queryRows<{
    row_type: 'summary' | 'cluster'
    total_count: number
    scoped_count: number
    base_count: number
    overlay_count: number
    paper_count: number
    cluster_count: number
    noise_count: number
    year_min: number | null
    year_max: number | null
    cluster_id: number | null
    label: string | null
    member_count: number | null
  }>(
    conn,
    scope === 'dataset'
      ? `WITH scoped AS (
       SELECT * FROM ${tableName}
     ),
     summary AS (
       SELECT
         count(*)::INTEGER AS total_count,
         count(*)::INTEGER AS scoped_count,
         count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') <> 'overlay')::INTEGER AS base_count,
         count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') = 'overlay')::INTEGER AS overlay_count,
         count(DISTINCT CASE WHEN paperId IS NOT NULL AND paperId <> '' THEN paperId END)::INTEGER AS paper_count,
         count(DISTINCT CASE WHEN COALESCE(clusterId, 0) > 0 THEN clusterId END)::INTEGER AS cluster_count,
         count(*) FILTER (WHERE COALESCE(clusterId, 0) <= 0)::INTEGER AS noise_count,
         min(year)::INTEGER AS year_min,
         max(year)::INTEGER AS year_max
       FROM scoped
     ),
     clusters AS (
       SELECT
         COALESCE(clusterId, 0)::INTEGER AS cluster_id,
         COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR)) AS label,
         count(*)::INTEGER AS member_count
       FROM scoped
       WHERE COALESCE(clusterId, 0) > 0
       GROUP BY COALESCE(clusterId, 0), COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR))
       ORDER BY member_count DESC, cluster_id
       LIMIT ${safeClusterLimit}
     )
     SELECT
       'summary' AS row_type,
       total_count,
       scoped_count,
       base_count,
       overlay_count,
       paper_count,
       cluster_count,
       noise_count,
       year_min,
       year_max,
       NULL::INTEGER AS cluster_id,
       NULL::VARCHAR AS label,
       NULL::INTEGER AS member_count
     FROM summary
     UNION ALL
     SELECT
       'cluster' AS row_type,
       NULL::INTEGER AS total_count,
       NULL::INTEGER AS scoped_count,
       NULL::INTEGER AS base_count,
       NULL::INTEGER AS overlay_count,
       NULL::INTEGER AS paper_count,
       NULL::INTEGER AS cluster_count,
       NULL::INTEGER AS noise_count,
       NULL::INTEGER AS year_min,
       NULL::INTEGER AS year_max,
       cluster_id,
       label,
       member_count
     FROM clusters`
      : `WITH scoped AS (
       SELECT * FROM ${tableName} WHERE ${scopedPredicate}
     ),
     summary AS (
       SELECT
         ?::INTEGER AS total_count,
         count(*)::INTEGER AS scoped_count,
         count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') <> 'overlay')::INTEGER AS base_count,
         count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') = 'overlay')::INTEGER AS overlay_count,
         count(DISTINCT CASE WHEN paperId IS NOT NULL AND paperId <> '' THEN paperId END)::INTEGER AS paper_count,
         count(DISTINCT CASE WHEN COALESCE(clusterId, 0) > 0 THEN clusterId END)::INTEGER AS cluster_count,
         count(*) FILTER (WHERE COALESCE(clusterId, 0) <= 0)::INTEGER AS noise_count,
         min(year)::INTEGER AS year_min,
         max(year)::INTEGER AS year_max
       FROM scoped
     ),
     clusters AS (
       SELECT
         COALESCE(clusterId, 0)::INTEGER AS cluster_id,
         COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR)) AS label,
         count(*)::INTEGER AS member_count
       FROM scoped
       WHERE COALESCE(clusterId, 0) > 0
       GROUP BY COALESCE(clusterId, 0), COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR))
       ORDER BY member_count DESC, cluster_id
       LIMIT ${safeClusterLimit}
     )
     SELECT
       'summary' AS row_type,
       totals.total_count,
       scoped_count,
       base_count,
       overlay_count,
       paper_count,
       cluster_count,
       noise_count,
       year_min,
       year_max,
       NULL::INTEGER AS cluster_id,
       NULL::VARCHAR AS label,
       NULL::INTEGER AS member_count
     FROM summary totals
     UNION ALL
     SELECT
       'cluster' AS row_type,
       NULL::INTEGER AS total_count,
       NULL::INTEGER AS scoped_count,
       NULL::INTEGER AS base_count,
       NULL::INTEGER AS overlay_count,
       NULL::INTEGER AS paper_count,
       NULL::INTEGER AS cluster_count,
       NULL::INTEGER AS noise_count,
       NULL::INTEGER AS year_min,
       NULL::INTEGER AS year_max,
       cluster_id,
       label,
       member_count
     FROM clusters`
    ,
    scope === 'dataset' ? [] : [datasetTotalCount ?? 0]
  )
  const summaryRow = rows.find((row) => row.row_type === 'summary') ?? {
    total_count: 0,
    scoped_count: 0,
    base_count: 0,
    overlay_count: 0,
    paper_count: 0,
    cluster_count: 0,
    noise_count: 0,
    year_min: null,
    year_max: null,
    cluster_id: null,
    label: null,
    member_count: null,
  }
  const clusterRows = rows.filter((row) => row.row_type === 'cluster')

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
      clusterId: row.cluster_id ?? 0,
      label: row.label ?? `Cluster ${row.cluster_id ?? 0}`,
      count: row.member_count ?? 0,
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
    currentPointScopeSql: string | null
  }
): Promise<Array<{ value: string; count: number }>> {
  const { layer, scope, column, maxItems, currentPointScopeSql } = args
  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  })
  const safeColumn = resolveInfoColumn(layer, column)

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
    currentPointScopeSql: string | null
    extent?: [number, number] | null
    useQuantiles?: boolean
  }
): Promise<GraphInfoHistogramResult> {
  const {
    layer,
    scope,
    column,
    bins,
    currentPointScopeSql,
    extent,
    useQuantiles = false,
  } = args
  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  })
  const safeColumn = resolveInfoColumn(layer, column)
  const columnMeta = getColumnMetaForLayer(column, layer)
  if (columnMeta?.type !== 'numeric') {
    return { bins: [], totalCount: 0 }
  }
  const safeBins = Math.max(1, Math.min(64, bins))
  const minExtent = Array.isArray(extent) ? Number(extent[0]) : null
  const maxExtent = Array.isArray(extent) ? Number(extent[1]) : null

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
       SELECT
         min(value) AS min_value,
         max(value) AS max_value,
         quantile_cont(value, 0.05) AS q05_value,
         quantile_cont(value, 0.95) AS q95_value,
         count(*)::INTEGER AS total_count
       FROM scoped
     ),
     bounds AS (
       SELECT
         CASE
           WHEN total_count = 0 THEN NULL
           WHEN ? IS NOT NULL THEN ?
           WHEN ${useQuantiles ? 'TRUE' : 'FALSE'} THEN COALESCE(q05_value, min_value)
           ELSE min_value
         END AS lower_bound,
         CASE
           WHEN total_count = 0 THEN NULL
           WHEN ? IS NOT NULL THEN ?
           WHEN ${useQuantiles ? 'TRUE' : 'FALSE'} THEN COALESCE(q95_value, max_value)
           ELSE max_value
         END AS upper_bound,
         total_count
       FROM stats
     ),
     binned AS (
       SELECT
         CASE
           WHEN bounds.lower_bound = bounds.upper_bound THEN bounds.lower_bound
           ELSE bounds.lower_bound + ((bounds.upper_bound - bounds.lower_bound) / ${safeBins}) *
             LEAST(
               GREATEST(
                 FLOOR(
                   (
                     LEAST(GREATEST(value, bounds.lower_bound), bounds.upper_bound) -
                     bounds.lower_bound
                   ) / ((bounds.upper_bound - bounds.lower_bound) / ${safeBins})
                 ),
                 0
               ),
               ${safeBins - 1}
             )
         END AS bin_min,
         CASE
           WHEN bounds.lower_bound = bounds.upper_bound THEN bounds.upper_bound
           ELSE bounds.lower_bound + ((bounds.upper_bound - bounds.lower_bound) / ${safeBins}) *
             (
               LEAST(
                 GREATEST(
                   FLOOR(
                     (
                       LEAST(GREATEST(value, bounds.lower_bound), bounds.upper_bound) -
                       bounds.lower_bound
                     ) / ((bounds.upper_bound - bounds.lower_bound) / ${safeBins})
                   ),
                   0
                 ),
                 ${safeBins - 1}
               ) + 1
             )
         END AS bin_max
       FROM scoped, bounds
       WHERE bounds.total_count > 0
         AND bounds.lower_bound IS NOT NULL
         AND bounds.upper_bound IS NOT NULL
     )
     SELECT
       bin_min,
       bin_max,
       count(*)::INTEGER AS count
     FROM binned
     GROUP BY bin_min, bin_max
     ORDER BY bin_min`,
    [minExtent, minExtent, maxExtent, maxExtent]
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

export async function queryInfoBarsBatch(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    columns: string[]
    maxItems: number
    currentPointScopeSql: string | null
  }
): Promise<Record<string, Array<{ value: string; count: number }>>> {
  const { layer, scope, columns, maxItems, currentPointScopeSql } = args
  const safeColumns = [...new Set(columns)].filter(
    (column) => getColumnMetaForLayer(column, layer)?.type === 'categorical'
  )
  if (safeColumns.length === 0) {
    return {}
  }

  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  })
  const safeMaxItems = Math.max(1, maxItems)
  const unions = safeColumns.map((column) => {
    const safeColumn = resolveInfoColumn(layer, column)
    return `SELECT
              '${escapeSqlLiteral(column)}' AS column_key,
              CAST(${safeColumn} AS VARCHAR) AS value,
              count(*)::INTEGER AS count
            FROM ${tableName}
            WHERE ${scopedPredicate}
              AND ${safeColumn} IS NOT NULL
              AND CAST(${safeColumn} AS VARCHAR) <> ''
            GROUP BY 1, 2`
  })

  const rows = await queryRows<{
    column_key: string
    value: string | null
    count: number
  }>(
    conn,
    `WITH counts AS (
       ${unions.join('\nUNION ALL\n')}
     ),
     ranked AS (
       SELECT
         column_key,
         value,
         count,
         ROW_NUMBER() OVER (
           PARTITION BY column_key
           ORDER BY count DESC, value
         ) AS row_rank
       FROM counts
     )
     SELECT
       column_key,
       value,
       count
     FROM ranked
     WHERE row_rank <= ${safeMaxItems}
     ORDER BY column_key, row_rank`
  )

  const result: Record<string, Array<{ value: string; count: number }>> = {}
  for (const column of safeColumns) {
    result[column] = []
  }

  for (const row of rows) {
    if (!row.value) continue
    result[row.column_key] ??= []
    result[row.column_key].push({ value: row.value, count: row.count })
  }

  return result
}

export async function queryInfoHistogramsBatch(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    columns: string[]
    bins: number
    currentPointScopeSql: string | null
    extent?: [number, number] | null
    extentsByColumn?: Record<string, [number, number] | null>
    useQuantiles?: boolean
  }
): Promise<Record<string, GraphInfoHistogramResult>> {
  const {
    layer,
    scope,
    columns,
    bins,
    currentPointScopeSql,
    extent,
    extentsByColumn,
    useQuantiles = false,
  } = args
  const safeColumns = [...new Set(columns)].filter(
    (column) => getColumnMetaForLayer(column, layer)?.type === 'numeric'
  )
  if (safeColumns.length === 0) {
    return {}
  }

  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  })
  const safeBins = Math.max(1, Math.min(64, bins))
  const minExtent = Array.isArray(extent) ? Number(extent[0]) : null
  const maxExtent = Array.isArray(extent) ? Number(extent[1]) : null
  const manualBoundsRows = safeColumns.flatMap((column) => {
    const columnExtent = extentsByColumn?.[column]
    if (
      !Array.isArray(columnExtent) ||
      columnExtent.length !== 2 ||
      !Number.isFinite(columnExtent[0]) ||
      !Number.isFinite(columnExtent[1])
    ) {
      return []
    }

    return [
      `SELECT
         '${escapeSqlLiteral(column)}' AS column_key,
         CAST(${Number(columnExtent[0])} AS DOUBLE) AS lower_bound,
         CAST(${Number(columnExtent[1])} AS DOUBLE) AS upper_bound`,
    ]
  })
  const unions = safeColumns.map((column) => {
    const safeColumn = resolveInfoColumn(layer, column)
    return `SELECT
              '${escapeSqlLiteral(column)}' AS column_key,
              CAST(${safeColumn} AS DOUBLE) AS value
            FROM ${tableName}
            WHERE ${scopedPredicate}
              AND ${safeColumn} IS NOT NULL`
  })

  const rows = await queryRows<{
    column_key: string
    bin_min: number
    bin_max: number
    count: number
    total_count: number
  }>(
    conn,
    `WITH values_by_column AS (
       ${unions.join('\nUNION ALL\n')}
     ),
     manual_bounds AS (
       ${
         manualBoundsRows.length > 0
           ? manualBoundsRows.join('\nUNION ALL\n')
           : `SELECT
                CAST(NULL AS VARCHAR) AS column_key,
                CAST(NULL AS DOUBLE) AS lower_bound,
                CAST(NULL AS DOUBLE) AS upper_bound
              WHERE FALSE`
       }
     ),
     stats AS (
       SELECT
         column_key,
         min(value) AS min_value,
         max(value) AS max_value,
         quantile_cont(value, 0.05) AS q05_value,
         quantile_cont(value, 0.95) AS q95_value,
         count(*)::INTEGER AS total_count
       FROM values_by_column
       GROUP BY column_key
     ),
     bounds AS (
       SELECT
         column_key,
         CASE
           WHEN total_count = 0 THEN NULL
           WHEN manual_bounds.lower_bound IS NOT NULL THEN manual_bounds.lower_bound
           WHEN ? IS NOT NULL THEN ?
           WHEN ${useQuantiles ? 'TRUE' : 'FALSE'} THEN COALESCE(q05_value, min_value)
           ELSE min_value
         END AS lower_bound,
         CASE
           WHEN total_count = 0 THEN NULL
           WHEN manual_bounds.upper_bound IS NOT NULL THEN manual_bounds.upper_bound
           WHEN ? IS NOT NULL THEN ?
           WHEN ${useQuantiles ? 'TRUE' : 'FALSE'} THEN COALESCE(q95_value, max_value)
           ELSE max_value
         END AS upper_bound,
         total_count
       FROM stats
       LEFT JOIN manual_bounds
         ON manual_bounds.column_key = stats.column_key
     ),
     binned AS (
       SELECT
         values_by_column.column_key,
         CASE
           WHEN bounds.lower_bound = bounds.upper_bound THEN bounds.lower_bound
           ELSE bounds.lower_bound + ((bounds.upper_bound - bounds.lower_bound) / ${safeBins}) *
             LEAST(
               GREATEST(
                 FLOOR(
                   (
                     LEAST(GREATEST(value, bounds.lower_bound), bounds.upper_bound) -
                     bounds.lower_bound
                   ) / ((bounds.upper_bound - bounds.lower_bound) / ${safeBins})
                 ),
                 0
               ),
               ${safeBins - 1}
             )
         END AS bin_min,
         CASE
           WHEN bounds.lower_bound = bounds.upper_bound THEN bounds.upper_bound
           ELSE bounds.lower_bound + ((bounds.upper_bound - bounds.lower_bound) / ${safeBins}) *
             (
               LEAST(
                 GREATEST(
                   FLOOR(
                     (
                       LEAST(GREATEST(value, bounds.lower_bound), bounds.upper_bound) -
                       bounds.lower_bound
                     ) / ((bounds.upper_bound - bounds.lower_bound) / ${safeBins})
                   ),
                   0
                 ),
                 ${safeBins - 1}
               ) + 1
             )
         END AS bin_max
       FROM values_by_column
       JOIN bounds
         ON bounds.column_key = values_by_column.column_key
       WHERE bounds.total_count > 0
         AND bounds.lower_bound IS NOT NULL
         AND bounds.upper_bound IS NOT NULL
     )
     SELECT
       binned.column_key,
       binned.bin_min,
       binned.bin_max,
       count(*)::INTEGER AS count,
       max(bounds.total_count)::INTEGER AS total_count
     FROM binned
     JOIN bounds
       ON bounds.column_key = binned.column_key
     GROUP BY
       binned.column_key,
       binned.bin_min,
       binned.bin_max
     ORDER BY binned.column_key, binned.bin_min`,
    [minExtent, minExtent, maxExtent, maxExtent]
  )

  const result: Record<string, GraphInfoHistogramResult> = {}
  for (const column of safeColumns) {
    result[column] = { bins: [], totalCount: 0 }
  }

  for (const row of rows) {
    const current = result[row.column_key] ?? { bins: [], totalCount: 0 }
    current.totalCount = row.total_count
    current.bins.push({
      min: row.bin_min,
      max: row.bin_max,
      count: row.count,
    })
    result[row.column_key] = current
  }

  return result
}

export interface NumericStatsRow {
  min: number
  median: number
  avg: number
  max: number
}

export async function queryNumericStatsBatch(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    columns: string[]
    currentPointScopeSql: string | null
  }
): Promise<Record<string, NumericStatsRow>> {
  const { layer, scope, columns, currentPointScopeSql } = args
  const safeColumns = [...new Set(columns)].filter(
    (column) => getColumnMetaForLayer(column, layer)?.type === 'numeric'
  )
  if (safeColumns.length === 0) {
    return {}
  }

  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  })

  const unions = safeColumns.map((column) => {
    const safeColumn = resolveInfoColumn(layer, column)
    return `SELECT
              '${escapeSqlLiteral(column)}' AS column_key,
              MIN(${safeColumn})::DOUBLE AS min_val,
              quantile_cont(${safeColumn}::DOUBLE, 0.5)::DOUBLE AS median_val,
              AVG(${safeColumn}::DOUBLE)::DOUBLE AS avg_val,
              MAX(${safeColumn})::DOUBLE AS max_val
            FROM ${tableName}
            WHERE ${scopedPredicate}
              AND ${safeColumn} IS NOT NULL`
  })

  const rows = await queryRows<{
    column_key: string
    min_val: number | null
    median_val: number | null
    avg_val: number | null
    max_val: number | null
  }>(conn, unions.join('\nUNION ALL\n'))

  const result: Record<string, NumericStatsRow> = {}
  for (const row of rows) {
    if (row.min_val == null || row.max_val == null) continue
    result[row.column_key] = {
      min: row.min_val,
      median: row.median_val ?? row.min_val,
      avg: row.avg_val ?? row.min_val,
      max: row.max_val,
    }
  }

  return result
}
