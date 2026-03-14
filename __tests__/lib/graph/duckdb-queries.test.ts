import { buildReadOnlyQuery } from '@/lib/graph/duckdb/queries'

describe('buildReadOnlyQuery', () => {
  describe('accepts read-only statements', () => {
    it.each([
      ['SELECT', 'SELECT 1'],
      ['select', 'select * from t'],
      ['SHOW', 'SHOW TABLES'],
      ['show', 'show tables'],
      ['DESCRIBE', 'DESCRIBE my_table'],
      ['describe', 'describe my_table'],
      ['PRAGMA', 'PRAGMA version'],
      ['pragma', 'pragma table_info'],
      ['EXPLAIN', 'EXPLAIN SELECT 1'],
      ['explain', 'explain select 1'],
      ['WITH', 'WITH cte AS (SELECT 1) SELECT * FROM cte'],
      ['with', 'with cte as (select 1) select * from cte'],
      ['VALUES', 'VALUES (1, 2, 3)'],
      ['values', 'values (1, 2)'],
    ])('accepts %s: %s', (_keyword, sql) => {
      expect(() => buildReadOnlyQuery(sql)).not.toThrow()
    })
  })

  describe('rejects write statements', () => {
    it.each([
      ['INSERT', 'INSERT INTO t VALUES (1)'],
      ['UPDATE', 'UPDATE t SET x = 1'],
      ['DELETE', 'DELETE FROM t'],
      ['DROP', 'DROP TABLE t'],
      ['CREATE', 'CREATE TABLE t (x INT)'],
      ['ALTER', 'ALTER TABLE t ADD COLUMN y INT'],
    ])('rejects %s: %s', (_keyword, sql) => {
      expect(() => buildReadOnlyQuery(sql)).toThrow(
        'Only read-only SELECT/SHOW/DESCRIBE/PRAGMA/EXPLAIN statements are allowed here.'
      )
    })
  })

  describe('rejects multi-statement queries', () => {
    it('rejects embedded semicolons', () => {
      expect(() => buildReadOnlyQuery('SELECT 1; DROP TABLE t')).toThrow(
        'Run one statement at a time in the DuckDB query panel.'
      )
    })
  })

  describe('wraps SELECT/WITH/VALUES in LIMIT subquery', () => {
    it('wraps SELECT in LIMIT subquery', () => {
      const result = buildReadOnlyQuery('SELECT * FROM t')
      expect(result.sql).toBe(
        'SELECT * FROM (SELECT * FROM t) AS dev_query LIMIT 200'
      )
      expect(result.appliedLimit).toBe(200)
    })

    it('wraps WITH in LIMIT subquery', () => {
      const result = buildReadOnlyQuery(
        'WITH cte AS (SELECT 1) SELECT * FROM cte'
      )
      expect(result.sql).toContain('AS dev_query LIMIT 200')
      expect(result.appliedLimit).toBe(200)
    })

    it('wraps VALUES in LIMIT subquery', () => {
      const result = buildReadOnlyQuery('VALUES (1, 2)')
      expect(result.sql).toContain('AS dev_query LIMIT 200')
      expect(result.appliedLimit).toBe(200)
    })

    it('does not wrap SHOW/DESCRIBE/PRAGMA/EXPLAIN', () => {
      const result = buildReadOnlyQuery('SHOW TABLES')
      expect(result.sql).toBe('SHOW TABLES')
      expect(result.appliedLimit).toBeNull()
    })
  })

  describe('trims trailing semicolons', () => {
    it('strips single trailing semicolon', () => {
      const result = buildReadOnlyQuery('SELECT 1;')
      expect(result.sql).toContain('SELECT 1')
      expect(result.sql).not.toContain(';')
    })

    it('strips multiple trailing semicolons', () => {
      const result = buildReadOnlyQuery('SELECT 1;;;')
      expect(result.sql).toContain('SELECT 1')
      expect(result.sql).not.toContain(';')
    })
  })

  describe('rejects empty and whitespace input', () => {
    it('rejects empty string', () => {
      expect(() => buildReadOnlyQuery('')).toThrow(
        'Enter a SQL query to run against the local graph bundle.'
      )
    })

    it('rejects whitespace-only string', () => {
      expect(() => buildReadOnlyQuery('   ')).toThrow(
        'Enter a SQL query to run against the local graph bundle.'
      )
    })

    it('rejects semicolons-only string', () => {
      expect(() => buildReadOnlyQuery(';;;')).toThrow(
        'Enter a SQL query to run against the local graph bundle.'
      )
    })
  })
})
