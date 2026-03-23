import 'client-only'

import * as duckdb from '@duckdb/duckdb-wasm'
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

let selectedBundlePromise: Promise<duckdb.DuckDBBundle> | null = null

async function getSelectedDuckDBBundle() {
  if (!selectedBundlePromise) {
    selectedBundlePromise = duckdb.selectBundle(duckdb.getJsDelivrBundles())
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
  const conn = await db.connect()

  return { conn, db, worker }
}

export async function closeConnection(
  conn: AsyncDuckDBConnection,
  db: AsyncDuckDB,
  worker: Worker
) {
  await conn.close()
  await db.terminate()
  worker.terminate()
}
