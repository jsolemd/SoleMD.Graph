import { hasSameRange, safeMin, safeMax, formatCellValue } from '../helpers'

describe('hasSameRange', () => {
  it('returns true when both bounds are identical', () => {
    expect(hasSameRange([0, 100], [0, 100])).toBe(true)
  })

  it('returns false when lower bound differs', () => {
    expect(hasSameRange([0, 100], [1, 100])).toBe(false)
  })

  it('returns false when upper bound differs', () => {
    expect(hasSameRange([0, 100], [0, 99])).toBe(false)
  })

  it('returns false when both bounds differ', () => {
    expect(hasSameRange([0, 100], [10, 200])).toBe(false)
  })

  it('handles negative values', () => {
    expect(hasSameRange([-50, -10], [-50, -10])).toBe(true)
    expect(hasSameRange([-50, -10], [-50, -9])).toBe(false)
  })

  it('handles float values', () => {
    expect(hasSameRange([0.1, 0.9], [0.1, 0.9])).toBe(true)
    expect(hasSameRange([0.1, 0.9], [0.1, 0.91])).toBe(false)
  })

  it('is referentially stable — same tuple values compare equal regardless of reference', () => {
    const a: [number, number] = [10, 20]
    const b: [number, number] = [10, 20]
    expect(a).not.toBe(b)
    expect(hasSameRange(a, b)).toBe(true)
  })
})

describe('safeMin', () => {
  it('returns 0 for empty array', () => expect(safeMin([])).toBe(0))
  it('returns minimum value', () => expect(safeMin([3, 1, 2])).toBe(1))
})

describe('safeMax', () => {
  it('returns 0 for empty array', () => expect(safeMax([])).toBe(0))
  it('returns maximum value', () => expect(safeMax([3, 1, 2])).toBe(3))
})

describe('formatCellValue', () => {
  it('returns nullLabel for null', () => expect(formatCellValue(null)).toBe('—'))
  it('formats numbers as strings', () => expect(formatCellValue(42)).toBe('42'))
  it('passes strings through', () => expect(formatCellValue('hello')).toBe('hello'))
  it('truncates long strings when truncate is set', () =>
    expect(formatCellValue('abcdefgh', { truncate: 5 })).toBe('ab...'))
})
