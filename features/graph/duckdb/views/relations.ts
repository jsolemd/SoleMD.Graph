import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { escapeSqlString, getAbsoluteUrl } from '../queries'
import { validateTableName } from '../utils'

export async function resolveBundleRelations(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  tableNames: string[],
  bundleAttached = false
): Promise<boolean> {
  const selectedTableNames = [...new Set(tableNames)].filter(
    (tableName) => Boolean(bundle.bundleManifest.tables[tableName])
  )

  if (selectedTableNames.length === 0) {
    return bundleAttached
  }

  const probeTable = selectedTableNames[0]

  if (!probeTable) {
    throw new Error('Graph bundle manifest does not declare any tables')
  }

  if (bundle.duckdbUrl) {
    const absoluteDuckdbUrl = getAbsoluteUrl(bundle.duckdbUrl)
    try {
      if (!bundleAttached) {
        await conn.query(`ATTACH '${escapeSqlString(absoluteDuckdbUrl)}' AS graph_bundle`)
        await conn.query(`SELECT 1 FROM graph_bundle.${validateTableName(probeTable)} LIMIT 1`)
      }

      for (const tableName of selectedTableNames) {
        const safe = validateTableName(tableName)
        await conn.query(
          `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM graph_bundle.${safe}`
        )
      }
      return true
    } catch {
      // Fall back to direct parquet table registration below.
    }
  }

  for (const tableName of selectedTableNames) {
    const tableUrl = bundle.tableUrls[tableName]
    if (!tableUrl) {
      continue
    }
    const safe = validateTableName(tableName)
    const absoluteTableUrl = getAbsoluteUrl(tableUrl)
    await conn.query(
      `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM read_parquet('${escapeSqlString(
        absoluteTableUrl
      )}')`
    )
  }

  return bundleAttached
}
