import { buildIndexWhereClause, buildCurrentViewPredicate, sliceScopeIndices, buildScopedLayerPredicate } from '../sql-helpers'

describe('buildIndexWhereClause', () => {
  it('returns false predicate for empty array', () => {
    expect(buildIndexWhereClause([])).toBe('1 = 0')
  })

  it('builds IN clause for single index', () => {
    expect(buildIndexWhereClause([42])).toBe('index IN (42)')
  })

  it('builds IN clause for multiple indices', () => {
    expect(buildIndexWhereClause([1, 2, 3])).toBe('index IN (1, 2, 3)')
  })

  it('coerces non-numeric values to 0', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = buildIndexWhereClause(['foo' as any, null as any, undefined as any])
    expect(result).toBe('index IN (0, 0, 0)')
  })

  it('coerces NaN to 0', () => {
    expect(buildIndexWhereClause([NaN])).toBe('index IN (0)')
  })

  it('handles large arrays without error', () => {
    const indices = Array.from({ length: 1000 }, (_, i) => i)
    const result = buildIndexWhereClause(indices)
    expect(result).toContain('index IN (')
    expect(result.split(',').length).toBe(1000)
  })
})

describe('buildCurrentViewPredicate', () => {
  it('returns scopeSql when present and non-empty', () => {
    const result = buildCurrentViewPredicate({
      currentPointIndices: [1, 2],
      currentPointScopeSql: 'clusterId = 5',
    })
    expect(result).toBe('clusterId = 5')
  })

  it('falls back to index clause when scopeSql is null', () => {
    const result = buildCurrentViewPredicate({
      currentPointIndices: [10, 20],
      currentPointScopeSql: null,
    })
    expect(result).toBe('index IN (10, 20)')
  })

  it('falls back to index clause when scopeSql is whitespace', () => {
    const result = buildCurrentViewPredicate({
      currentPointIndices: [5],
      currentPointScopeSql: '   ',
    })
    expect(result).toBe('index IN (5)')
  })

  it('returns TRUE when both are null', () => {
    const result = buildCurrentViewPredicate({
      currentPointIndices: null,
      currentPointScopeSql: null,
    })
    expect(result).toBe('TRUE')
  })
})

describe('buildScopedLayerPredicate', () => {
  it('returns index clause for selected scope', () => {
    const result = buildScopedLayerPredicate('chunk', 'selected', null, null, [1, 2, 3])
    expect(result).toBe('index IN (1, 2, 3)')
  })

  it('returns false predicate for selected scope with empty selection', () => {
    const result = buildScopedLayerPredicate('chunk', 'selected', null, null, [])
    expect(result).toBe('1 = 0')
  })

  it('prefers scopeSql for current scope', () => {
    const result = buildScopedLayerPredicate('chunk', 'current', [1], 'year > 2020', [])
    expect(result).toBe('year > 2020')
  })

  it('falls back to index clause for current scope without scopeSql', () => {
    const result = buildScopedLayerPredicate('chunk', 'current', [10, 20], null, [])
    expect(result).toBe('index IN (10, 20)')
  })

  it('returns TRUE for dataset scope', () => {
    const result = buildScopedLayerPredicate('chunk', 'dataset', [1], 'x > 0', [5])
    expect(result).toBe('TRUE')
  })
})

describe('sliceScopeIndices', () => {
  it('returns null for null source indices', () => {
    const result = sliceScopeIndices({
      view: 'current',
      page: 1,
      pageSize: 10,
      currentPointIndices: null,
      selectedPointIndices: [],
    })
    expect(result.totalRows).toBeNull()
    expect(result.pageIndices).toBeNull()
  })

  it('slices first page correctly', () => {
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const result = sliceScopeIndices({
      view: 'selected',
      page: 1,
      pageSize: 3,
      currentPointIndices: null,
      selectedPointIndices: indices,
    })
    expect(result.totalRows).toBe(10)
    expect(result.pageIndices).toEqual([0, 1, 2])
  })

  it('slices middle page correctly', () => {
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const result = sliceScopeIndices({
      view: 'selected',
      page: 2,
      pageSize: 3,
      currentPointIndices: null,
      selectedPointIndices: indices,
    })
    expect(result.pageIndices).toEqual([3, 4, 5])
  })

  it('handles last partial page', () => {
    const indices = [0, 1, 2, 3, 4]
    const result = sliceScopeIndices({
      view: 'selected',
      page: 2,
      pageSize: 3,
      currentPointIndices: null,
      selectedPointIndices: indices,
    })
    expect(result.pageIndices).toEqual([3, 4])
  })

  it('clamps page to minimum of 1', () => {
    const indices = [0, 1, 2]
    const result = sliceScopeIndices({
      view: 'selected',
      page: 0,
      pageSize: 2,
      currentPointIndices: null,
      selectedPointIndices: indices,
    })
    expect(result.pageIndices).toEqual([0, 1])
  })

  it('clamps pageSize to minimum of 1', () => {
    const indices = [10, 20, 30]
    const result = sliceScopeIndices({
      view: 'selected',
      page: 1,
      pageSize: 0,
      currentPointIndices: null,
      selectedPointIndices: indices,
    })
    expect(result.pageIndices).toEqual([10])
  })
})
