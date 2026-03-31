import {
  computePeakBin,
  computeDistributionShape,
  computeHistogramConcentration,
  computeCategoricalConcentration,
  computeDiversity,
  computeDominantValue,
  computeSpread,
  computeDistributionShift,
  deriveColumnInsights,
} from '../info-analytics'

import type { GraphInfoHistogramBin } from '@/features/graph/types'
import type { InfoComparisonFacetRow } from '@/features/graph/components/explore/info/comparison-layers'
import type { NumericStatsRow } from '@/features/graph/duckdb/queries/summary'

// ── Helpers ─────────────────────────────────────────────────────────

function bin(min: number, max: number, count: number): GraphInfoHistogramBin {
  return { min, max, count }
}

function facetRow(value: string, totalCount: number): InfoComparisonFacetRow {
  return { value, totalCount, selectionCount: null, filteredCount: null }
}

function statsRow(overrides: Partial<NumericStatsRow> = {}): NumericStatsRow {
  return { min: 0, max: 100, avg: 50, median: 50, count: 100, ...overrides }
}

// ── computePeakBin ──────────────────────────────────────────────────

describe('computePeakBin', () => {
  it('returns null for empty bins', () => {
    expect(computePeakBin([], 100)).toBeNull()
  })

  it('returns null when totalCount is 0', () => {
    expect(computePeakBin([bin(0, 10, 5)], 0)).toBeNull()
  })

  it('returns null when totalCount is negative', () => {
    expect(computePeakBin([bin(0, 10, 5)], -1)).toBeNull()
  })

  it('finds the single peak bin', () => {
    const bins = [bin(0, 10, 5), bin(10, 20, 30), bin(20, 30, 10)]
    const result = computePeakBin(bins, 45)!
    expect(result.binIndex).toBe(1)
    expect(result.midpoint).toBe(15)
    expect(result.count).toBe(30)
    expect(result.fraction).toBeCloseTo(30 / 45)
  })

  it('returns the first max if counts are tied', () => {
    const bins = [bin(0, 10, 20), bin(10, 20, 20)]
    const result = computePeakBin(bins, 40)!
    expect(result.binIndex).toBe(0)
  })

  it('works with a single bin', () => {
    const result = computePeakBin([bin(0, 100, 50)], 50)!
    expect(result.binIndex).toBe(0)
    expect(result.midpoint).toBe(50)
    expect(result.fraction).toBe(1)
  })
})

// ── computeDistributionShape ────────────────────────────────────────

describe('computeDistributionShape', () => {
  it('returns null for fewer than 3 bins', () => {
    expect(computeDistributionShape([bin(0, 10, 5), bin(10, 20, 5)], 10)).toBeNull()
  })

  it('returns null when totalCount is 0', () => {
    const bins = [bin(0, 10, 5), bin(10, 20, 5), bin(20, 30, 5)]
    expect(computeDistributionShape(bins, 0)).toBeNull()
  })

  it('detects symmetric distribution via bin-midpoint path', () => {
    // Symmetric bins: equal count on both sides
    const bins = [bin(0, 10, 50), bin(10, 20, 100), bin(20, 30, 50)]
    const result = computeDistributionShape(bins, 200)!
    expect(result.direction).toBe('symmetric')
    expect(Math.abs(result.skewCoefficient)).toBeLessThan(0.15)
  })

  it('detects right-skewed distribution via bin-midpoint path', () => {
    // Heavy right tail
    const bins = [bin(0, 10, 100), bin(10, 20, 30), bin(20, 30, 10), bin(30, 40, 5)]
    const result = computeDistributionShape(bins, 145)!
    expect(result.direction).toBe('right-skewed')
    expect(result.skewCoefficient).toBeGreaterThan(0.15)
  })

  it('uses Pearson path when stats with different avg and median are provided', () => {
    const bins = [bin(0, 10, 100), bin(10, 20, 30), bin(20, 30, 10)]
    const stats = { avg: 8, median: 5 }
    const result = computeDistributionShape(bins, 140, stats)!
    expect(result).not.toBeNull()
    expect(typeof result.skewCoefficient).toBe('number')
  })

  it('falls back to bin-midpoint when stats have avg === median', () => {
    const bins = [bin(0, 10, 50), bin(10, 20, 100), bin(20, 30, 50)]
    const stats = { avg: 15, median: 15 }
    const result = computeDistributionShape(bins, 200, stats)!
    expect(result.direction).toBe('symmetric')
  })
})

