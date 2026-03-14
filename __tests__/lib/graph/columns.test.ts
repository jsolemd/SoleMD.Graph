import {
  getColumnsForLayer,
  getTableColumnsForLayer,
  getColumnMetaForLayer,
  TABLE_COLUMNS,
  PAPER_TABLE_COLUMNS,
  ALL_DATA_COLUMNS,
  ALL_PAPER_DATA_COLUMNS,
} from '@/lib/graph/columns'

describe('getColumnsForLayer', () => {
  it('returns chunk data columns for chunk layer', () => {
    const cols = getColumnsForLayer('chunk')
    expect(cols).toBe(ALL_DATA_COLUMNS)
    expect(cols.some((c) => c.key === 'sectionCanonical')).toBe(true)
    expect(cols.some((c) => c.key === 'tokenCount')).toBe(true)
  })

  it('returns paper data columns for paper layer', () => {
    const cols = getColumnsForLayer('paper')
    expect(cols).toBe(ALL_PAPER_DATA_COLUMNS)
    expect(cols.some((c) => c.key === 'paperReferenceCount')).toBe(true)
    expect(cols.some((c) => c.key === 'paperFigureCount')).toBe(true)
    // Paper layer should not have chunk-specific columns
    expect(cols.some((c) => c.key === 'sectionCanonical')).toBe(false)
    expect(cols.some((c) => c.key === 'tokenCount')).toBe(false)
  })
})

describe('getTableColumnsForLayer', () => {
  it('returns chunk table columns for chunk layer', () => {
    expect(getTableColumnsForLayer('chunk')).toBe(TABLE_COLUMNS)
    expect(TABLE_COLUMNS).toContain('sectionCanonical')
    expect(TABLE_COLUMNS).toContain('tokenCount')
  })

  it('returns paper table columns for paper layer', () => {
    expect(getTableColumnsForLayer('paper')).toBe(PAPER_TABLE_COLUMNS)
    expect(PAPER_TABLE_COLUMNS).toContain('paperTitle')
    expect(PAPER_TABLE_COLUMNS).toContain('paperReferenceCount')
    expect(PAPER_TABLE_COLUMNS).not.toContain('sectionCanonical')
    expect(PAPER_TABLE_COLUMNS).not.toContain('tokenCount')
  })
})

describe('getColumnMetaForLayer', () => {
  it('finds chunk-specific columns on chunk layer', () => {
    const meta = getColumnMetaForLayer('tokenCount', 'chunk')
    expect(meta).toBeDefined()
    expect(meta?.label).toBe('Token Count')
  })

  it('does not find chunk-specific columns on paper layer', () => {
    expect(getColumnMetaForLayer('tokenCount', 'paper')).toBeUndefined()
  })

  it('finds paper-specific columns on paper layer', () => {
    const meta = getColumnMetaForLayer('paperReferenceCount', 'paper')
    expect(meta).toBeDefined()
    expect(meta?.label).toBe('Reference Count')
  })

  it('finds shared columns on both layers', () => {
    expect(getColumnMetaForLayer('year', 'chunk')).toBeDefined()
    expect(getColumnMetaForLayer('year', 'paper')).toBeDefined()
  })
})
