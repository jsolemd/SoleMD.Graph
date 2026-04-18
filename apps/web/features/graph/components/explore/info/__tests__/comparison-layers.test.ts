import {
  areInfoSummariesEquivalent,
  getInfoComparisonState,
  getInfoComparisonHeading,
  getInfoComparisonOpacities,
  getInfoComparisonColors,
  getInfoComparisonDisplayValue,
  getActiveComparisonCount,
  mergeInfoComparisonRows,
} from '../comparison-layers'

import type { GraphInfoSummary } from '@/features/graph/types'

// ── Helpers ─────────────────────────────────────────────────────────

function summary(overrides: Partial<GraphInfoSummary> = {}): GraphInfoSummary {
  return {
    totalCount: 1000,
    scopedCount: 1000,
    baseCount: 900,
    overlayCount: 100,
    scope: 'dataset',
    isSubset: false,
    hasSelection: false,
    papers: 800,
    clusters: 10,
    noise: 50,
    yearRange: { min: 2000, max: 2024 },
    topClusters: [],
    ...overrides,
  }
}

// ── areInfoSummariesEquivalent ──────────────────────────────────────

describe('areInfoSummariesEquivalent', () => {
  it('returns false when left is null', () => {
    expect(areInfoSummariesEquivalent(null, summary())).toBe(false)
  })

  it('returns false when right is null', () => {
    expect(areInfoSummariesEquivalent(summary(), null)).toBe(false)
  })

  it('returns true for identical summaries', () => {
    const a = summary()
    const b = summary()
    expect(areInfoSummariesEquivalent(a, b)).toBe(true)
  })

  it('returns false when scopedCount differs', () => {
    expect(areInfoSummariesEquivalent(
      summary({ scopedCount: 100 }),
      summary({ scopedCount: 200 }),
    )).toBe(false)
  })

  it('returns false when yearRange differs', () => {
    expect(areInfoSummariesEquivalent(
      summary({ yearRange: { min: 2000, max: 2024 } }),
      summary({ yearRange: { min: 2000, max: 2025 } }),
    )).toBe(false)
  })

  it('returns false when one yearRange is undefined', () => {
    expect(areInfoSummariesEquivalent(
      summary({ yearRange: { min: 2000, max: 2024 } }),
      summary({ yearRange: undefined }),
    )).toBe(false)
  })
})

// ── getInfoComparisonState ──────────────────────────────────────────

describe('getInfoComparisonState', () => {
  it('passes through hasSelection and hasFiltered', () => {
    const state = getInfoComparisonState({ hasSelection: true, hasFiltered: false })
    expect(state.hasSelection).toBe(true)
    expect(state.hasFiltered).toBe(false)
  })
})

// ── getInfoComparisonHeading ────────────────────────────────────────

describe('getInfoComparisonHeading', () => {
  it('returns "All" when neither selection nor filtered', () => {
    expect(getInfoComparisonHeading({ hasSelection: false, hasFiltered: false })).toBe('All')
  })

  it('returns "Selection" when only selection active', () => {
    expect(getInfoComparisonHeading({ hasSelection: true, hasFiltered: false })).toBe('Selection')
  })

  it('returns "Filtered" when filtered active', () => {
    expect(getInfoComparisonHeading({ hasSelection: false, hasFiltered: true })).toBe('Filtered')
  })

  it('returns "Filtered" when both selection and filtered active', () => {
    expect(getInfoComparisonHeading({ hasSelection: true, hasFiltered: true })).toBe('Filtered')
  })
})

// ── getInfoComparisonOpacities ──────────────────────────────────────

describe('getInfoComparisonOpacities', () => {
  it('returns base opacity when no comparison', () => {
    const result = getInfoComparisonOpacities({ hasSelection: false, hasFiltered: false })
    expect(result.all).toBeCloseTo(0.98)
    expect(result.selection).toBe(0)
    expect(result.filtered).toBe(0)
  })

  it('returns selection opacities when selection active', () => {
    const result = getInfoComparisonOpacities({ hasSelection: true, hasFiltered: false })
    expect(result.selection).toBeGreaterThan(0)
    expect(result.filtered).toBe(0)
  })

  it('returns filtered opacities when filtered active', () => {
    const result = getInfoComparisonOpacities({ hasSelection: false, hasFiltered: true })
    expect(result.filtered).toBeGreaterThan(0)
  })
})

// ── getInfoComparisonColors ─────────────────────────────────────────