// ── computeHistogramConcentration ───────────────────────────────────

describe('computeHistogramConcentration', () => {
  it('returns null for empty bins', () => {
    expect(computeHistogramConcentration([], 100)).toBeNull()
  })

  it('returns null for zero totalCount', () => {
    expect(computeHistogramConcentration([bin(0, 10, 5)], 0)).toBeNull()
  })

  it('computes top-3 concentration', () => {
    const bins = [bin(0, 10, 50), bin(10, 20, 30), bin(20, 30, 10), bin(30, 40, 5), bin(40, 50, 5)]
    const result = computeHistogramConcentration(bins, 100)!
    expect(result.topNFraction).toBe(0.9) // 50+30+10 = 90
    expect(result.n).toBe(3)
  })

  it('caps n at bins.length when fewer bins than topN', () => {
    const bins = [bin(0, 10, 50), bin(10, 20, 50)]
    const result = computeHistogramConcentration(bins, 100)!
    expect(result.topNFraction).toBe(1)
    expect(result.n).toBe(2)
  })

  it('accepts custom topN', () => {
    const bins = [bin(0, 10, 40), bin(10, 20, 30), bin(20, 30, 20), bin(30, 40, 10)]
    const result = computeHistogramConcentration(bins, 100, 2)!
    expect(result.topNFraction).toBe(0.7) // 40+30
    expect(result.n).toBe(2)
  })
})

// ── computeCategoricalConcentration ─────────────────────────────────

describe('computeCategoricalConcentration', () => {
  it('returns null for empty rows', () => {
    expect(computeCategoricalConcentration([])).toBeNull()
  })

  it('returns null when total is 0', () => {
    expect(computeCategoricalConcentration([facetRow('a', 0)])).toBeNull()
  })

  it('computes top-3 concentration from facet rows', () => {
    const rows = [facetRow('a', 50), facetRow('b', 30), facetRow('c', 10), facetRow('d', 10)]
    const result = computeCategoricalConcentration(rows)!
    expect(result.topNFraction).toBe(0.9)
    expect(result.n).toBe(3)
  })
})

// ── computeDiversity ────────────────────────────────────────────────

describe('computeDiversity', () => {
  it('returns null for single-row input', () => {
    expect(computeDiversity([facetRow('a', 10)])).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(computeDiversity([])).toBeNull()
  })

  it('returns null when total is 0', () => {
    expect(computeDiversity([facetRow('a', 0), facetRow('b', 0)])).toBeNull()
  })

  it('returns normalizedEntropy of 1 for perfectly uniform distribution', () => {
    const rows = [facetRow('a', 25), facetRow('b', 25), facetRow('c', 25), facetRow('d', 25)]
    const result = computeDiversity(rows)!
    expect(result.normalizedEntropy).toBeCloseTo(1.0)
    expect(result.uniqueCount).toBe(4)
  })

  it('returns low entropy for highly concentrated distribution', () => {
    const rows = [facetRow('a', 99), facetRow('b', 1)]
    const result = computeDiversity(rows)!
    expect(result.normalizedEntropy).toBeLessThan(0.2)
    expect(result.uniqueCount).toBe(2)
  })
})

// ── computeDominantValue ────────────────────────────────────────────

describe('computeDominantValue', () => {
  it('returns null for empty rows', () => {
    expect(computeDominantValue([])).toBeNull()
  })

  it('returns null when total is 0', () => {
    expect(computeDominantValue([facetRow('a', 0)])).toBeNull()
  })

  it('returns the first row as dominant value', () => {
    const rows = [facetRow('Neurology', 60), facetRow('Psychiatry', 40)]
    const result = computeDominantValue(rows)!
    expect(result.value).toBe('Neurology')
    expect(result.count).toBe(60)
    expect(result.fraction).toBe(0.6)
  })
})

