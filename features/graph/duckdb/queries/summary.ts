import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type {
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
    parent_cluster_id: number | null
    parent_label: string | null
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
         count(*)::INTEGER AS member_count,
         COALESCE(parentClusterId, clusterId, 0)::INTEGER AS parent_cluster_id,
         parentLabel AS parent_label
       FROM scoped
       WHERE COALESCE(clusterId, 0) > 0
       GROUP BY COALESCE(clusterId, 0), COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR)), COALESCE(parentClusterId, clusterId, 0), parentLabel
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
       NULL::INTEGER AS member_count,
       NULL::INTEGER AS parent_cluster_id,
       NULL::VARCHAR AS parent_label
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
       member_count,
       parent_cluster_id,
       parent_label
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
         count(*)::INTEGER AS member_count,
         COALESCE(parentClusterId, clusterId, 0)::INTEGER AS parent_cluster_id,
         parentLabel AS parent_label
       FROM scoped
       WHERE COALESCE(clusterId, 0) > 0
       GROUP BY COALESCE(clusterId, 0), COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR)), COALESCE(parentClusterId, clusterId, 0), parentLabel
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
       NULL::INTEGER AS member_count,
       NULL::INTEGER AS parent_cluster_id,
       NULL::VARCHAR AS parent_label
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
       member_count,
       parent_cluster_id,
       parent_label
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
      parentClusterId: row.parent_cluster_id ?? row.cluster_id ?? 0,
      parentLabel: row.parent_label ?? null,
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

