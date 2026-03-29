import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphSearchResult, MapLayer } from '@/features/graph/types'

import {
  getLayerTableName,
  getSearchLabelExpression,
  resolveSearchColumn,
} from '../sql-helpers'

import { queryRows } from './core'

export async function queryPointSearch(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    column: string
    query: string
    limit?: number
  }
): Promise<GraphSearchResult[]> {
  const term = args.query.trim()
  if (term.length < 2) {
    return []
  }

  const tableName = getLayerTableName(args.layer)
  const column = resolveSearchColumn(args.layer, args.column)
  const normalized = term.toLowerCase()
  const limit = Math.max(1, Math.min(args.limit ?? 12, 25))
  const labelExpr = getSearchLabelExpression(args.layer)

  const rows = await queryRows<{
    id: string
    index: number
    label: string | null
    matched_value: string | null
    subtitle: string | null
  }>(
    conn,
    `SELECT
       id,
       index,
       ${labelExpr} AS label,
       CAST(${column} AS VARCHAR) AS matched_value,
       concat_ws(
         ' · ',
         NULLIF(citekey, ''),
         NULLIF(paperTitle, ''),
         NULLIF(clusterLabel, ''),
         NULLIF(journal, ''),
         CASE
           WHEN year IS NULL THEN NULL
           ELSE CAST(year AS VARCHAR)
         END
       ) AS subtitle
     FROM ${tableName}
     WHERE ${column} IS NOT NULL
       AND LOWER(CAST(${column} AS VARCHAR)) LIKE ?
     ORDER BY
       CASE
         WHEN LOWER(CAST(${column} AS VARCHAR)) = ? THEN 0
         WHEN LOWER(CAST(${column} AS VARCHAR)) LIKE ? THEN 1
         ELSE 2
       END,
       length(CAST(${column} AS VARCHAR)) ASC,
       index ASC
     LIMIT ?`,
    [`%${normalized}%`, normalized, `${normalized}%`, limit]
  )

  return rows.map((row) => ({
    id: row.id,
    index: row.index,
    label: row.label ?? row.matched_value ?? row.id,
    matchedValue: row.matched_value,
    subtitle: row.subtitle,
  }))
}
