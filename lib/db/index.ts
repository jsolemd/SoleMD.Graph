import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

type Db = ReturnType<typeof drizzle<typeof schema>>
type SqlClient = ReturnType<typeof postgres>

declare global {
  // Preserve the frontend DB client across Next dev module reloads so we do
  // not accumulate fresh postgres-js pools on every recompilation.
  var __solemdGraphDb__: Db | undefined
  var __solemdGraphSql__: SqlClient | undefined
}

function getDb(): Db {
  if (!globalThis.__solemdGraphDb__) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_URL environment variable is required')
    }

    const sql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })

    globalThis.__solemdGraphSql__ = sql
    globalThis.__solemdGraphDb__ = drizzle(sql, { schema })
  }

  return globalThis.__solemdGraphDb__
}

/**
 * Lazily-initialized database connection.
 *
 * Uses a Proxy so the error for a missing DATABASE_URL only fires when the
 * database is actually used, not on module import. This prevents import-time
 * crashes in contexts that load server modules but don't need the database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
