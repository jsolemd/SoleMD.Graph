import { validateTableName, buildPlaceholderList, createBoundedCache } from './utils'

describe('validateTableName', () => {
  it('accepts lowercase identifiers', () => {
    expect(validateTableName('base_points')).toBe('base_points')
  })

  it('accepts mixed-case identifiers', () => {
    expect(validateTableName('Active_Points')).toBe('Active_Points')
  })

  it('accepts identifiers starting with underscore', () => {
    expect(validateTableName('_internal')).toBe('_internal')
  })

  it('accepts identifiers with digits', () => {
    expect(validateTableName('table2')).toBe('table2')
  })

  it('rejects identifiers starting with a digit', () => {
    expect(() => validateTableName('2table')).toThrow('Invalid table name')
  })

  it('rejects empty string', () => {
    expect(() => validateTableName('')).toThrow('Invalid table name')
  })

  it('rejects SQL injection via semicolon', () => {
    expect(() => validateTableName('t; DROP TABLE t')).toThrow('Invalid table name')
  })

  it('rejects SQL injection via quotes', () => {
    expect(() => validateTableName("t' OR '1'='1")).toThrow('Invalid table name')
  })

  it('rejects SQL injection via parentheses', () => {
    expect(() => validateTableName('t()')).toThrow('Invalid table name')
  })

  it('rejects spaces', () => {
    expect(() => validateTableName('my table')).toThrow('Invalid table name')
  })

  it('rejects hyphens', () => {
    expect(() => validateTableName('my-table')).toThrow('Invalid table name')
  })

  it('rejects dots', () => {
    expect(() => validateTableName('schema.table')).toThrow('Invalid table name')
  })
})

describe('buildPlaceholderList', () => {
  it('returns empty string for count 0', () => {
    expect(buildPlaceholderList(0)).toBe('')
  })

  it('returns single placeholder', () => {
    expect(buildPlaceholderList(1)).toBe('?')
  })

  it('returns comma-separated placeholders', () => {
    expect(buildPlaceholderList(3)).toBe('?, ?, ?')
  })
})

describe('createBoundedCache', () => {
  it('stores and retrieves values', () => {
    const cache = createBoundedCache<string, number>(3)
    cache.set('a', 1)
    expect(cache.get('a')).toBe(1)
  })

  it('evicts oldest entry when full', () => {
    const cache = createBoundedCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.has('a')).toBe(false)
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('does not evict when updating existing key', () => {
    const cache = createBoundedCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 10)
    expect(cache.get('a')).toBe(10)
    expect(cache.get('b')).toBe(2)
    expect(cache.size).toBe(2)
  })
})
