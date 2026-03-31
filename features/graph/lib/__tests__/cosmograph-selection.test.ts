jest.mock('@uwdata/mosaic-sql', () => ({
  and: (...args: unknown[]) => ({ type: 'AND', args }),
  column: (name: string) => ({ type: 'COLUMN', name }),
  duckDBCodeGenerator: {
    toString: (expr: unknown) => JSON.stringify(expr),
  },
  eq: (col: string, val: unknown) => ({ type: 'BINARY', op: '=', left: col, right: val }),
  isBetween: (col: string, range: unknown) => ({ type: 'BETWEEN', col, range }),
  isNull: (col: string) => ({ type: 'IS_NULL', col }),
  literal: (val: unknown) => ({ type: 'LITERAL', value: val }),
  or: (...args: unknown[]) => ({ type: 'OR', args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'SQL',
    strings: [...strings],
    values,
  }),
}))

jest.mock('@uwdata/mosaic-core', () => ({}))

import {
  isVisibilitySelectionSourceId,
  matchesSelectionSourceId,
  getSelectionSourceId,
  isBudgetScopeSelectionSourceId,
  createSelectionSource,
  combineScopeSqlClauses,
  buildCurrentPointScopeSql,
  buildNumericRangeFilterClause,
  BUDGET_FOCUS_SOURCE_ID,
  SELECTED_POINT_INDICES_SCOPE_SQL,
} from '../cosmograph-selection'

// ── isVisibilitySelectionSourceId ───────────────────────────────────

