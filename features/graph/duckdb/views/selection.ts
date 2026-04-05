import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

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
  if (pointIndices.length === 0) {
    await conn.query(`DELETE FROM selected_point_indices`)
    return
  }

  // Single worker round-trip: clear + repopulate without scanning
  // current_points_web.  VALUES lists are fast for up to ~100k rows.
  const valuesList = pointIndices.map((idx) => `(${idx})`).join(',')
  await conn.query(
    `DELETE FROM selected_point_indices;
     INSERT INTO selected_point_indices VALUES ${valuesList}`
  )
}

export async function replaceSelectedPointIndicesFromScopeSql(
  conn: AsyncDuckDBConnection,
  scopeSql: string | null
): Promise<void> {
  if (typeof scopeSql !== 'string' || scopeSql.trim().length === 0) {
    await conn.query(`DELETE FROM selected_point_indices`)
    return
  }

  // Single worker round-trip: clear + repopulate in one query batch.
  await conn.query(
    `DELETE FROM selected_point_indices;
     INSERT INTO selected_point_indices
     SELECT index
     FROM current_points_web
     WHERE ${scopeSql}`
  )
}
