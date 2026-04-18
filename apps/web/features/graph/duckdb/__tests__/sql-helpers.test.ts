import {
  buildCurrentViewPredicate,
  buildScopedLayerPredicate,
  buildSelectedViewPredicate,
  escapeSqlLiteral,
  getLayerCanvasTableName,
  getLayerTableName,
  getSafeScopedContext,
} from '../sql-helpers'

describe('buildSelectedViewPredicate', () => {
  it('targets the canonical selected-point relation', () => {
    expect(buildSelectedViewPredicate()).toBe(
      'index IN (SELECT index FROM selected_point_indices)'
    )
  })
})

describe('buildCurrentViewPredicate', () => {
  it('returns scopeSql when present and non-empty', () => {
    const result = buildCurrentViewPredicate({
      currentPointScopeSql: 'clusterId = 5',
    })
    expect(result).toBe('clusterId = 5')
  })

  it('returns TRUE when scopeSql is null', () => {
    const result = buildCurrentViewPredicate({
      currentPointScopeSql: null,
    })
    expect(result).toBe('TRUE')
  })

  it('returns TRUE when scopeSql is whitespace', () => {
    const result = buildCurrentViewPredicate({
      currentPointScopeSql: '   ',
    })
    expect(result).toBe('TRUE')
  })
})

describe('layer table helpers', () => {
  it('returns the canonical hot-path active points table', () => {
    expect(getLayerTableName('corpus')).toBe('current_points_web')
  })

  it('returns the active canvas projection alias', () => {
    expect(getLayerCanvasTableName('corpus')).toBe('current_points_canvas_web')
  })
})

describe('buildScopedLayerPredicate', () => {
  it('returns selected-point relation predicate for selected scope', () => {
    const result = buildScopedLayerPredicate('corpus', 'selected', null)
    expect(result).toBe('index IN (SELECT index FROM selected_point_indices)')
  })

  it('prefers scopeSql for current scope', () => {
    const result = buildScopedLayerPredicate('corpus', 'current', 'year > 2020')
    expect(result).toBe('year > 2020')
  })

  it('falls back to TRUE for current scope without scopeSql', () => {
    const result = buildScopedLayerPredicate('corpus', 'current', null)
    expect(result).toBe('TRUE')
  })

  it('returns TRUE for dataset scope', () => {
    const result = buildScopedLayerPredicate('corpus', 'dataset', 'x > 0')
    expect(result).toBe('TRUE')
  })
})

describe('escapeSqlLiteral', () => {
  it('escapes single quotes by doubling them', () => {
    expect(escapeSqlLiteral("O'Brien")).toBe("O''Brien")
  })

  it('leaves strings without single quotes unchanged', () => {
    expect(escapeSqlLiteral('hello world')).toBe('hello world')
  })

  it('handles multiple single quotes', () => {
    expect(escapeSqlLiteral("it's a dog's life")).toBe("it''s a dog''s life")
  })

  it('handles empty string', () => {
    expect(escapeSqlLiteral('')).toBe('')
  })
})

describe('getSafeScopedContext', () => {
  it('returns canonical table name for corpus layer', () => {
    const { tableName } = getSafeScopedContext({
      layer: 'corpus',
      scope: 'dataset',
      currentPointScopeSql: null,
    })
    expect(tableName).toBe('current_points_web')
  })

  it('returns TRUE predicate for dataset scope', () => {
    const { scopedPredicate } = getSafeScopedContext({
      layer: 'corpus',
      scope: 'dataset',
      currentPointScopeSql: 'year > 2020',
    })
    expect(scopedPredicate).toBe('TRUE')
  })

  it('returns selected-point relation predicate for selected scope', () => {
    const { scopedPredicate } = getSafeScopedContext({
      layer: 'corpus',
      scope: 'selected',
      currentPointScopeSql: null,
    })
    expect(scopedPredicate).toBe('index IN (SELECT index FROM selected_point_indices)')
  })

  it('returns scopeSql for current scope with active filter', () => {
    const { scopedPredicate } = getSafeScopedContext({
      layer: 'corpus',
      scope: 'current',
      currentPointScopeSql: 'clusterId = 7',
    })
    expect(scopedPredicate).toBe('clusterId = 7')
  })

  it('returns TRUE for current scope with null scopeSql', () => {
    const { scopedPredicate } = getSafeScopedContext({
      layer: 'corpus',
      scope: 'current',
      currentPointScopeSql: null,
    })
    expect(scopedPredicate).toBe('TRUE')
  })
})
