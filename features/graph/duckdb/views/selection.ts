import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { buildPlaceholderList } from '../utils'

export async function initializeSelectedPointTable(conn: AsyncDuckDBConnection) {
  await conn.query(`DROP TABLE IF EXISTS selected_point_indices`)
  await conn.query(
    `CREATE TEMP TABLE selected_point_indices (
       index INTEGER PRIMARY KEY
     )`
  )
}

export async function replaceSelectedPointIndices(
  conn: AsyncDuckDBConnection,
  pointIndices: number[]
): Promise<void> {
  const uniqueIndices = [...new Set(
    pointIndices
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
  )]

  await conn.query(`DELETE FROM selected_point_indices`)

  if (uniqueIndices.length === 0) {
    return
  }

  const statement = await conn.prepare(
    `INSERT INTO selected_point_indices
     SELECT index
     FROM current_points_web
     WHERE index IN (${buildPlaceholderList(uniqueIndices.length)})`
  )

  try {
    await statement.query(...uniqueIndices)
  } finally {
    await statement.close()
  }
}

export async function replaceSelectedPointIndicesFromScopeSql(
  conn: AsyncDuckDBConnection,
  scopeSql: string | null
): Promise<void> {
  await conn.query(`DELETE FROM selected_point_indices`)

  if (typeof scopeSql !== 'string' || scopeSql.trim().length === 0) {
    return
  }

  await conn.query(
    `INSERT INTO selected_point_indices
     SELECT index
     FROM current_points_web
     WHERE ${scopeSql}`
  )
}
