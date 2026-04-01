import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphInfoFacetRow } from '@/features/graph/types'

import {
  queryFacetSummary,
  queryInfoBarsBatch,
  queryFacetSummaries,
} from '../queries'
import { getColumnMetaForLayer } from '../sql-helpers'

export function partitionFacetColumns(
  layer: Parameters<typeof queryFacetSummaries>[1]['layer'],
  columns: string[]
) {
  const simpleColumns: string[] = []
  const multiValueColumns: string[] = []

  for (const column of columns) {
    if (getColumnMetaForLayer(column, layer)?.isMultiValue) {
      multiValueColumns.push(column)
    } else {
      simpleColumns.push(column)
    }
  }

  return { simpleColumns, multiValueColumns }
}

export function mapBarsToFacetRows(
  rows: Array<{ value: string; count: number }>
): GraphInfoFacetRow[] {
  return rows.map((row) => ({
    value: row.value,
    scopedCount: row.count,
    totalCount: row.count,
  }))
}

export function hasCurrentScopeSql(scopeSql: string | null) {
  return typeof scopeSql === 'string' && scopeSql.trim().length > 0
}

export function hasFiniteExtent(
  extent: [number, number] | null | undefined
): extent is [number, number] {
  return (
    Array.isArray(extent) &&
    extent.length === 2 &&
    Number.isFinite(extent[0]) &&
    Number.isFinite(extent[1])
  )
}

export async function getScopedFacetBarCounts(
  conn: AsyncDuckDBConnection,
  args: {
    layer: Parameters<typeof queryFacetSummaries>[1]['layer']
    columns: string[]
    maxItems: number
    scope: 'current' | 'selected'
    currentPointScopeSql: string | null
  }
): Promise<Record<string, Array<{ value: string; count: number }>>> {
  const { simpleColumns, multiValueColumns } = partitionFacetColumns(
    args.layer,
    args.columns
  )

  const [simpleResults, multiValueResults] = await Promise.all([
    simpleColumns.length > 0
      ? queryInfoBarsBatch(conn, {
          layer: args.layer,
          scope: args.scope,
          columns: simpleColumns,
          maxItems: args.maxItems,
          currentPointScopeSql: args.currentPointScopeSql,
        })
      : Promise.resolve({} as Record<string, Array<{ value: string; count: number }>>),
    multiValueColumns.length > 0
      ? Promise.all(
          multiValueColumns.map(async (column) => {
            const rows = await queryFacetSummary(conn, {
              layer: args.layer,
              scope: args.scope,
              column,
              maxItems: args.maxItems,
              currentPointScopeSql: args.currentPointScopeSql,
            })

            return [
              column,
              rows
                .filter((row: GraphInfoFacetRow) => row.scopedCount > 0)
                .map((row: GraphInfoFacetRow) => ({
                  value: row.value,
                  count: row.scopedCount,
                })),
            ] as const
          })
        ).then((entries) => Object.fromEntries(entries))
      : Promise.resolve({} as Record<string, Array<{ value: string; count: number }>>),
  ])

  return {
    ...simpleResults,
    ...multiValueResults,
  }
}

export function mergeFacetSummaryRows(args: {
  datasetRows: GraphInfoFacetRow[]
  scopedRows: Array<{ value: string; count: number }>
  maxItems: number
}): GraphInfoFacetRow[] {
  const { datasetRows, scopedRows, maxItems } = args
  const rows: GraphInfoFacetRow[] = []
  const seen = new Set<string>()
  const totalCountByValue = new Map(
    datasetRows.map((row) => [row.value, row.totalCount] as const)
  )

  for (const row of scopedRows) {
    if (seen.has(row.value)) {
      continue
    }
    seen.add(row.value)
    rows.push({
      value: row.value,
      scopedCount: row.count,
      totalCount: totalCountByValue.get(row.value) ?? 0,
    })
    if (rows.length >= maxItems) {
      return rows
    }
  }

  for (const row of datasetRows) {
    if (seen.has(row.value)) {
      continue
    }
    seen.add(row.value)
    rows.push({
      value: row.value,
      scopedCount: 0,
      totalCount: row.totalCount,
    })
    if (rows.length >= maxItems) {
      break
    }
  }

  return rows
}
