import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphSearchResult, MapLayer } from '@/features/graph/types'

import {
  getLayerTableName,
  getSearchLabelExpression,
  resolveSearchColumn,
} from '../sql-helpers'

import { queryRows } from './core'
import { mapGraphPointRow, type GraphPointSelectionRow } from './node-selection'

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
    paperId: string | null
    nodeRole: 'primary' | 'overlay' | null
    color: string
    colorLight: string
    x: number
    y: number
    clusterId: number | null
    clusterLabel: string | null
    parentClusterId: number | null
    parentLabel: string | null
    displayLabel: string | null
    paperTitle: string | null
    citekey: string | null
    journal: string | null
    year: number | null
    semanticGroups: string | null
    relationCategories: string | null
    textAvailability: string | null
    paperAuthorCount: number | null
    paperReferenceCount: number | null
    paperEntityCount: number | null
    paperRelationCount: number | null
    isInBase: boolean | null
    baseRank: number | null
    isOverlayActive: boolean | null
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
       paperId,
       nodeRole,
       hexColor AS color,
       hexColorLight AS colorLight,
       x,
       y,
       clusterId,
       clusterLabel,
       parentClusterId,
       parentLabel,
       displayLabel,
       paperTitle,
       citekey,
       journal,
       year,
       semanticGroups,
       relationCategories,
       textAvailability,
       paperAuthorCount,
       paperReferenceCount,
       paperEntityCount,
       paperRelationCount,
       isInBase,
       baseRank,
       CASE
         WHEN COALESCE(nodeRole, 'primary') = 'overlay' THEN true
         ELSE false
       END AS isOverlayActive,
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
    point: mapGraphPointRow(row as GraphPointSelectionRow),
  }))
}
