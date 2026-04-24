import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'

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

    const manifest = bundle.bundleManifest.tables[tableName]
    const bytes = await fetchAndVerifyParquet(
      getAbsoluteUrl(tableUrl),
      manifest.sha256,
      tableName
    )

    await db.registerFileBuffer(
      getRegisteredBundleTableFileName(bundle, tableName),
      bytes
    )
  }
}

// Fetch a bundle parquet and verify its contents match the manifest's
// per-file sha256 before registering it with DuckDB. This pulls the full
// file into memory up front (swapping DuckDB's lazy range fetches for a
// single eager fetch) so the bytes can be hashed — the correctness win
// for catching bundle-serving/MITM drift outweighs the extra RAM for
// typical graph bundles. A mismatch throws with a clear republish signal.
async function fetchAndVerifyParquet(
  url: string,
  expectedSha256: string,
  tableName: string
): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Graph bundle parquet fetch failed for "${tableName}" (${response.status} ${response.statusText})`
    )
  }
  const buffer = await response.arrayBuffer()
  const actualSha256 = await sha256Hex(buffer)
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Graph bundle integrity check failed for "${tableName}": expected sha256 ${expectedSha256}, got ${actualSha256}. Republish the bundle.`
    )
  }
  return new Uint8Array(buffer)
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const view = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i].toString(16).padStart(2, '0')
  }
  return hex
}