describe('getInfoComparisonColors', () => {
  it('returns CSS variables for each state', () => {
    const noComparison = getInfoComparisonColors({ hasSelection: false, hasFiltered: false })
    expect(noComparison.all).toContain('var(--')

    const withSelection = getInfoComparisonColors({ hasSelection: true, hasFiltered: false })
    expect(withSelection.selection).toContain('var(--')

    const withFiltered = getInfoComparisonColors({ hasSelection: false, hasFiltered: true })
    expect(withFiltered.filtered).toContain('var(--')
  })
})

// ── getInfoComparisonDisplayValue ───────────────────────────────────

describe('getInfoComparisonDisplayValue', () => {
  const format = (v: number) => v.toLocaleString()

  it('returns just totalCount when no comparisons', () => {
    const result = getInfoComparisonDisplayValue({ totalCount: 1000, format })
    expect(result).toBe('1,000')
  })

  it('returns selection / total when only selection', () => {
    const result = getInfoComparisonDisplayValue({ totalCount: 1000, selectionCount: 100, format })
    expect(result).toBe('100 / 1,000')
  })

  it('returns filtered / total when only filtered', () => {
    const result = getInfoComparisonDisplayValue({ totalCount: 1000, filteredCount: 50, format })
    expect(result).toBe('50 / 1,000')
  })

  it('returns filtered / selection / total when both present', () => {
    const result = getInfoComparisonDisplayValue({
      totalCount: 1000,
      selectionCount: 100,
      filteredCount: 50,
      format,
    })
    expect(result).toBe('50 / 100 / 1,000')
  })
})

// ── getActiveComparisonCount ────────────────────────────────────────

describe('getActiveComparisonCount', () => {
  it('returns filteredCount when present', () => {
    expect(getActiveComparisonCount({ totalCount: 100, selectionCount: 50, filteredCount: 20 })).toBe(20)
  })

  it('returns selectionCount when no filteredCount', () => {
    expect(getActiveComparisonCount({ totalCount: 100, selectionCount: 50 })).toBe(50)
  })

  it('returns totalCount when no comparisons', () => {
    expect(getActiveComparisonCount({ totalCount: 100 })).toBe(100)
  })
})

// ── mergeInfoComparisonRows ─────────────────────────────────────────

describe('mergeInfoComparisonRows', () => {
  it('merges dataset rows into comparison format', () => {
    const result = mergeInfoComparisonRows({
      datasetRows: [
        { value: 'Neurology', count: 60 },
        { value: 'Psychiatry', count: 40 },
      ],
      maxItems: 10,
    })
    expect(result).toHaveLength(2)
    expect(result[0].value).toBe('Neurology')
    expect(result[0].totalCount).toBe(60)
    expect(result[0].selectionCount).toBeNull()
    expect(result[0].filteredCount).toBeNull()
  })

  it('merges selection rows by value', () => {
    const result = mergeInfoComparisonRows({
      datasetRows: [
        { value: 'A', count: 100 },
        { value: 'B', count: 50 },
      ],
      selectionRows: [
        { value: 'A', count: 20 },
      ],
      maxItems: 10,
    })
    const rowA = result.find(r => r.value === 'A')!
    expect(rowA.totalCount).toBe(100)
    expect(rowA.selectionCount).toBe(20)
  })

  it('computes enrichment when selection is present', () => {
    const result = mergeInfoComparisonRows({
      datasetRows: [
        { value: 'A', count: 100 },
        { value: 'B', count: 100 },
      ],
      selectionRows: [
        { value: 'A', count: 80 },
        { value: 'B', count: 20 },
      ],
      maxItems: 10,
    })
    const rowA = result.find(r => r.value === 'A')!
    // A: (80/100) / (100/200) = 0.8/0.5 = 1.6
    expect(rowA.enrichment).toBeCloseTo(1.6)
  })

  it('respects maxItems limit', () => {
    const datasetRows = Array.from({ length: 20 }, (_, i) => ({
      value: `cat_${i}`,
      count: 20 - i,
    }))
    const result = mergeInfoComparisonRows({ datasetRows, maxItems: 5 })
    expect(result).toHaveLength(5)
  })

  it('sorts by active comparison count descending', () => {
    const result = mergeInfoComparisonRows({
      datasetRows: [
        { value: 'A', count: 10 },
        { value: 'B', count: 50 },
        { value: 'C', count: 30 },
      ],
      maxItems: 10,
    })
    expect(result[0].value).toBe('B')
    expect(result[1].value).toBe('C')
    expect(result[2].value).toBe('A')
  })

  it('handles values present in selection but not dataset', () => {
    const result = mergeInfoComparisonRows({
      datasetRows: [{ value: 'A', count: 10 }],
      selectionRows: [{ value: 'B', count: 5 }],
      maxItems: 10,
    })
    expect(result.find(r => r.value === 'B')).toBeDefined()
    expect(result.find(r => r.value === 'B')!.totalCount).toBe(0)
  })
})
