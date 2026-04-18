import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { executeStatement, queryRows } from './queries'

const GRAPH_RUNTIME_CACHE_SCHEMA_VERSION = 1
const GRAPH_RUNTIME_CACHE_SLOT = 'hot_bundle'
const GRAPH_RUNTIME_CACHE_META_TABLE = '__graph_runtime_cache_meta'
const HOT_BUNDLE_TABLES = ['base_points', 'base_clusters'] as const

interface GraphRuntimeCacheMetaRow {
  bundle_checksum: string
  bundle_version: string
  cache_schema_version: number
}

interface GraphRuntimeTablePresenceRow {
  table_name: string
}

function normalizeBundleVersion(bundle: GraphBundle) {
  return bundle.bundleManifest.bundleVersion ?? bundle.bundleVersion
}

export function getPersistentGraphDatabasePath() {
  return 'opfs://solemd-graph-runtime.duckdb'
}

export function canUsePersistentGraphDatabase() {
  return (
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    typeof window.navigator.storage?.getDirectory === 'function'
  )
}

export async function prepareHotBundleCache(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle
): Promise<{ reused: boolean }> {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS ${GRAPH_RUNTIME_CACHE_META_TABLE} (
       cache_slot VARCHAR PRIMARY KEY,
       bundle_checksum VARCHAR NOT NULL,
       bundle_version VARCHAR NOT NULL,
       cache_schema_version INTEGER NOT NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT now()
     )`
  )

  const [metaRow] = await queryRows<GraphRuntimeCacheMetaRow>(
    conn,
    `SELECT bundle_checksum, bundle_version, cache_schema_version
     FROM ${GRAPH_RUNTIME_CACHE_META_TABLE}
     WHERE cache_slot = ?`,
    [GRAPH_RUNTIME_CACHE_SLOT]
  )

  const presentTableRows = await queryRows<GraphRuntimeTablePresenceRow>(
    conn,
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = current_schema()
       AND table_name IN (${HOT_BUNDLE_TABLES.map(() => '?').join(', ')})`,
    [...HOT_BUNDLE_TABLES]
  )
  const presentTables = new Set(presentTableRows.map((row) => row.table_name))
  const cacheMatches =
    metaRow?.bundle_checksum === bundle.bundleChecksum &&
    metaRow?.bundle_version === normalizeBundleVersion(bundle) &&
    Number(metaRow?.cache_schema_version) === GRAPH_RUNTIME_CACHE_SCHEMA_VERSION &&
    HOT_BUNDLE_TABLES.every((tableName) => presentTables.has(tableName))

  if (cacheMatches) {
    await conn.query(
      `UPDATE ${GRAPH_RUNTIME_CACHE_META_TABLE}
       SET updated_at = now()
       WHERE cache_slot = '${GRAPH_RUNTIME_CACHE_SLOT}'`
    )
    return { reused: true }
  }

  for (const tableName of HOT_BUNDLE_TABLES) {
    await conn.query(`DROP TABLE IF EXISTS ${tableName}`)
    await conn.query(`DROP VIEW IF EXISTS ${tableName}`)
  }
  await conn.query(
    `DELETE FROM ${GRAPH_RUNTIME_CACHE_META_TABLE}
     WHERE cache_slot = '${GRAPH_RUNTIME_CACHE_SLOT}'`
  )

  return { reused: false }
}

export async function markHotBundleCacheReady(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle
) {
  await executeStatement(
    conn,
    `INSERT OR REPLACE INTO ${GRAPH_RUNTIME_CACHE_META_TABLE} (
       cache_slot,
       bundle_checksum,
       bundle_version,
       cache_schema_version,
       updated_at
     )
     VALUES (?, ?, ?, ?, now())`,
    [
      GRAPH_RUNTIME_CACHE_SLOT,
      bundle.bundleChecksum,
      normalizeBundleVersion(bundle),
      GRAPH_RUNTIME_CACHE_SCHEMA_VERSION,
    ]
  )
}
