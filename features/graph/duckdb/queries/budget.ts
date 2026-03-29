import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphVisibilityBudget, MapLayer } from '@/features/graph/types'

import { getLayerTableName } from '../sql-helpers'

import { queryRows } from './core'

export async function queryVisibilityBudget(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    selector: { id?: string; index?: number }
    scopeSql?: string | null
  }
): Promise<GraphVisibilityBudget | null> {
  const { layer, selector, scopeSql } = args
  const { id, index } = selector
  if (id == null && index == null) {
    return null
  }

  const tableName = getLayerTableName(layer)
  const whereClause = id != null ? 'id = ?' : 'index = ?'
  const normalizedScopeSql =
    typeof scopeSql === 'string' && scopeSql.trim().length > 0
      ? scopeSql.trim()
      : null

  const rows = await queryRows<{
    seed_index: number
    cluster_id: number | null
    include_cluster: boolean
    x_min: number | null
    x_max: number | null
    y_min: number | null
    y_max: number | null
  }>(
    conn,
    `WITH seed AS (
       SELECT
         index AS seed_index,
         x AS seed_x,
         y AS seed_y,
         CASE
           WHEN COALESCE(clusterId, 0) > 0 THEN clusterId
           ELSE NULL
         END AS cluster_id
       FROM ${tableName}
       WHERE ${whereClause}
       LIMIT 1
     ),
     scoped AS (
       SELECT *
       FROM ${tableName}
       ${normalizedScopeSql == null ? '' : `WHERE ${normalizedScopeSql}`}
     ),
     scope_extents AS (
       SELECT
         max(x) - min(x) AS scope_width,
         max(y) - min(y) AS scope_height
       FROM scoped
     ),
     cluster_scope AS (
       SELECT
         count(*)::INTEGER AS cluster_count,
         max(x) - min(x) AS cluster_width,
         max(y) - min(y) AS cluster_height
       FROM scoped, seed
       WHERE seed.cluster_id IS NOT NULL
         AND scoped.clusterId = seed.cluster_id
     )
     SELECT
       seed.seed_index,
       CASE
         WHEN seed.cluster_id IS NOT NULL
           AND COALESCE(cluster_scope.cluster_count, 0) > 0 THEN seed.cluster_id
         ELSE NULL
       END AS cluster_id
       ,
       CASE
         WHEN seed.cluster_id IS NOT NULL
           AND COALESCE(cluster_scope.cluster_count, 0) BETWEEN 1 AND 4000 THEN TRUE
         ELSE FALSE
       END AS include_cluster,
       CASE
         WHEN seed.seed_x IS NULL THEN NULL
         ELSE seed.seed_x - LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_width
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_width * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_width * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_width * 0.08, 0.02), 0.02)
         )
       END AS x_min,
       CASE
         WHEN seed.seed_x IS NULL THEN NULL
         ELSE seed.seed_x + LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_width
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_width * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_width * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_width * 0.08, 0.02), 0.02)
         )
       END AS x_max,
       CASE
         WHEN seed.seed_y IS NULL THEN NULL
         ELSE seed.seed_y - LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_height
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_height * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_height * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_height * 0.08, 0.02), 0.02)
         )
       END AS y_min,
       CASE
         WHEN seed.seed_y IS NULL THEN NULL
         ELSE seed.seed_y + LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_height
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_height * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_height * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_height * 0.08, 0.02), 0.02)
         )
       END AS y_max
     FROM seed
     LEFT JOIN scope_extents ON TRUE
     LEFT JOIN cluster_scope ON TRUE`,
    [id ?? index ?? null]
  )

  const row = rows[0]
  if (!row) {
    return null
  }

  return {
    seedIndex: row.seed_index,
    clusterId: row.cluster_id,
    includeCluster: row.include_cluster,
    xMin: row.x_min,
    xMax: row.x_max,
    yMin: row.y_min,
    yMax: row.y_max,
  }
}

export async function queryPointIndicesForScope(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scopeSql: string
  }
): Promise<number[]> {
  const normalizedScopeSql = args.scopeSql.trim()
  if (normalizedScopeSql.length === 0) {
    return []
  }

  const tableName = getLayerTableName(args.layer)
  const rows = await queryRows<{ index: number }>(
    conn,
    `SELECT index
     FROM ${tableName}
     WHERE ${normalizedScopeSql}
     ORDER BY index`
  )

  return rows
    .map((row) => row.index)
    .filter((index): index is number => Number.isFinite(index))
}
