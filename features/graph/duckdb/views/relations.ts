import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { escapeSqlString, getAbsoluteUrl } from '../queries'
import { validateTableName } from '../utils'

export async function resolveBundleRelations(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  tableNames: string[]
): Promise<void> {
  const selectedTableNames = [...new Set(tableNames)].filter(
    (tableName) => Boolean(bundle.bundleManifest.tables[tableName])
  )

  if (selectedTableNames.length === 0) {
    return
  }

  for (const tableName of selectedTableNames) {
    const tableUrl = bundle.tableUrls[tableName]
    if (!tableUrl) {
      throw new Error(`Graph bundle is missing table URL for "${tableName}"`)
    }
    const safe = validateTableName(tableName)
    const absoluteTableUrl = getAbsoluteUrl(tableUrl)
    await conn.query(
      `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM read_parquet('${escapeSqlString(
        absoluteTableUrl
      )}')`
    )
  }
}
