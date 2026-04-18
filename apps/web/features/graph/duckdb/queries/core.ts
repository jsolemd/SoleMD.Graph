import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphQueryResult } from "@solemd/graph"

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
const MAX_PREPARED_STATEMENTS_PER_CONNECTION = 64
const MAX_CACHED_STATEMENT_PLACEHOLDERS = 8
const connectionReadQueue = new WeakMap<AsyncDuckDBConnection, Promise<void>>()
const preparedStatementCache = new WeakMap<
  AsyncDuckDBConnection,
  Map<string, Promise<Awaited<ReturnType<AsyncDuckDBConnection['prepare']>>>>
>()

type PreparedStatement = Awaited<ReturnType<AsyncDuckDBConnection['prepare']>>

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

function countPlaceholders(sql: string) {
  return (sql.match(/\?/g) ?? []).length
}

function shouldCachePreparedStatement(sql: string) {
  const placeholderCount = countPlaceholders(sql)
  // High-arity IN-list statements are usually one-offs keyed by placeholder
  // count. Caching those grows statement churn instead of reducing it.
  return placeholderCount > 0 && placeholderCount <= MAX_CACHED_STATEMENT_PLACEHOLDERS
}

async function closePreparedStatement(statementPromise: Promise<PreparedStatement>) {
  try {
    const statement = await statementPromise
    await statement.close()
  } catch {
    // Ignore close failures for statements that never prepared successfully.
  }
}

function getPreparedStatementMap(conn: AsyncDuckDBConnection) {
  let cache = preparedStatementCache.get(conn)
  if (!cache) {
    cache = new Map<string, Promise<PreparedStatement>>()
    preparedStatementCache.set(conn, cache)
  }
  return cache
}

function rememberPreparedStatement(
  conn: AsyncDuckDBConnection,
  sql: string,
  statementPromise: Promise<PreparedStatement>
) {
  const cache = getPreparedStatementMap(conn)
  if (!cache.has(sql) && cache.size >= MAX_PREPARED_STATEMENTS_PER_CONNECTION) {
    const oldestSql = cache.keys().next().value
    if (typeof oldestSql === 'string') {
      const oldestStatement = cache.get(oldestSql)
      cache.delete(oldestSql)
      if (oldestStatement) {
        void closePreparedStatement(oldestStatement)
      }
    }
  }
  cache.set(sql, statementPromise)
}

async function getPreparedStatement(conn: AsyncDuckDBConnection, sql: string) {
  const cache = getPreparedStatementMap(conn)
  const cached = cache.get(sql)
  if (cached) {
    return cached
  }

  const statementPromise = conn.prepare(sql).catch((error) => {
    const currentCache = preparedStatementCache.get(conn)
    if (currentCache?.get(sql) === statementPromise) {
      currentCache.delete(sql)
    }
    throw error
  })
  rememberPreparedStatement(conn, sql, statementPromise)
  return statementPromise
}

async function withPreparedStatement<T>(
  conn: AsyncDuckDBConnection,
  sql: string,
  operation: (statement: PreparedStatement) => Promise<T>
) {
  const cacheStatement = shouldCachePreparedStatement(sql)
  const statement = await (
    cacheStatement
      ? getPreparedStatement(conn, sql)
      : conn.prepare(sql)
  )

  try {
    return await operation(statement)
  } finally {
    if (!cacheStatement) {
      await statement.close()
    }
  }
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

export async function executeStatement(
  conn: AsyncDuckDBConnection,
  sql: string,
  params: unknown[] = []
) {
  if (params.length === 0) {
    await conn.query(sql)
    return
  }

  await withPreparedStatement(conn, sql, async (statement) => {
    await statement.query(...params)
  })
}

export async function closePreparedStatements(conn: AsyncDuckDBConnection) {
  const cache = preparedStatementCache.get(conn)
  if (!cache) {
    return
  }

  preparedStatementCache.delete(conn)
  await Promise.allSettled(
    [...cache.values()].map((statementPromise) => closePreparedStatement(statementPromise))
  )
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

    return withPreparedStatement(
      conn,
      sql,
      async (statement) => mapQueryRows<T>(await statement.query(...params))
    )
  })
}
