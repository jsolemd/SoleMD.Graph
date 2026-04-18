import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphLayer, OverlayActivationRequest, OverlayActivationResult } from "@solemd/graph"
import type { OverlayProducerId } from "@solemd/graph"

import { escapeSqlString, queryRows } from './queries'
import { buildSelectedViewPredicate, getLayerTableName } from './sql-helpers'

export interface OverlayActivationWriteResult
  extends Omit<OverlayActivationResult, 'overlayCount'> {
  applied: boolean
}

export function getOverlayUniversePredicate(layer: GraphLayer, alias = 'u'): string {
  void layer
  void alias
  return 'TRUE'
}

export function buildOverlayActivationFocusPredicate(args: OverlayActivationRequest): string | null {
  if (args.scope === 'selected') {
    return buildSelectedViewPredicate()
  }

  if (args.currentPointScopeSql && args.currentPointScopeSql.trim().length > 0) {
    return args.currentPointScopeSql
  }

  return null
}

export async function activateOverlayByClusterNeighborhood(
  conn: AsyncDuckDBConnection,
  args: OverlayActivationRequest,
  producerId: OverlayProducerId
): Promise<OverlayActivationWriteResult> {
  const focusPredicate = buildOverlayActivationFocusPredicate(args)
  if (!focusPredicate) {
    return {
      applied: false,
      kind: args.kind,
      layer: args.layer,
      scope: args.scope,
      addedCount: 0,
      seedCount: 0,
      clusterCount: 0,
    }
  }

  const focusTable = getLayerTableName(args.layer)
  const maxPoints = Math.max(1, Math.floor(args.maxPoints ?? 5000))
  const maxClusters = Math.max(1, Math.floor(args.maxClusters ?? 16))
  const perClusterLimit = Math.max(1, Math.floor(args.perClusterLimit ?? 250))
  const universePredicate = getOverlayUniversePredicate(args.layer)
  const escapedProducerId = escapeSqlString(producerId)

  const candidateCteSql = `
    WITH focus AS (
      SELECT
        id,
        clusterId,
        COALESCE(paperReferenceCount, 0) AS paperReferenceCount
      FROM ${focusTable}
      WHERE (${focusPredicate})
        AND COALESCE(clusterId, 0) > 0
    ),
    focus_clusters AS (
      SELECT
        clusterId,
        count(*)::INTEGER AS seedCount,
        MAX(paperReferenceCount) AS maxSeedReferences
      FROM focus
      GROUP BY clusterId
    ),
    limited_clusters AS (
      SELECT
        clusterId,
        seedCount,
        ROW_NUMBER() OVER (
          ORDER BY
            seedCount DESC,
            maxSeedReferences DESC,
            clusterId
        )::INTEGER AS clusterRank
      FROM focus_clusters
    ),
    ranked_candidates AS (
      SELECT
        u.id,
        u.clusterId,
        lc.seedCount,
        ROW_NUMBER() OVER (
          PARTITION BY u.clusterId
          ORDER BY
            COALESCE(u.paperReferenceCount, 0) DESC,
            COALESCE(u.year, 0) DESC,
            COALESCE(u.sourcePointIndex, 0),
            u.id
        )::INTEGER AS clusterCandidateRank
      FROM universe_points_web u
      JOIN limited_clusters lc
        ON lc.clusterId = u.clusterId
      LEFT JOIN current_points_web active
        ON active.id = u.id
      WHERE lc.clusterRank <= ${maxClusters}
        AND active.id IS NULL
        AND ${universePredicate}
    ),
    limited_candidates AS (
      SELECT
        id,
        clusterId,
        seedCount,
        ROW_NUMBER() OVER (
          ORDER BY
            seedCount DESC,
            clusterId,
            clusterCandidateRank,
            id
        )::INTEGER AS globalRank
      FROM ranked_candidates
      WHERE clusterCandidateRank <= ${perClusterLimit}
    )`

  const summaryRows = await queryRows<{
    seedCount: number
    clusterCount: number
    candidateCount: number
  }>(
    conn,
    `${candidateCteSql}
     SELECT
       (SELECT count(*)::INTEGER FROM focus) AS seedCount,
       (SELECT count(*)::INTEGER FROM limited_clusters WHERE clusterRank <= ${maxClusters}) AS clusterCount,
       (SELECT count(*)::INTEGER FROM limited_candidates WHERE globalRank <= ${maxPoints}) AS candidateCount`
  )

  const summary = summaryRows[0] ?? { seedCount: 0, clusterCount: 0, candidateCount: 0 }

  await conn.query(
    `DELETE FROM overlay_point_ids_by_producer
     WHERE producer_id = '${escapedProducerId}'`
  )

  if (summary.candidateCount > 0) {
    await conn.query(
      `${candidateCteSql}
       INSERT INTO overlay_point_ids_by_producer
       SELECT
         '${escapedProducerId}' AS producer_id,
         id
       FROM limited_candidates
       WHERE globalRank <= ${maxPoints}`
    )
  }

  return {
    applied: true,
    kind: args.kind,
    layer: args.layer,
    scope: args.scope,
    addedCount: summary.candidateCount,
    seedCount: summary.seedCount,
    clusterCount: summary.clusterCount,
  }
}
