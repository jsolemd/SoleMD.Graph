import 'client-only'

import type * as duckdb from '@duckdb/duckdb-wasm'
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { closePreparedStatements } from './queries/core'
import {
  canUsePersistentGraphDatabase,
  getPersistentGraphDatabasePath,
} from './persistent-cache'

// `@duckdb/duckdb-wasm`'s browser entry references `Worker` at top of module.
// Next's Turbopack alias resolves the package to that browser entry in both
// server and client bundles, so a static `import` crashes during SSR HTML
// generation (SSR walks client-component import trees to produce initial
// markup, regardless of `'use client'` or `'client-only'`). Defer the runtime
// load until a connection is actually requested — which only happens in the
// browser.
let duckdbModulePromise: Promise<typeof import('@duckdb/duckdb-wasm')> | null =
  null
function loadDuckdbModule() {
  duckdbModulePromise ??= import('@duckdb/duckdb-wasm')
  return duckdbModulePromise
}

let selectedBundlePromise: Promise<duckdb.DuckDBBundle> | null = null
const DUCKDB_MEMORY_LIMIT = '1500MB'

const LOCAL_DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
  eh: {
    mainModule: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
      import.meta.url
    ).toString(),
    mainWorker: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
      import.meta.url
    ).toString(),
  },
  mvp: {
    mainModule: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
      import.meta.url
    ).toString(),
    mainWorker: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
      import.meta.url
    ).toString(),
  },
}

async function getSelectedDuckDBBundle() {
  if (!selectedBundlePromise) {
    // Keep DuckDB-Wasm on the app origin to avoid a CDN round-trip on every
    // cold start. The COI pthread bundle stays excluded because it is still
    // non-functional at runtime for our graph shell.
    const dd = await loadDuckdbModule()
    selectedBundlePromise = dd.selectBundle(LOCAL_DUCKDB_BUNDLES)
  }

  return selectedBundlePromise
}

function resolveBrowserAssetUrl(assetUrl: string): string
function resolveBrowserAssetUrl(assetUrl: string | null | undefined): string | null
function resolveBrowserAssetUrl(assetUrl: string | null | undefined) {
  if (!assetUrl) {
    return assetUrl ?? null
  }

  if (/^https?:\/\//.test(assetUrl) || assetUrl.startsWith('blob:')) {
    return assetUrl
  }

  return new URL(assetUrl, window.location.origin).toString()
}

async function openDuckDb(
  db: duckdb.AsyncDuckDB,
  persistentPath: string | null
) {
  const dd = await loadDuckdbModule()
  const baseConfig: duckdb.DuckDBConfig = {
    accessMode: dd.DuckDBAccessMode.READ_WRITE,
    maximumThreads: 1,
    filesystem: {
      // The graph runtime reads app-served Parquet assets repeatedly inside
      // one live session. Avoid leaning on repeated HEAD probes for file
      // discovery.
      reliableHeadRequests: false,
    },
  }

  if (!persistentPath) {
    await db.open(baseConfig)
    return
  }

  try {
    await db.open({
      ...baseConfig,
      opfs: {
        fileHandling: 'auto',
      },
      path: persistentPath,
    })
  } catch {
    await db.open(baseConfig)
  }
}

export async function createConnection() {
  const dd = await loadDuckdbModule()
  const bundle = await getSelectedDuckDBBundle()

  if (!bundle.mainWorker) {
    throw new Error(
      'DuckDB bundle selection did not resolve a mainWorker URL. ' +
        'This usually means no compatible WASM bundle was found for the current browser.'
    )
  }

  const mainWorkerUrl = resolveBrowserAssetUrl(bundle.mainWorker)
  const mainModuleUrl = resolveBrowserAssetUrl(bundle.mainModule)
  const pthreadWorkerUrl = resolveBrowserAssetUrl(bundle.pthreadWorker)

  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${mainWorkerUrl}");`], {
      type: 'text/javascript',
    })
  )
  const worker = new Worker(workerUrl)
  const db = new dd.AsyncDuckDB(new dd.VoidLogger(), worker)
  const persistentPath = canUsePersistentGraphDatabase()
    ? getPersistentGraphDatabasePath()
    : null
  try {
    try {
      await db.instantiate(mainModuleUrl, pthreadWorkerUrl)
    } finally {
      URL.revokeObjectURL(workerUrl)
    }

    await openDuckDb(db, persistentPath)

    const conn = await db.connect()
    await conn.query('PRAGMA enable_object_cache')
    await conn.query("SET preserve_insertion_order = false")
    // Keep memory below the observed Wasm ceiling. When the browser exposes
    // OPFS, the graph runtime now intentionally opens one persistent local DB
    // file so the hot graph tables can survive full page reloads.
    await conn.query(`SET memory_limit = '${DUCKDB_MEMORY_LIMIT}'`)
    await conn.query("SET threads = 1")

    return { conn, db, worker }
  } catch (error) {
    try {
      await db.terminate()
    } catch {
      // Best-effort cleanup; surface the original bootstrap error below.
    }
    worker.terminate()
    throw error
  }
}

export async function closeConnection(
  conn: AsyncDuckDBConnection,
  db: AsyncDuckDB,
  worker: Worker
) {
  let firstError: unknown = null

  try {
    await closePreparedStatements(conn)
  } catch (error) {
    firstError ??= error
  }
  try {
    await db.flushFiles()
  } catch (error) {
    firstError ??= error
  }
  try {
    await conn.close()
  } catch (error) {
    firstError ??= error
  }
  try {
    await db.terminate()
  } catch (error) {
    firstError ??= error
  }
  worker.terminate()

  if (firstError) {
    throw firstError
  }
}
