import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | undefined

/**
 * Lazily-initialized database connection.
 *
 * Uses a Proxy so the error for a missing DATABASE_URL only fires when the
 * database is actually used, not on module import. This prevents import-time
 * crashes in contexts that load server modules but don't need the database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_, prop, receiver) {
    if (!_db) {
      const url = process.env.DATABASE_URL
      if (!url) {
        throw new Error('DATABASE_URL environment variable is required')
      }
      _db = drizzle(postgres(url, { max: 10, idle_timeout: 20 }), { schema })
    }
    return Reflect.get(_db, prop, receiver)
  },
})
