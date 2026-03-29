import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphInfoFacetRow, GraphInfoScope, MapLayer } from '@/features/graph/types'

import {
  buildScopedLayerPredicate,
  getLayerTableName,
  resolveInfoColumn,
} from '../sql-helpers'

import { queryRows } from './core'

export async function queryFacetSummary(
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
): Promise<GraphInfoFacetRow[]> {
  const { layer, scope, column, maxItems, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const safeColumn = resolveInfoColumn(layer, column)
  const safeMaxItems = Math.max(1, maxItems)
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )

  const allRows = await queryRows<{ value: string | null; count: number }>(
    conn,
    `SELECT
       CAST(${safeColumn} AS VARCHAR) AS value,
       count(*)::INTEGER AS count
     FROM ${tableName}
     WHERE ${safeColumn} IS NOT NULL
       AND CAST(${safeColumn} AS VARCHAR) <> ''
     GROUP BY CAST(${safeColumn} AS VARCHAR)
     ORDER BY count DESC, value
     LIMIT ${safeMaxItems * 4}`
  )

  const scopedRows =
    scope === 'dataset'
      ? allRows
      : await queryRows<{ value: string | null; count: number }>(
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
