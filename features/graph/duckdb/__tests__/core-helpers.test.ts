import { escapeSqlString, buildReadOnlyQuery } from '../queries/core'

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
