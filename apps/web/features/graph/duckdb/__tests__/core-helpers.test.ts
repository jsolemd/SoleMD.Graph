import {
  buildReadOnlyQuery,
  closePreparedStatements,
  escapeSqlString,
  executeStatement,
  queryRows,
} from '../queries/core'

function createMockArrowTable<T extends Record<string, unknown>>(rows: T[]) {
  return {
    schema: {
      fields: Object.keys(rows[0] ?? {}).map((name) => ({ name })),
    },
    toArray: () => rows.map((row) => ({ toJSON: () => row })),
  }
}

describe('escapeSqlString', () => {
  it('escapes single quotes', () => {
    expect(escapeSqlString("it's")).toBe("it''s")
  })

  it('escapes multiple single quotes', () => {
    expect(escapeSqlString("it's a 'test'")).toBe("it''s a ''test''")
  })

  it('returns the input unchanged when no quotes', () => {
    expect(escapeSqlString('hello world')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(escapeSqlString('')).toBe('')
  })
})

describe('buildReadOnlyQuery', () => {
  it('throws for empty input', () => {
    expect(() => buildReadOnlyQuery('')).toThrow('Enter a SQL query')
  })

  it('throws for whitespace-only input', () => {
    expect(() => buildReadOnlyQuery('   ')).toThrow('Enter a SQL query')
  })

  it('throws for write statements', () => {
    expect(() => buildReadOnlyQuery('INSERT INTO t VALUES (1)')).toThrow('read-only')
    expect(() => buildReadOnlyQuery('DROP TABLE t')).toThrow('read-only')
    expect(() => buildReadOnlyQuery('CREATE TABLE t (x INT)')).toThrow('read-only')
    expect(() => buildReadOnlyQuery('DELETE FROM t')).toThrow('read-only')
  })

  it('throws for multi-statement queries', () => {
    expect(() => buildReadOnlyQuery('SELECT 1; DROP TABLE t')).toThrow('one statement')
  })

  it('wraps SELECT in LIMIT subquery', () => {
    const result = buildReadOnlyQuery('SELECT * FROM t')
    expect(result.sql).toBe('SELECT * FROM (SELECT * FROM t) AS dev_query LIMIT 200')
    expect(result.appliedLimit).toBe(200)
  })

  it('wraps WITH in LIMIT subquery', () => {
    const result = buildReadOnlyQuery('WITH cte AS (SELECT 1) SELECT * FROM cte')
    expect(result.sql).toContain('LIMIT 200')
    expect(result.appliedLimit).toBe(200)
  })

  it('wraps VALUES in LIMIT subquery', () => {
    const result = buildReadOnlyQuery('VALUES (1, 2, 3)')
    expect(result.sql).toContain('LIMIT 200')
  })

  it('does not wrap DESCRIBE/SHOW/PRAGMA/EXPLAIN', () => {
    for (const stmt of ['DESCRIBE my_table', 'SHOW TABLES', 'PRAGMA version', 'EXPLAIN SELECT 1']) {
      const result = buildReadOnlyQuery(stmt)
      expect(result.appliedLimit).toBeNull()
      expect(result.sql).not.toContain('LIMIT')
    }
  })

  it('strips trailing semicolons', () => {
    const result = buildReadOnlyQuery('SELECT 1;;;')
    expect(result.sql).not.toContain(';')
  })

  it('is case-insensitive for keywords', () => {
    expect(() => buildReadOnlyQuery('select 1')).not.toThrow()
    expect(() => buildReadOnlyQuery('SELECT 1')).not.toThrow()
  })
})

describe('prepared statement caching', () => {
  it('reuses prepared statements for repeated parameterized reads', async () => {
    const statement = {
      close: jest.fn(async () => undefined),
      query: jest.fn(async (value: number) => createMockArrowTable([{ value }])),
    }
    const conn = {
      prepare: jest.fn(async () => statement),
      query: jest.fn(),
    }

    await queryRows<{ value: number }>(conn as never, 'SELECT ? AS value', [1])
    await queryRows<{ value: number }>(conn as never, 'SELECT ? AS value', [2])

    expect(conn.prepare).toHaveBeenCalledTimes(1)
    expect(statement.query).toHaveBeenNthCalledWith(1, 1)
    expect(statement.query).toHaveBeenNthCalledWith(2, 2)
    expect(statement.close).not.toHaveBeenCalled()

    await closePreparedStatements(conn as never)

    expect(statement.close).toHaveBeenCalledTimes(1)
  })

  it('does not cache high-arity parameterized reads', async () => {
    const createStatement = () => ({
      close: jest.fn(async () => undefined),
      query: jest.fn(async () => createMockArrowTable([{ value: 1 }])),
    })
    const firstStatement = createStatement()
    const secondStatement = createStatement()
    const conn = {
      prepare: jest
        .fn<Promise<typeof firstStatement>, [string]>()
        .mockResolvedValueOnce(firstStatement)
        .mockResolvedValueOnce(secondStatement),
      query: jest.fn(),
    }
    const sql = 'SELECT * FROM points WHERE index IN (?, ?, ?, ?, ?, ?, ?, ?, ?)'

    await queryRows<{ value: number }>(conn as never, sql, [1, 2, 3, 4, 5, 6, 7, 8, 9])
    await queryRows<{ value: number }>(conn as never, sql, [9, 8, 7, 6, 5, 4, 3, 2, 1])

    expect(conn.prepare).toHaveBeenCalledTimes(2)
    expect(firstStatement.close).toHaveBeenCalledTimes(1)
    expect(secondStatement.close).toHaveBeenCalledTimes(1)

    await closePreparedStatements(conn as never)
  })

  it('reuses prepared statements for repeated parameterized writes', async () => {
    const statement = {
      close: jest.fn(async () => undefined),
      query: jest.fn(async () => undefined),
    }
    const conn = {
      prepare: jest.fn(async () => statement),
      query: jest.fn(),
    }

    await executeStatement(conn as never, 'DELETE FROM selected_point_indices WHERE index = ?', [1])
    await executeStatement(conn as never, 'DELETE FROM selected_point_indices WHERE index = ?', [2])

    expect(conn.prepare).toHaveBeenCalledTimes(1)
    expect(statement.query).toHaveBeenNthCalledWith(1, 1)
    expect(statement.query).toHaveBeenNthCalledWith(2, 2)

    await closePreparedStatements(conn as never)

    expect(statement.close).toHaveBeenCalledTimes(1)
  })

  it('does not cache high-arity parameterized writes', async () => {
    const createStatement = () => ({
      close: jest.fn(async () => undefined),
      query: jest.fn(async () => undefined),
    })
    const firstStatement = createStatement()
    const secondStatement = createStatement()
    const conn = {
      prepare: jest
        .fn<Promise<typeof firstStatement>, [string]>()
        .mockResolvedValueOnce(firstStatement)
        .mockResolvedValueOnce(secondStatement),
      query: jest.fn(),
    }
    const sql = 'DELETE FROM selected_point_indices WHERE index IN (?, ?, ?, ?, ?, ?, ?, ?, ?)'

    await executeStatement(conn as never, sql, [1, 2, 3, 4, 5, 6, 7, 8, 9])
    await executeStatement(conn as never, sql, [9, 8, 7, 6, 5, 4, 3, 2, 1])

    expect(conn.prepare).toHaveBeenCalledTimes(2)
    expect(firstStatement.close).toHaveBeenCalledTimes(1)
    expect(secondStatement.close).toHaveBeenCalledTimes(1)

    await closePreparedStatements(conn as never)
  })
})
