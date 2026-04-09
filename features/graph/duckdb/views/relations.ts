import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { escapeSqlString, getAbsoluteUrl } from '../queries'
import { validateTableName } from '../utils'
import { LOCAL_POINT_RUNTIME_COLUMNS } from './base-points'

interface BundleParquetMaterialization {
  tableName: string
  runtimeTableName: string
  selectedColumns?: readonly string[]
}

export async function materializeBundleParquetTables(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  tables: readonly BundleParquetMaterialization[]
): Promise<void> {
  for (const { tableName, runtimeTableName, selectedColumns } of tables) {
    const tableUrl = bundle.tableUrls[tableName]
    if (!tableUrl) {
      throw new Error(`Graph bundle is missing table URL for "${tableName}"`)
    }

    const safeRuntimeTableName = validateTableName(runtimeTableName)
    const absoluteTableUrl = getAbsoluteUrl(tableUrl)
    const selectList =
      selectedColumns && selectedColumns.length > 0
        ? selectedColumns.map((column) => validateTableName(column)).join(', ')
        : '*'

    await conn.query(
      `CREATE TEMP TABLE IF NOT EXISTS ${safeRuntimeTableName} AS
       SELECT ${selectList}
       FROM read_parquet('${escapeSqlString(absoluteTableUrl)}')`
    )
  }
}

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

  const localTableNames = new Set(['universe_points'])
  const materializedTables: BundleParquetMaterialization[] = selectedTableNames
    .filter((tableName) => localTableNames.has(tableName))
    .map((tableName) => ({
      tableName,
      runtimeTableName: tableName,
      selectedColumns:
        tableName === 'universe_points' ? LOCAL_POINT_RUNTIME_COLUMNS : undefined,
    }))

  if (materializedTables.length > 0) {
    await materializeBundleParquetTables(conn, bundle, materializedTables)
  }

  for (const tableName of selectedTableNames.filter((name) => !localTableNames.has(name))) {
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
