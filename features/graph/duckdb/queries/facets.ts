import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphInfoFacetRow, GraphInfoScope, MapLayer } from '@/features/graph/types'

import {
  buildScopedLayerPredicate,
  getColumnMetaForLayer,
  getLayerTableName,
  resolveInfoColumn,
} from '../sql-helpers'

import { queryRows } from './core'

function buildFacetCountsSql(args: {
  tableName: string
  scopedPredicate: string | null
  columns: string[]
  limitPerColumn: number
  layer: MapLayer
}) {
  const { tableName, scopedPredicate, columns, limitPerColumn, layer } = args
  if (columns.length === 0) {
    return null
  }

  const unions = columns.map((column) => {
    const safeColumn = resolveInfoColumn(layer, column)
    const columnMeta = getColumnMetaForLayer(column, layer)
    const valueExpr = columnMeta?.isMultiValue
      ? 'TRIM(CAST(split_value AS VARCHAR))'
      : `CAST(${safeColumn} AS VARCHAR)`
    const fromExpr = columnMeta?.isMultiValue
      ? `${tableName}, UNNEST(string_split_regex(CAST(${safeColumn} AS VARCHAR), '\\s*,\\s*')) AS split(split_value)`
      : tableName
    const whereClause = scopedPredicate
      ? `WHERE ${scopedPredicate}
         AND ${safeColumn} IS NOT NULL
         AND CAST(${safeColumn} AS VARCHAR) <> ''
         AND ${valueExpr} <> ''`
      : `WHERE ${safeColumn} IS NOT NULL
         AND CAST(${safeColumn} AS VARCHAR) <> ''
         AND ${valueExpr} <> ''`

    return `SELECT
              '${safeColumn}' AS column_key,
              ${valueExpr} AS value,
              count(*)::INTEGER AS count
            FROM ${fromExpr}
            ${whereClause}
            GROUP BY 1, 2`
  })

  return `WITH counts AS (
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
          WHERE row_rank <= ${limitPerColumn}
          ORDER BY column_key, row_rank`
}

