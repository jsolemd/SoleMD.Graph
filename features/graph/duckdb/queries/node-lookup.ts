import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphPointRecord } from '@/features/graph/types'

import { buildPlaceholderList } from '../utils'

import { queryRows } from './core'
import {
  mapGraphPointRow,
  type GraphPointSelectionRow,
} from './node-selection'

export async function queryPaperNodesByPaperIds(
  conn: AsyncDuckDBConnection,
  paperIds: string[]
): Promise<Record<string, GraphPointRecord>> {
  const uniqueIds = [...new Set(paperIds.filter((paperId) => paperId.trim().length > 0))]
  if (uniqueIds.length === 0) {
    return {}
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
      clusterProbability,
      displayLabel,
      paperTitle,
      citekey,
      journal,
      year,
      semanticGroups,
      organSystems,
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
    FROM active_paper_points_web
    WHERE paperId IN (${buildPlaceholderList(uniqueIds.length)})`,
    uniqueIds
  )

  return Object.fromEntries(
    rows
      .map(mapGraphPointRow)
      .filter((point) => Boolean(point.paperId))
      .map((point) => [point.paperId as string, point])
  )
}

export async function queryUniversePointIdsByPaperIds(
  conn: AsyncDuckDBConnection,
  paperIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(paperIds.filter((paperId) => paperId.trim().length > 0))]
  if (uniqueIds.length === 0) {
    return {}
  }

  const rows = await queryRows<{ paper_id: string; node_id: string }>(
    conn,
    `SELECT
      paperId AS paper_id,
      id AS node_id
    FROM universe_points_web
    WHERE paperId IN (${buildPlaceholderList(uniqueIds.length)})`,
    uniqueIds
  )

  return Object.fromEntries(
    rows
      .filter((row) => row.paper_id && row.node_id)
      .map((row) => [row.paper_id, row.node_id])
  )
}

export async function queryOverlayPointIds(
  conn: AsyncDuckDBConnection
): Promise<string[]> {
  const rows = await queryRows<{ node_id: string }>(
    conn,
    `SELECT id AS node_id
     FROM overlay_points_web
     ORDER BY id`
  )

  return rows
    .map((row) => row.node_id)
    .filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0)
}
