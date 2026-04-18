import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphPointRecord } from "@solemd/graph"

import { buildPlaceholderList } from '../utils'

import { queryRows } from './core'
import {
  mapGraphPointRow,
  type GraphPointSelectionRow,
} from './node-selection'

// In the browser runtime, `paperId` is the graph paper ref emitted by the
// bundle contract. It may be a raw paper id or a `corpus:<id>` fallback.
export async function queryPaperNodesByGraphPaperRefs(
  conn: AsyncDuckDBConnection,
  graphPaperRefs: string[]
): Promise<Record<string, GraphPointRecord>> {
  const uniqueRefs = [...new Set(graphPaperRefs.filter((paperRef) => paperRef.trim().length > 0))]
  if (uniqueRefs.length === 0) {
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
    FROM current_paper_points_web
    WHERE paperId IN (${buildPlaceholderList(uniqueRefs.length)})`,
    uniqueRefs
  )

  return Object.fromEntries(
    rows
      .map(mapGraphPointRow)
      .filter((point) => Boolean(point.paperId))
      .map((point) => [point.paperId as string, point])
  )
}

export async function queryUniversePointIdsByGraphPaperRefs(
  conn: AsyncDuckDBConnection,
  graphPaperRefs: string[]
): Promise<Record<string, string>> {
  const uniqueRefs = [...new Set(graphPaperRefs.filter((paperRef) => paperRef.trim().length > 0))]
  if (uniqueRefs.length === 0) {
    return {}
  }

  const rows = await queryRows<{ paper_id: string; node_id: string }>(
    conn,
    `SELECT
      paperId AS paper_id,
      id AS node_id
    FROM universe_points_web
    WHERE paperId IN (${buildPlaceholderList(uniqueRefs.length)})`,
    uniqueRefs
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
