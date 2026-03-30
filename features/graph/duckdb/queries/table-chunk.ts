import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { type GraphTablePageResult } from '@/features/graph/types'

import {
  buildCurrentViewPredicate,
  buildSelectedViewPredicate,
} from '../sql-helpers'

import { queryRows } from './core'
import {
  mapGraphPointRow,
  type GraphPointSelectionRow,
} from './node-selection'

export async function queryCorpusTablePage(
  conn: AsyncDuckDBConnection,
  args: {
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointScopeSql: string | null
  }
): Promise<GraphTablePageResult> {
  const { page, pageSize, view, currentPointScopeSql } = args
  const safePage = Math.max(page, 1)
  const safePageSize = Math.max(pageSize, 1)
  const offset = (safePage - 1) * safePageSize
  const currentPredicate = buildCurrentViewPredicate({
    currentPointScopeSql,
  })
  const scopePredicate = view === 'selected' ? buildSelectedViewPredicate() : currentPredicate
  const totalRowsResult = await queryRows<{ totalRows: number }>(
    conn,
    `SELECT count(*)::INTEGER AS totalRows
     FROM current_points_web
     WHERE ${scopePredicate}`
  )

  const totalRows = totalRowsResult[0]?.totalRows ?? 0
  if (totalRows === 0) {
    return { totalRows: 0, page, pageSize, rows: [] }
  }

  const rows = await queryRows<GraphPointSelectionRow>(
    conn,
    `SELECT
       index,
       id,
       paperId,
       nodeRole,
       hexColor AS color,
       hexColorLight AS colorLight,
       x,
       y,
       clusterId,
       clusterLabel,
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
       END AS isOverlayActive
     FROM current_points_web
     WHERE ${scopePredicate}
     ORDER BY index
     LIMIT ? OFFSET ?`,
    [safePageSize, offset]
  )

  return {
    totalRows,
    page,
    pageSize,
    rows: rows.map(mapGraphPointRow),
  }
}

function escapeCsvValue(value: unknown): string {
  if (value == null) {
    return '""'
  }

  const text = String(value).replaceAll('"', '""')
  return `"${text}"`
}

export async function exportCorpusTableCsv(
  conn: AsyncDuckDBConnection,
  args: {
    view: 'current' | 'selected'
    currentPointScopeSql: string | null
  }
): Promise<string> {
  const { view, currentPointScopeSql } = args
  const currentPredicate = buildCurrentViewPredicate({
    currentPointScopeSql,
  })
  const scopePredicate = view === 'selected'
    ? buildSelectedViewPredicate()
    : currentPredicate

  const rows = await queryRows<GraphPointSelectionRow>(
    conn,
    `SELECT
      index,
      id,
      paperId,
      nodeRole,
      x,
      y,
      clusterId,
      clusterLabel,
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
      END AS isOverlayActive
    FROM current_points_web
    WHERE ${scopePredicate}
    ORDER BY index`
  )

  const headers = [
    'index',
    'id',
    'paperId',
    'nodeRole',
    'x',
    'y',
    'clusterId',
    'clusterLabel',
    'displayLabel',
    'paperTitle',
    'citekey',
    'journal',
    'year',
    'semanticGroups',
    'relationCategories',
    'textAvailability',
    'paperAuthorCount',
    'paperReferenceCount',
    'paperEntityCount',
    'paperRelationCount',
    'isInBase',
    'baseRank',
    'isOverlayActive',
  ] as const

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ]

  return lines.join('\n')
}
