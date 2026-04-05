import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphPointRecord } from '@/features/graph/types'

import { buildSelectedViewPredicate } from '../sql-helpers'
import { queryRows } from './core'

export interface GraphPointSelectionRow {
  index: number
  id: string
  paperId: string | null
  nodeRole: 'primary' | 'overlay' | null
  color: string
  colorLight: string
  x: number
  y: number
  clusterId: number | null
  clusterLabel: string | null
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
}

export function mapGraphPointRow(row: GraphPointSelectionRow): GraphPointRecord {
  return {
    index: row.index,
    id: row.id,
    paperId: row.paperId,
    nodeKind: 'paper',
    nodeRole: row.nodeRole ?? 'primary',
    color: row.color,
    colorLight: row.colorLight,
    x: row.x,
    y: row.y,
    clusterId: row.clusterId ?? 0,
    clusterLabel: row.clusterLabel,
    displayLabel: row.displayLabel,
    displayPreview: row.paperTitle ?? row.displayLabel,
    paperTitle: row.paperTitle,
    citekey: row.citekey,
    journal: row.journal,
    year: row.year,
    semanticGroups: row.semanticGroups,
    relationCategories: row.relationCategories,
    textAvailability: row.textAvailability,
    paperAuthorCount: row.paperAuthorCount,
    paperReferenceCount: row.paperReferenceCount,
    paperEntityCount: row.paperEntityCount,
    paperRelationCount: row.paperRelationCount,
    isInBase: row.isInBase ?? false,
    baseRank: row.baseRank,
    isOverlayActive: row.isOverlayActive ?? false,
  }
}

export async function queryCorpusPointSelection(
  conn: AsyncDuckDBConnection,
  selector: { id?: string; index?: number }
): Promise<GraphPointRecord | null> {
  const { id, index } = selector
  if (id == null && index == null) {
    return null
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
    WHERE ${id != null ? 'id = ?' : 'index = ?'}
    LIMIT 1`,
    [id ?? index ?? null]
  )

  return rows[0] ? mapGraphPointRow(rows[0]) : null
}

export async function querySelectionScopeGraphPaperRefs(
  conn: AsyncDuckDBConnection,
  args: {
    currentPointScopeSql: string | null
  },
): Promise<string[]> {
  const normalizedScopeSql =
    typeof args.currentPointScopeSql === "string" &&
    args.currentPointScopeSql.trim().length > 0
      ? args.currentPointScopeSql.trim()
      : null;
  const whereClause =
    (normalizedScopeSql != null ? `(${normalizedScopeSql})` : null) ??
    buildSelectedViewPredicate();
  const rows = await queryRows<{ graphPaperRef: string }>(
    conn,
    `SELECT DISTINCT COALESCE(paperId, id) AS graphPaperRef
     FROM current_points_web
     WHERE ${whereClause}
       AND COALESCE(paperId, id) IS NOT NULL
       AND LENGTH(TRIM(COALESCE(paperId, id))) > 0
     ORDER BY graphPaperRef`
  )

  return rows.map((row) => row.graphPaperRef)
}
