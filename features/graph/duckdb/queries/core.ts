import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphQueryResult } from '@/features/graph/types'

const READ_ONLY_QUERY_PREFIXES = new Set([
  'describe',
  'explain',
  'pragma',
  'select',
  'show',
  'values',
  'with',
])
const MAX_READ_ONLY_QUERY_ROWS = 200
const connectionReadQueue = new WeakMap<AsyncDuckDBConnection, Promise<void>>()

export function getAbsoluteUrl(relativeOrAbsoluteUrl: string) {
  if (/^https?:\/\//.test(relativeOrAbsoluteUrl)) {
    return relativeOrAbsoluteUrl
  }

  return new URL(relativeOrAbsoluteUrl, window.location.origin).toString()
}

export function escapeSqlString(value: string) {
  return value.replaceAll("'", "''")
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeValue(entry),
      ])
    )
  }

  return value
}

function mapQueryRows<T>(table: { toArray(): Array<T & { toJSON?: () => unknown }> }) {
  return table
    .toArray()
    .map((row) =>
      normalizeValue(typeof row.toJSON === 'function' ? row.toJSON() : row)
    ) as T[]
}

function getQueryColumns(table: unknown, rows: Array<Record<string, unknown>>) {
  const schemaFields = (
    table as { schema?: { fields?: Array<{ name: string }> } }
  ).schema?.fields

  if (schemaFields && schemaFields.length > 0) {
    return schemaFields.map((field) => field.name)
  }

  return rows[0] ? Object.keys(rows[0]) : []
}

function normalizeReadOnlySql(sql: string) {
  return sql.trim().replace(/;+$/g, '').trim()
}

async function enqueueConnectionRead<T>(
  conn: AsyncDuckDBConnection,
  task: () => Promise<T>
): Promise<T> {
  const previous = connectionReadQueue.get(conn) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })

  connectionReadQueue.set(
    conn,
    previous
      .catch(() => undefined)
      .then(() => current)
  )

  await previous.catch(() => undefined)

  try {
    return await task()
  } finally {
    release()
    if (connectionReadQueue.get(conn) === current) {
      connectionReadQueue.delete(conn)
    }
  }
}

export function buildReadOnlyQuery(sql: string) {
  const normalized = normalizeReadOnlySql(sql)

  if (!normalized) {
    throw new Error('Enter a SQL query to run against the local graph bundle.')
  }

  if (normalized.includes(';')) {
    throw new Error('Run one statement at a time in the DuckDB query panel.')
  }

  const firstKeywordMatch = normalized.match(/^[a-z]+/i)
  const firstKeyword = firstKeywordMatch?.[0]?.toLowerCase()

  if (!firstKeyword || !READ_ONLY_QUERY_PREFIXES.has(firstKeyword)) {
    throw new Error(
      'Only read-only SELECT/SHOW/DESCRIBE/PRAGMA/EXPLAIN statements are allowed here.'
    )
  }

  if (firstKeyword === 'select' || firstKeyword === 'with' || firstKeyword === 'values') {
    return {
      appliedLimit: MAX_READ_ONLY_QUERY_ROWS,
      sql: `SELECT * FROM (${normalized}) AS dev_query LIMIT ${MAX_READ_ONLY_QUERY_ROWS}`,
    }
  }

  return {
    appliedLimit: null,
    sql: normalized,
  }
}

export async function executeReadOnlyQuery(
  conn: AsyncDuckDBConnection,
  sql: string
): Promise<GraphQueryResult> {
  return enqueueConnectionRead(conn, async () => {
    const query = buildReadOnlyQuery(sql)
    const startedAt = performance.now()
    const resultTable = await conn.query(query.sql)
    const rows = mapQueryRows<Record<string, unknown>>(resultTable)

    return {
      appliedLimit: query.appliedLimit,
      columns: getQueryColumns(resultTable, rows),
      durationMs: Number((performance.now() - startedAt).toFixed(1)),
      executedSql: query.sql,
      rowCount: rows.length,
      rows,
    }
  })
}

export async function queryRows<T>(
  conn: AsyncDuckDBConnection,
  sql: string,
  params: unknown[] = []
) {
  return enqueueConnectionRead(conn, async () => {
    if (params.length === 0) {
      return mapQueryRows<T>(await conn.query(sql))
    }

    const statement = await conn.prepare(sql)

    try {
      return mapQueryRows<T>(await statement.query(...params))
    } finally {
      await statement.close()
    }
  })
}
