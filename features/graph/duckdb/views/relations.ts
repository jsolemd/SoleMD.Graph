import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { getRegisteredBundleTableFileName } from '../bundle-files'
import { escapeSqlString } from '../queries'
import { validateTableName } from '../utils'
import { LOCAL_POINT_RUNTIME_COLUMNS } from './base-points'
import { LOCAL_CLUSTER_RUNTIME_COLUMNS } from './clusters'

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
    const safeRuntimeTableName = validateTableName(runtimeTableName)
    const selectList =
      selectedColumns && selectedColumns.length > 0
        ? selectedColumns.map((column) => validateTableName(column)).join(', ')
        : '*'
    const registeredFileName = escapeSqlString(
      getRegisteredBundleTableFileName(bundle, tableName)
    )

    await conn.query(
      `CREATE TEMP TABLE IF NOT EXISTS ${safeRuntimeTableName} AS
       SELECT ${selectList}
       FROM read_parquet('${registeredFileName}')`
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

  const localTableNames = new Set(['base_points', 'base_clusters', 'universe_points'])
  const materializedTables: BundleParquetMaterialization[] = selectedTableNames
    .filter((tableName) => localTableNames.has(tableName))
    .map((tableName) => ({
      tableName,
      runtimeTableName: tableName,
      selectedColumns:
        tableName === 'base_clusters'
          ? LOCAL_CLUSTER_RUNTIME_COLUMNS
          : LOCAL_POINT_RUNTIME_COLUMNS,
    }))

  if (materializedTables.length > 0) {
    await materializeBundleParquetTables(conn, bundle, materializedTables)
  }

  for (const tableName of selectedTableNames.filter((name) => !localTableNames.has(name))) {
    const safe = validateTableName(tableName)
    const registeredFileName = escapeSqlString(
      getRegisteredBundleTableFileName(bundle, tableName)
    )
    await conn.query(
      `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM read_parquet('${registeredFileName}')`
    )
  }
}
