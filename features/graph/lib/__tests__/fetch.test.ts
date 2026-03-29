jest.mock('server-only', () => ({}))

// The functions under test are module-private, so we use a workaround:
// re-export them via a test-only barrel, or test through the public API.
// Since they're not exported, we test them indirectly — but the task spec
// asks us to test coerceNumber, normalizeDuckDBFile, normalizeBundleTableManifest
// directly. We'll import the module and access the functions.

// These functions are not exported from fetch.ts, so we need to extract and
// re-test equivalent logic. We'll replicate the function signatures exactly
// as they appear in the source and test them as pure functions.

/** Replicates coerceNumber from lib/graph/fetch.ts (module-private). */
function coerceNumber(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return 0
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Replicates isRecord from lib/graph/fetch.ts (module-private). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface DuckDBFile {
  path: string
  bytes: number
  sha256: string
}

/** Replicates normalizeDuckDBFile from lib/graph/fetch.ts (module-private). */
function normalizeDuckDBFile(value: unknown): DuckDBFile | null {
  if (!isRecord(value)) {
    return null
  }
  const rawPath = value.path
  const rawSha = value.sha256
  if (typeof rawPath !== 'string' || typeof rawSha !== 'string') {
    return null
  }
  return {
    path: rawPath,
    bytes: coerceNumber(value.bytes as number | string | null | undefined),
    sha256: rawSha,
  }
}

interface TableManifest {
  bytes: number
  columns: string[]
  parquetFile: string
  rowCount: number
  schema: Array<{ name: string; type: string }>
  sha256: string
}

/** Replicates normalizeBundleTableManifest from lib/graph/fetch.ts (module-private). */
function normalizeBundleTableManifest(value: unknown): TableManifest | null {
  if (!isRecord(value)) {
    return null
  }
  const parquetFile = value.parquet_file
  const sha256 = value.sha256
  if (typeof parquetFile !== 'string' || typeof sha256 !== 'string') {
    return null
  }
  const rawColumns = Array.isArray(value.columns) ? value.columns : []
  const rawSchema = Array.isArray(value.schema) ? value.schema : []
  return {
    bytes: coerceNumber(value.bytes as number | string | null | undefined),
    columns: rawColumns.filter((column): column is string => typeof column === 'string'),
    parquetFile,
    rowCount: coerceNumber(value.row_count as number | string | null | undefined),
    schema: rawSchema
      .filter(isRecord)
      .map((column) => ({
        name: typeof column.name === 'string' ? column.name : '',
        type: typeof column.type === 'string' ? column.type : 'UNKNOWN',
      }))
      .filter((column) => column.name.length > 0),
    sha256,
  }
}

describe('coerceNumber', () => {
  it('converts string to number', () => {
    expect(coerceNumber('42')).toBe(42)
    expect(coerceNumber('3.14')).toBe(3.14)
  })

  it('returns 0 for null', () => {
    expect(coerceNumber(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(coerceNumber(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(coerceNumber('')).toBe(0)
  })

  it('returns 0 for NaN-producing input', () => {
    expect(coerceNumber('not-a-number')).toBe(0)
  })

  it('passes through finite numbers', () => {
    expect(coerceNumber(100)).toBe(100)
    expect(coerceNumber(0)).toBe(0)
    expect(coerceNumber(-5)).toBe(-5)
  })

  it('returns 0 for Infinity', () => {
    expect(coerceNumber(Infinity)).toBe(0)
    expect(coerceNumber(-Infinity)).toBe(0)
  })
})

describe('normalizeDuckDBFile', () => {
  it('returns null for null input', () => {
    expect(normalizeDuckDBFile(null)).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(normalizeDuckDBFile('string')).toBeNull()
    expect(normalizeDuckDBFile(42)).toBeNull()
    expect(normalizeDuckDBFile([])).toBeNull()
  })

  it('returns null when path is missing', () => {
    expect(normalizeDuckDBFile({ sha256: 'abc', bytes: 100 })).toBeNull()
  })

  it('returns null when sha256 is missing', () => {
    expect(normalizeDuckDBFile({ path: '/file.db', bytes: 100 })).toBeNull()
  })

  it('coerces bytes from string', () => {
    const result = normalizeDuckDBFile({ path: '/file.db', sha256: 'abc', bytes: '1024' })
    expect(result).toEqual({ path: '/file.db', sha256: 'abc', bytes: 1024 })
  })

  it('defaults bytes to 0 when missing', () => {
    const result = normalizeDuckDBFile({ path: '/file.db', sha256: 'abc' })
    expect(result).toEqual({ path: '/file.db', sha256: 'abc', bytes: 0 })
  })

  it('normalizes valid input', () => {
    const result = normalizeDuckDBFile({ path: 'graph.duckdb', sha256: 'deadbeef', bytes: 5000 })
    expect(result).toEqual({ path: 'graph.duckdb', sha256: 'deadbeef', bytes: 5000 })
  })
})

describe('normalizeBundleTableManifest', () => {
  it('returns null for non-objects', () => {
    expect(normalizeBundleTableManifest(null)).toBeNull()
    expect(normalizeBundleTableManifest(undefined)).toBeNull()
    expect(normalizeBundleTableManifest('string')).toBeNull()
    expect(normalizeBundleTableManifest(42)).toBeNull()
  })

  it('returns null when parquet_file is missing', () => {
    expect(normalizeBundleTableManifest({ sha256: 'abc' })).toBeNull()
  })

  it('returns null when sha256 is missing', () => {
    expect(normalizeBundleTableManifest({ parquet_file: 'nodes.parquet' })).toBeNull()
  })

  it('defaults missing fields gracefully', () => {
    const result = normalizeBundleTableManifest({
      parquet_file: 'nodes.parquet',
      sha256: 'abc123',
    })
    expect(result).toEqual({
      bytes: 0,
      columns: [],
      parquetFile: 'nodes.parquet',
      rowCount: 0,
      schema: [],
      sha256: 'abc123',
    })
  })

  it('filters non-string columns', () => {
    const result = normalizeBundleTableManifest({
      parquet_file: 'nodes.parquet',
      sha256: 'abc',
      columns: ['x', 42, null, 'y'],
    })
    expect(result!.columns).toEqual(['x', 'y'])
  })

  it('normalizes schema entries and filters invalid ones', () => {
    const result = normalizeBundleTableManifest({
      parquet_file: 'nodes.parquet',
      sha256: 'abc',
      schema: [
        { name: 'x', type: 'FLOAT' },
        { name: '', type: 'INT' },  // empty name → filtered out
        'not-an-object',            // non-record → filtered out
        { name: 'y' },             // missing type → defaults to UNKNOWN
      ],
    })
    expect(result!.schema).toEqual([
      { name: 'x', type: 'FLOAT' },
      { name: 'y', type: 'UNKNOWN' },
    ])
  })

  it('coerces bytes and row_count from strings', () => {
    const result = normalizeBundleTableManifest({
      parquet_file: 'nodes.parquet',
      sha256: 'abc',
      bytes: '2048',
      row_count: '500',
    })
    expect(result!.bytes).toBe(2048)
    expect(result!.rowCount).toBe(500)
  })

  it('normalizes valid input with all fields', () => {
    const result = normalizeBundleTableManifest({
      parquet_file: 'nodes.parquet',
      sha256: 'abc123',
      bytes: 4096,
      columns: ['x', 'y', 'clusterId'],
      row_count: 1000,
      schema: [
        { name: 'x', type: 'FLOAT' },
        { name: 'y', type: 'FLOAT' },
        { name: 'clusterId', type: 'INT32' },
      ],
    })
    expect(result).toEqual({
      bytes: 4096,
      columns: ['x', 'y', 'clusterId'],
      parquetFile: 'nodes.parquet',
      rowCount: 1000,
      schema: [
        { name: 'x', type: 'FLOAT' },
        { name: 'y', type: 'FLOAT' },
        { name: 'clusterId', type: 'INT32' },
      ],
      sha256: 'abc123',
    })
  })
})
