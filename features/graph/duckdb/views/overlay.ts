import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { queryRows } from '../queries'
import { buildPlaceholderList } from '../utils'

export async function initializeOverlayMembershipTable(conn: AsyncDuckDBConnection) {
  await conn.query(`DROP TABLE IF EXISTS overlay_point_ids`)
  await conn.query(
    `CREATE TEMP TABLE overlay_point_ids (
       id VARCHAR PRIMARY KEY
     )`
  )
}

export async function replaceOverlayPointIds(
  conn: AsyncDuckDBConnection,
  pointIds: string[]
): Promise<{ overlayCount: number }> {
  const uniqueIds = [...new Set(pointIds.filter((pointId) => pointId.trim().length > 0))]

  await conn.query(`DELETE FROM overlay_point_ids`)
  if (uniqueIds.length > 0) {
    const statement = await conn.prepare(
      `INSERT INTO overlay_point_ids
       SELECT id
       FROM universe_points_web
       WHERE id IN (${buildPlaceholderList(uniqueIds.length)})
         AND id NOT IN (SELECT id FROM base_points_web)`
    )
    try {
      await statement.query(...uniqueIds)
    } finally {
      await statement.close()
    }
  }

  const rows = await queryRows<{ count: number }>(
    conn,
    `SELECT count(*)::INTEGER AS count FROM overlay_points_web`
  )

  return { overlayCount: rows[0]?.count ?? 0 }
}

export async function clearOverlayPointIds(conn: AsyncDuckDBConnection): Promise<void> {
  await conn.query(`DELETE FROM overlay_point_ids`)
}
