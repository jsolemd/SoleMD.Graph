import 'client-only'

import * as duckdb from '@duckdb/duckdb-wasm'
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { closePreparedStatements } from './queries/core'

let selectedBundlePromise: Promise<duckdb.DuckDBBundle> | null = null

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
    selectedBundlePromise = duckdb.selectBundle(LOCAL_DUCKDB_BUNDLES)
  }

  return selectedBundlePromise
}

export async function createConnection() {
  const bundle = await getSelectedDuckDBBundle()

  if (!bundle.mainWorker) {
    throw new Error(
      'DuckDB bundle selection did not resolve a mainWorker URL. ' +
        'This usually means no compatible WASM bundle was found for the current browser.'
    )
  }

  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
      type: 'text/javascript',
    })
  )
  const worker = new Worker(workerUrl)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(workerUrl)
  await db.open({
    maximumThreads: 1,
    filesystem: {
      // The graph runtime reads app-served Parquet assets repeatedly inside one
      // live session. Avoid leaning on repeated HEAD probes for file discovery.
      reliableHeadRequests: false,
    },
  })

  const conn = await db.connect()
  await conn.query("SET preserve_insertion_order = false")
  await conn.query("SET memory_limit = '1500MB'")
  await conn.query("SET threads = 1")

  return { conn, db, worker }
}

export async function closeConnection(
  conn: AsyncDuckDBConnection,
  db: AsyncDuckDB,
  worker: Worker
) {
  await closePreparedStatements(conn)
  await conn.close()
  await db.terminate()
  worker.terminate()
}