export async function queryFacetSummary(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems: number
    currentPointScopeSql: string | null
  }
): Promise<GraphInfoFacetRow[]> {
  const { layer, scope, column, maxItems, currentPointScopeSql } = args
  const tableName = getLayerTableName(layer)
  const safeColumn = resolveInfoColumn(layer, column)
  const columnMeta = getColumnMetaForLayer(column, layer)
  const safeMaxItems = Math.max(1, maxItems)
  const scopedPredicate = buildScopedLayerPredicate(layer, scope, currentPointScopeSql)
  const valueExpr = columnMeta?.isMultiValue
    ? 'TRIM(CAST(split_value AS VARCHAR))'
    : `CAST(${safeColumn} AS VARCHAR)`
  const fromExpr = columnMeta?.isMultiValue
    ? `${tableName}, UNNEST(string_split_regex(CAST(${safeColumn} AS VARCHAR), '\\s*,\\s*')) AS split(split_value)`
    : tableName

  const allRows = await queryRows<{ value: string | null; count: number }>(
    conn,
    `SELECT
       ${valueExpr} AS value,
       count(*)::INTEGER AS count
     FROM ${fromExpr}
     WHERE ${safeColumn} IS NOT NULL
       AND CAST(${safeColumn} AS VARCHAR) <> ''
       AND ${valueExpr} <> ''
     GROUP BY ${valueExpr}
     ORDER BY count DESC, value
     LIMIT ${safeMaxItems * 4}`
  )

  const scopedRows =
    scope === 'dataset'
        ? allRows
      : await queryRows<{ value: string | null; count: number }>(
          conn,
          `SELECT
             ${valueExpr} AS value,
             count(*)::INTEGER AS count
           FROM ${fromExpr}
           WHERE ${scopedPredicate}
             AND ${safeColumn} IS NOT NULL
             AND CAST(${safeColumn} AS VARCHAR) <> ''
             AND ${valueExpr} <> ''
           GROUP BY ${valueExpr}
           ORDER BY count DESC, value
           LIMIT ${safeMaxItems * 4}`
        )

  const allCounts = new Map<string, number>()
  for (const row of allRows) {
    if (row.value) {
      allCounts.set(row.value, row.count)
    }
  }
  const scopedCounts = new Map<string, number>()
  for (const row of scopedRows) {
    if (row.value) {
      scopedCounts.set(row.value, row.count)
    }
  }

  if (scope === 'dataset') {
    return [...allCounts.entries()]
      .slice(0, safeMaxItems)
      .map(([value, count]) => ({
        value,
        scopedCount: count,
        totalCount: count,
      }))
  }

  const selectedRows: GraphInfoFacetRow[] = [...scopedCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, safeMaxItems)
    .map(([value, scopedCount]) => ({
      value,
      scopedCount,
      totalCount: allCounts.get(value) ?? 0,
    }))

  if (selectedRows.length < safeMaxItems) {
    const selectedValues = new Set(selectedRows.map((row) => row.value))
    for (const [value, totalCount] of [...allCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      if (selectedValues.has(value)) {
        continue
      }
      selectedRows.push({ value, scopedCount: 0, totalCount })
      if (selectedRows.length >= safeMaxItems) {
        break
      }
    }
  }

  return selectedRows
}

export async function queryFacetSummaries(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    columns: string[]
    maxItems: number
    currentPointScopeSql: string | null
  }
): Promise<Record<string, GraphInfoFacetRow[]>> {
  const {
    layer,
    scope,
    columns,
    maxItems,
    currentPointScopeSql,
  } = args
  const tableName = getLayerTableName(layer)
  const safeColumns = [...new Set(columns)].filter((column) =>
    Boolean(resolveInfoColumn(layer, column))
  )
  const safeMaxItems = Math.max(1, maxItems)
  const scopedPredicate = buildScopedLayerPredicate(layer, scope, currentPointScopeSql)

  const datasetSql = buildFacetCountsSql({
    tableName,
    scopedPredicate: null,
    columns: safeColumns,
    limitPerColumn: safeMaxItems * 4,
    layer,
  })
  const scopedSql =
    scope === 'dataset'
      ? null
      : buildFacetCountsSql({
          tableName,
          scopedPredicate,
          columns: safeColumns,
          limitPerColumn: safeMaxItems * 4,
          layer,
        })

  if (!datasetSql) {
    return {}
  }

  const [datasetRows, scopedRows] = await Promise.all([
    queryRows<{ column_key: string; value: string | null; count: number }>(conn, datasetSql),
    scopedSql
      ? queryRows<{ column_key: string; value: string | null; count: number }>(conn, scopedSql)
      : Promise.resolve([]),
  ])

  const datasetCounts = new Map<string, Map<string, number>>()
  for (const row of datasetRows) {
    if (!row.value) continue
    const columnMap = datasetCounts.get(row.column_key) ?? new Map<string, number>()
    columnMap.set(row.value, row.count)
    datasetCounts.set(row.column_key, columnMap)
  }

  const scopedCounts = new Map<string, Map<string, number>>()
  for (const row of scopedRows) {
    if (!row.value) continue
    const columnMap = scopedCounts.get(row.column_key) ?? new Map<string, number>()
    columnMap.set(row.value, row.count)
    scopedCounts.set(row.column_key, columnMap)
  }

  const result: Record<string, GraphInfoFacetRow[]> = {}

  for (const column of safeColumns) {
    const safeColumn = resolveInfoColumn(layer, column)
    const totalMap = datasetCounts.get(safeColumn) ?? new Map<string, number>()
    const currentMap = scope === 'dataset'
      ? totalMap
      : scopedCounts.get(safeColumn) ?? new Map<string, number>()

    if (scope === 'dataset') {
      result[column] = [...totalMap.entries()]
        .slice(0, safeMaxItems)
        .map(([value, count]) => ({
          value,
          scopedCount: count,
          totalCount: count,
        }))
      continue
    }

    const rows = [...currentMap.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, safeMaxItems)
      .map(([value, scopedCount]) => ({
        value,
        scopedCount,
        totalCount: totalMap.get(value) ?? 0,
      }))

    if (rows.length < safeMaxItems) {
      const seen = new Set(rows.map((row) => row.value))
      for (const [value, totalCount] of [...totalMap.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      )) {
        if (seen.has(value)) {
          continue
        }
        rows.push({ value, scopedCount: 0, totalCount })
        if (rows.length >= safeMaxItems) {
          break
        }
      }
    }

    result[column] = rows
  }

  return result
}
