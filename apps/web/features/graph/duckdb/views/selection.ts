import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { executeStatement } from '../queries'

export const SELECTED_POINT_INSERT_CHUNK_SIZE = 512

function buildInsertValuesPlaceholderList(count: number) {
  return Array.from({ length: count }, () => '(?)').join(', ')
}

async function withSelectionTableTransaction<T>(
  conn: AsyncDuckDBConnection,
  operation: () => Promise<T>
): Promise<T> {
  await conn.query(`BEGIN TRANSACTION`)
  try {
    const result = await operation()
    await conn.query(`COMMIT`)
    return result
  } catch (error) {
    try {
      await conn.query(`ROLLBACK`)
    } catch {
      // Ignore rollback failures and surface the original write error.
    }
    throw error
  }
}

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

  // Keep the direct VALUES insert strategy, but cap each prepared statement
  // so large selections do not allocate one monolithic SQL string.
  await withSelectionTableTransaction(conn, async () => {
    await conn.query(`DELETE FROM selected_point_indices`)
    for (
      let index = 0;
      index < pointIndices.length;
      index += SELECTED_POINT_INSERT_CHUNK_SIZE
    ) {
      const chunk = pointIndices.slice(
        index,
        index + SELECTED_POINT_INSERT_CHUNK_SIZE
      )
      await executeStatement(
        conn,
        `INSERT INTO selected_point_indices VALUES ${buildInsertValuesPlaceholderList(
          chunk.length
        )}`,
        chunk
      )
    }
  })
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