describe('isVisibilitySelectionSourceId', () => {
  it('returns true for filter: prefix', () => {
    expect(isVisibilitySelectionSourceId('filter:year')).toBe(true)
  })

  it('returns true for timeline: prefix', () => {
    expect(isVisibilitySelectionSourceId('timeline:year')).toBe(true)
  })

  it('returns true for budget: prefix', () => {
    expect(isVisibilitySelectionSourceId('budget:focus-cluster')).toBe(true)
  })

  it('returns false for intent sources', () => {
    expect(isVisibilitySelectionSourceId('lasso:selection')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isVisibilitySelectionSourceId(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isVisibilitySelectionSourceId(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isVisibilitySelectionSourceId('')).toBe(false)
  })
})

// ── matchesSelectionSourceId ────────────────────────────────────────

describe('matchesSelectionSourceId', () => {
  it('matches exact source IDs', () => {
    expect(matchesSelectionSourceId('filter:year', 'filter:year')).toBe(true)
  })

  it('matches prefixed source IDs (e.g. filter:year-0)', () => {
    expect(matchesSelectionSourceId('filter:year-0', 'filter:year')).toBe(true)
  })

  it('does not match unrelated IDs', () => {
    expect(matchesSelectionSourceId('filter:journal', 'filter:year')).toBe(false)
  })

  it('returns false when actual is null', () => {
    expect(matchesSelectionSourceId(null, 'filter:year')).toBe(false)
  })

  it('returns false when expected is null', () => {
    expect(matchesSelectionSourceId('filter:year', null)).toBe(false)
  })

  it('returns false when both are null', () => {
    expect(matchesSelectionSourceId(null, null)).toBe(false)
  })

  it('does not match when actual is a prefix of expected (wrong direction)', () => {
    expect(matchesSelectionSourceId('filter', 'filter:year')).toBe(false)
  })
})

// ── getSelectionSourceId ────────────────────────────────────────────

describe('getSelectionSourceId', () => {
  it('extracts id from an object with string id', () => {
    expect(getSelectionSourceId({ id: 'filter:year' })).toBe('filter:year')
  })

  it('returns null for null input', () => {
    expect(getSelectionSourceId(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(getSelectionSourceId(undefined)).toBeNull()
  })

  it('returns null when id is not a string', () => {
    expect(getSelectionSourceId({ id: 42 })).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(getSelectionSourceId('string' as never)).toBeNull()
  })

  it('returns null when object has no id property', () => {
    expect(getSelectionSourceId({} as never)).toBeNull()
  })
})

// ── isBudgetScopeSelectionSourceId ──────────────────────────────────

describe('isBudgetScopeSelectionSourceId', () => {
  it('returns true for filter: prefix', () => {
    expect(isBudgetScopeSelectionSourceId('filter:year')).toBe(true)
  })

  it('returns true for timeline: prefix', () => {
    expect(isBudgetScopeSelectionSourceId('timeline:year')).toBe(true)
  })

  it('returns false for budget: prefix (not a budget-scope source)', () => {
    expect(isBudgetScopeSelectionSourceId('budget:focus-cluster')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isBudgetScopeSelectionSourceId(null)).toBe(false)
  })
})

// ── createSelectionSource ───────────────────────────────────────────

describe('createSelectionSource', () => {
  it('creates a source with the given id', () => {
    const source = createSelectionSource('filter:year')
    expect(source.id).toBe('filter:year')
  })
})

// ── combineScopeSqlClauses ──────────────────────────────────────────

describe('combineScopeSqlClauses', () => {
  it('returns null for no clauses', () => {
    expect(combineScopeSqlClauses()).toBeNull()
  })

  it('returns null for all-null/empty clauses', () => {
    expect(combineScopeSqlClauses(null, undefined, '', '   ')).toBeNull()
  })

  it('returns a single clause unwrapped', () => {
    expect(combineScopeSqlClauses('year > 2020')).toBe('year > 2020')
  })

  it('ANDs multiple clauses with parens', () => {
    expect(combineScopeSqlClauses('year > 2020', 'clusterId = 5')).toBe(
      '(year > 2020) AND (clusterId = 5)'
    )
  })

  it('filters out null/empty clauses before combining', () => {
    expect(combineScopeSqlClauses(null, 'year > 2020', '', 'clusterId = 5')).toBe(
      '(year > 2020) AND (clusterId = 5)'
    )
  })

  it('trims whitespace from clauses', () => {
    expect(combineScopeSqlClauses('  year > 2020  ')).toBe('year > 2020')
  })
})

// ── buildCurrentPointScopeSql ───────────────────────────────────────

describe('buildCurrentPointScopeSql', () => {
  it('returns null when no selection and no scope', () => {
    const result = buildCurrentPointScopeSql({
      selection: null,
      selectionLocked: false,
      hasSelectedBaseline: false,
    })
    expect(result).toBeNull()
  })

  it('returns null when selection not locked', () => {
    const result = buildCurrentPointScopeSql({
      selection: null,
      selectionLocked: false,
      hasSelectedBaseline: true,
    })
    expect(result).toBeNull()
  })

  it('returns null when locked but no selected baseline', () => {
    const result = buildCurrentPointScopeSql({
      selection: null,
      selectionLocked: true,
      hasSelectedBaseline: false,
    })
    expect(result).toBeNull()
  })
})

// ── buildNumericRangeFilterClause ───────────────────────────────────

describe('buildNumericRangeFilterClause', () => {
  it('creates a clause with isBetween predicate', () => {
    const source = { id: 'filter:year' }
    const clause = buildNumericRangeFilterClause(source, 'year', [2000, 2024])
    expect(clause.source).toBe(source)
    expect(clause.value).toEqual([2000, 2024])
    expect(clause.predicate).toBeDefined()
    expect(clause.meta).toEqual({ type: 'point' })
  })
})

// ── Constants ───────────────────────────────────────────────────────

describe('constants', () => {
  it('exposes BUDGET_FOCUS_SOURCE_ID', () => {
    expect(BUDGET_FOCUS_SOURCE_ID).toBe('budget:focus-cluster')
  })

  it('exposes SELECTED_POINT_INDICES_SCOPE_SQL', () => {
    expect(SELECTED_POINT_INDICES_SCOPE_SQL).toContain('selected_point_indices')
  })
})