// ── computeSpread ───────────────────────────────────────────────────

describe('computeSpread', () => {
  it('returns null when min === max', () => {
    expect(computeSpread(statsRow({ min: 5, max: 5 }))).toBeNull()
  })

  it('returns null when median is 0', () => {
    expect(computeSpread(statsRow({ min: -10, max: 10, median: 0 }))).toBeNull()
  })

  it('computes relative range', () => {
    const result = computeSpread(statsRow({ min: 10, max: 110, median: 50 }))!
    expect(result.relativeRange).toBe(2) // (110-10)/50
  })

  it('uses absolute median for negative medians', () => {
    const result = computeSpread(statsRow({ min: -100, max: -10, median: -50 }))!
    expect(result.relativeRange).toBe(1.8) // 90/50
  })
})

// ── computeDistributionShift ────────────────────────────────────────

describe('computeDistributionShift', () => {
  it('computes deltas between dataset and comparison', () => {
    const dataset = statsRow({ median: 50, avg: 55 })
    const comparison = statsRow({ median: 60, avg: 70 })
    const result = computeDistributionShift(dataset, comparison)
    expect(result.medianDelta).toBe(10)
    expect(result.avgDelta).toBe(15)
    expect(result.medianRelativeChange).toBeCloseTo(0.2) // 10/50
    expect(result.avgRelativeChange).toBeCloseTo(15 / 55)
  })

  it('returns null relative change when dataset values are 0', () => {
    const dataset = statsRow({ median: 0, avg: 0 })
    const comparison = statsRow({ median: 10, avg: 5 })
    const result = computeDistributionShift(dataset, comparison)
    expect(result.medianRelativeChange).toBeNull()
    expect(result.avgRelativeChange).toBeNull()
    expect(result.medianDelta).toBe(10)
    expect(result.avgDelta).toBe(5)
  })
})

// ── deriveColumnInsights ────────────────────────────────────────────

describe('deriveColumnInsights', () => {
  it('returns histogram insights for histogram kind', () => {
    const bins = [bin(0, 10, 50), bin(10, 20, 30), bin(20, 30, 20)]
    const result = deriveColumnInsights({
      column: 'year',
      kind: 'histogram',
      histogram: {
        dataset: { bins, totalCount: 100 },
        selection: null,
        filtered: null,
      },
    })
    expect(result.column).toBe('year')
    expect(result.kind).toBe('histogram')
    expect(result.peakBin).not.toBeNull()
    expect(result.histogramConcentration).not.toBeNull()
    expect(result.categoricalConcentration).toBeNull()
    expect(result.diversity).toBeNull()
  })

  it('returns categorical insights for bars kind', () => {
    const rows = [facetRow('a', 60), facetRow('b', 30), facetRow('c', 10)]
    const result = deriveColumnInsights({
      column: 'journal',
      kind: 'bars',
      facetRows: rows,
    })
    expect(result.peakBin).toBeNull()
    expect(result.histogramConcentration).toBeNull()
    expect(result.categoricalConcentration).not.toBeNull()
    expect(result.diversity).not.toBeNull()
    expect(result.dominantValue).not.toBeNull()
  })

  it('returns null insights when histogram kind but no bins', () => {
    const result = deriveColumnInsights({
      column: 'year',
      kind: 'histogram',
    })
    expect(result.peakBin).toBeNull()
    expect(result.shape).toBeNull()
  })

  it('populates selectionShift when stats have selection', () => {
    const dataset = statsRow({ median: 50, avg: 55 })
    const selection = statsRow({ median: 60, avg: 65 })
    const result = deriveColumnInsights({
      column: 'year',
      kind: 'histogram',
      histogram: {
        dataset: { bins: [bin(0, 10, 50), bin(10, 20, 30), bin(20, 30, 20)], totalCount: 100 },
        selection: null,
        filtered: null,
      },
      stats: { dataset, selection, filtered: null },
    })
    expect(result.selectionShift).not.toBeNull()
    expect(result.selectionShift!.medianDelta).toBe(10)
  })
})
