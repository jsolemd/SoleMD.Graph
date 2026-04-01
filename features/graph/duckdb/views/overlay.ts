import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { executeStatement, queryRows } from '../queries'
import { buildPlaceholderList } from '../utils'

export async function initializeOverlayMembershipTable(conn: AsyncDuckDBConnection) {
  await conn.query(`DROP TABLE IF EXISTS overlay_point_ids_by_producer`)
  await conn.query(`DROP TABLE IF EXISTS overlay_point_ids`)
  await conn.query(
    `CREATE TEMP TABLE overlay_point_ids_by_producer (
       producer_id VARCHAR NOT NULL,
       id VARCHAR NOT NULL,
       PRIMARY KEY (producer_id, id)
     )`
  )
  await conn.query(
    `CREATE TEMP TABLE overlay_point_ids (
       id VARCHAR PRIMARY KEY
     )`
  )
}

export async function replaceOverlayProducerPointIds(
  conn: AsyncDuckDBConnection,
  args: {
    producerId: string
    pointIds: string[]
  }
): Promise<{ producerCount: number }> {
  const { producerId, pointIds } = args
  const uniqueIds = [...new Set(pointIds.filter((pointId) => pointId.trim().length > 0))]

  await executeStatement(
    conn,
    `DELETE FROM overlay_point_ids_by_producer WHERE producer_id = ?`,
    [producerId]
  )

  if (uniqueIds.length > 0) {
    await executeStatement(
      conn,
      `INSERT INTO overlay_point_ids_by_producer
       SELECT ?, id
       FROM universe_points_web
       WHERE id IN (${buildPlaceholderList(uniqueIds.length)})
         AND id NOT IN (SELECT id FROM base_points_web)`,
      [producerId, ...uniqueIds]
    )
  }

  const rows = await queryRows<{ count: number }>(
    conn,
    `SELECT count(*)::INTEGER AS count
     FROM overlay_point_ids_by_producer
     WHERE producer_id = ?`,
    [producerId]
  )

  return { producerCount: rows[0]?.count ?? 0 }
}

export async function clearOverlayProducerPointIds(
  conn: AsyncDuckDBConnection,
  producerId: string
): Promise<{ producerCount: number }> {
  await executeStatement(
    conn,
    `DELETE FROM overlay_point_ids_by_producer WHERE producer_id = ?`,
    [producerId]
  )

  return { producerCount: 0 }
}

export async function clearAllOverlayPointIds(conn: AsyncDuckDBConnection): Promise<void> {
  await conn.query(`DELETE FROM overlay_point_ids_by_producer`)
  await conn.query(`DELETE FROM overlay_point_ids`)
}

export async function materializeOverlayPointIds(
  conn: AsyncDuckDBConnection
): Promise<{ overlayCount: number }> {
  await conn.query(`DELETE FROM overlay_point_ids`)
  await conn.query(
    `INSERT INTO overlay_point_ids
     SELECT DISTINCT id
     FROM overlay_point_ids_by_producer`
  )

  const rows = await queryRows<{ count: number }>(
    conn,
    `SELECT count(*)::INTEGER AS count FROM overlay_point_ids`
  )

  return { overlayCount: rows[0]?.count ?? 0 }
}
