import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

export async function registerActivePointViews(conn: AsyncDuckDBConnection) {
  await conn.query(
    `CREATE OR REPLACE VIEW overlay_points_web AS
     SELECT
       * REPLACE ('overlay' AS nodeRole, true AS isOverlayActive)
     FROM universe_points_web
     WHERE id IN (SELECT id FROM overlay_point_ids)
       AND id NOT IN (SELECT id FROM base_points_web)`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_points_web AS
     WITH unioned AS (
       SELECT * FROM base_points_web
       UNION ALL
       SELECT * FROM overlay_points_web
     )
     SELECT
       ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN COALESCE(nodeRole, 'primary') = 'overlay' THEN 1 ELSE 0 END,
           index,
           sourcePointIndex,
           id
       )::INTEGER - 1 AS index,
       unioned.* EXCLUDE (index)
     FROM unioned`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_paper_points_web AS
     WITH paper_points AS (
       SELECT *
       FROM active_points_web
       WHERE nodeKind = 'paper'
     )
     SELECT
       ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN COALESCE(nodeRole, 'primary') = 'overlay' THEN 1 ELSE 0 END,
           index,
           sourcePointIndex,
           id
       )::INTEGER - 1 AS index,
       paper_points.* EXCLUDE (index),
       ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN COALESCE(nodeRole, 'primary') = 'overlay' THEN 1 ELSE 0 END,
           index,
           sourcePointIndex,
           id
       )::INTEGER - 1 AS paperIndex
     FROM paper_points`
  )
}
