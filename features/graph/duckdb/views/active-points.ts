import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { queryRows } from '../queries'

const OVERLAY_POINTS_CANVAS_RUNTIME_TABLE = 'overlay_points_canvas_runtime'
const OVERLAY_POINTS_QUERY_RUNTIME_TABLE = 'overlay_points_query_runtime'
const ACTIVE_POINT_INDEX_LOOKUP_RUNTIME_TABLE = 'active_point_index_lookup_runtime'

async function replaceRuntimeTable(
  conn: AsyncDuckDBConnection,
  tableName: string,
  selectSql: string
) {
  await conn.query(`CREATE OR REPLACE TEMP TABLE ${tableName} AS ${selectSql}`)
}

export async function refreshActivePointRuntimeTables(
  conn: AsyncDuckDBConnection,
  basePointCount: number
): Promise<{ overlayCount: number }> {
  await replaceRuntimeTable(
    conn,
    OVERLAY_POINTS_CANVAS_RUNTIME_TABLE,
    `SELECT
       projected.* REPLACE ('overlay' AS nodeRole)
     FROM universe_points_canvas_web projected
     WHERE id IN (SELECT id FROM overlay_point_ids)
       AND id NOT IN (SELECT id FROM base_points_canvas_web)
     ORDER BY sourcePointIndex, id`
  )

  await replaceRuntimeTable(
    conn,
    OVERLAY_POINTS_QUERY_RUNTIME_TABLE,
    `SELECT
       projected.* REPLACE ('overlay' AS nodeRole)
     FROM universe_points_web projected
     WHERE id IN (SELECT id FROM overlay_point_ids)
       AND id NOT IN (SELECT id FROM base_points_web)
     ORDER BY sourcePointIndex, id`
  )

  await replaceRuntimeTable(
    conn,
    ACTIVE_POINT_INDEX_LOOKUP_RUNTIME_TABLE,
    `SELECT
       id,
       index
     FROM base_points_canvas_web
     UNION ALL
     SELECT
       id,
       (${basePointCount} + ROW_NUMBER() OVER (ORDER BY sourcePointIndex, id) - 1)::INTEGER AS index
     FROM ${OVERLAY_POINTS_CANVAS_RUNTIME_TABLE}`
  )

  const rows = await queryRows<{ count: number }>(
    conn,
    `SELECT count(*)::INTEGER AS count
     FROM ${OVERLAY_POINTS_QUERY_RUNTIME_TABLE}`
  )

  return { overlayCount: rows[0]?.count ?? 0 }
}

export async function registerActivePointViews(
  conn: AsyncDuckDBConnection,
  basePointCount: number
) {
  await refreshActivePointRuntimeTables(conn, basePointCount)

  await conn.query(
    `CREATE OR REPLACE VIEW overlay_points_canvas_web AS
     SELECT * FROM ${OVERLAY_POINTS_CANVAS_RUNTIME_TABLE}`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW overlay_points_web AS
     SELECT * FROM ${OVERLAY_POINTS_QUERY_RUNTIME_TABLE}`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_point_index_lookup_web AS
     SELECT * FROM ${ACTIVE_POINT_INDEX_LOOKUP_RUNTIME_TABLE}`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_points_canvas_web AS
     SELECT * FROM base_points_canvas_web
     UNION ALL
     SELECT
       overlay_points_canvas_web.* REPLACE (overlay_lookup.index AS index)
     FROM overlay_points_canvas_web
     JOIN active_point_index_lookup_web overlay_lookup
       ON overlay_lookup.id = overlay_points_canvas_web.id`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_points_web AS
     SELECT * FROM base_points_web
     UNION ALL
     SELECT
       overlay_points_web.* REPLACE (overlay_lookup.index AS index)
     FROM overlay_points_web
     JOIN active_point_index_lookup_web overlay_lookup
       ON overlay_lookup.id = overlay_points_web.id`
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
