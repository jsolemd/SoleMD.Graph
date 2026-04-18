import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from "@solemd/graph"

import { getAbsoluteUrl } from './queries'
import { requireBundleTable } from './utils'

const BUNDLE_FILE_NAMESPACE = 'graph-bundles'

export function getRegisteredBundleTableFileName(
  bundle: GraphBundle,
  tableName: string
) {
  const table = requireBundleTable(bundle, tableName)
  return `${BUNDLE_FILE_NAMESPACE}/${bundle.bundleChecksum}/${table.parquetFile}`
}

export async function registerBundleTableFiles(
  db: AsyncDuckDB,
  bundle: GraphBundle
) {
  for (const tableName of Object.keys(bundle.bundleManifest.tables)) {
    const tableUrl = bundle.tableUrls[tableName]
    if (!tableUrl) {
      throw new Error(`Graph bundle is missing table URL for "${tableName}"`)
    }

    await db.registerFileURL(
      getRegisteredBundleTableFileName(bundle, tableName),
      getAbsoluteUrl(tableUrl),
      DuckDBDataProtocol.HTTP,
      false
    )
  }
}
