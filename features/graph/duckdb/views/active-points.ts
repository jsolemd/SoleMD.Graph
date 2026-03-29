import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

export async function registerActivePointViews(
  conn: AsyncDuckDBConnection,
  basePointCount: number
) {
  await conn.query(
    `CREATE OR REPLACE VIEW overlay_points_canvas_web AS
     SELECT
       projected.* REPLACE ('overlay' AS nodeRole)
     FROM universe_points_canvas_web projected
     WHERE id IN (SELECT id FROM overlay_point_ids)
       AND id NOT IN (SELECT id FROM base_points_canvas_web)
     ORDER BY sourcePointIndex, id`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW overlay_points_web AS
     SELECT
       projected.* REPLACE ('overlay' AS nodeRole)
     FROM universe_points_web projected
     WHERE id IN (SELECT id FROM overlay_point_ids)
       AND id NOT IN (SELECT id FROM base_points_web)
     ORDER BY sourcePointIndex, id`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_point_index_lookup_web AS
     SELECT
       id,
       index
     FROM base_points_canvas_web
     UNION ALL
     SELECT
       id,
       (${basePointCount} + ROW_NUMBER() OVER (ORDER BY sourcePointIndex, id) - 1)::INTEGER AS index
     FROM overlay_points_canvas_web`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_points_canvas_web AS
     SELECT * FROM base_points_canvas_web
     UNION ALL
     SELECT
       overlay_points_canvas_web.* REPLACE (
         (${basePointCount} + ROW_NUMBER() OVER (ORDER BY sourcePointIndex, id) - 1)::INTEGER AS index
       )
     FROM overlay_points_canvas_web`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_points_web AS
     SELECT * FROM base_points_web
     UNION ALL
     SELECT
       overlay_points_web.* REPLACE (
         (${basePointCount} + ROW_NUMBER() OVER (ORDER BY sourcePointIndex, id) - 1)::INTEGER AS index
       )
     FROM overlay_points_web`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_paper_points_canvas_web AS
     SELECT
       index,
       active_points_canvas_web.* EXCLUDE (index),
       index AS paperIndex
     FROM active_points_canvas_web`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_paper_points_web AS
     SELECT
       index,
       active_points_web.* EXCLUDE (index),
       index AS paperIndex
     FROM active_points_web`
  )
}
