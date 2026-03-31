import type { GraphInfoHistogramBin } from "@/features/graph/types";
import type { InfoComparisonFacetRow, InfoHistogramComparison } from "@/features/graph/components/explore/info/comparison-layers";
import type { NumericStatsComparison } from "@/features/graph/components/explore/info-panel/use-info-widget-data";
import type { NumericStatsRow } from "@/features/graph/duckdb/queries/summary";

// ── Individual metric results ────────────────────────────────────────

export interface HistogramPeakBin {
  binIndex: number
  midpoint: number
  count: number
  fraction: number
}

export interface DistributionShape {
  direction: "left-skewed" | "right-skewed" | "symmetric"
  skewCoefficient: number
}

export interface ConcentrationRatio {
  topNFraction: number
  n: number
}

export interface CategoricalDiversity {
  normalizedEntropy: number
  uniqueCount: number
}

export interface DominantValue {
  value: string
  count: number
  fraction: number
}

export interface NumericSpread {
  relativeRange: number
}

export interface DistributionShift {
  medianDelta: number
  medianRelativeChange: number | null
  avgDelta: number
  avgRelativeChange: number | null
}

// ── Composite container ──────────────────────────────────────────────

export interface ColumnInsight {
  column: string
  kind: "histogram" | "bars" | "facet-summary"
  peakBin: HistogramPeakBin | null
  shape: DistributionShape | null
  histogramConcentration: ConcentrationRatio | null
  categoricalConcentration: ConcentrationRatio | null
  diversity: CategoricalDiversity | null
  dominantValue: DominantValue | null
  spread: NumericSpread | null
  skewIndicator: DistributionShape | null
  selectionShift: DistributionShift | null
  filteredShift: DistributionShift | null
}

// ── Pure metric functions ────────────────────────────────────────────

export function computePeakBin(
  bins: GraphInfoHistogramBin[],
  totalCount: number,
): HistogramPeakBin | null {
  if (bins.length === 0 || totalCount <= 0) return null
  let best = 0
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].count > bins[best].count) best = i
  }
  const bin = bins[best]
  return {
    binIndex: best,
    midpoint: (bin.min + bin.max) / 2,
    count: bin.count,
    fraction: bin.count / totalCount,
  }
}

export function computeDistributionShape(
  bins: GraphInfoHistogramBin[],
  totalCount: number,
  stats?: { avg: number; median: number } | null,
): DistributionShape | null {
  if (bins.length < 3 || totalCount <= 0) return null

  let coeff: number
  if (stats && stats.avg !== stats.median) {
    // Pearson's second skewness coefficient approximation
    let variance = 0
    for (const bin of bins) {
      const mid = (bin.min + bin.max) / 2
      variance += bin.count * (mid - stats.avg) ** 2
    }
    const stdDev = Math.sqrt(variance / totalCount)
    coeff = stdDev > 0 ? (3 * (stats.avg - stats.median)) / stdDev : 0
  } else {
    // Fall back to bin-midpoint estimation
    let mean = 0
    for (const bin of bins) {
      mean += bin.count * ((bin.min + bin.max) / 2)
    }
    mean /= totalCount
    let m2 = 0
    let m3 = 0
    for (const bin of bins) {
      const mid = (bin.min + bin.max) / 2
      const diff = mid - mean
      m2 += bin.count * diff ** 2
      m3 += bin.count * diff ** 3
    }
    const stdDev = Math.sqrt(m2 / totalCount)
    coeff = stdDev > 0 ? m3 / totalCount / stdDev ** 3 : 0
  }

  const direction =
    Math.abs(coeff) < 0.15
      ? "symmetric"
      : coeff > 0
        ? "right-skewed"
        : "left-skewed"

  return { direction, skewCoefficient: coeff }
}

export function computeHistogramConcentration(
  bins: GraphInfoHistogramBin[],
  totalCount: number,
  topN = 3,
): ConcentrationRatio | null {
  if (bins.length === 0 || totalCount <= 0) return null
  const sorted = [...bins].sort((a, b) => b.count - a.count)
  const topSum = sorted.slice(0, topN).reduce((s, b) => s + b.count, 0)
  return { topNFraction: topSum / totalCount, n: Math.min(topN, bins.length) }
}

export function computeCategoricalConcentration(
  rows: InfoComparisonFacetRow[],
  topN = 3,
): ConcentrationRatio | null {
  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.totalCount, 0)
  if (total <= 0) return null
  const topSum = rows.slice(0, topN).reduce((s, r) => s + r.totalCount, 0)
  return { topNFraction: topSum / total, n: Math.min(topN, rows.length) }
}

export function computeDiversity(
  rows: InfoComparisonFacetRow[],
): CategoricalDiversity | null {
  const uniqueCount = rows.length
  if (uniqueCount <= 1) return null
  const total = rows.reduce((s, r) => s + r.totalCount, 0)
  if (total <= 0) return null
  let entropy = 0
  for (const row of rows) {
    if (row.totalCount > 0) {
      const p = row.totalCount / total
      entropy -= p * Math.log(p)
    }
  }
  return { normalizedEntropy: entropy / Math.log(uniqueCount), uniqueCount }
}

export function computeDominantValue(
  rows: InfoComparisonFacetRow[],
): DominantValue | null {
  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.totalCount, 0)
  if (total <= 0) return null
  const first = rows[0]
  return { value: first.value, count: first.totalCount, fraction: first.totalCount / total }
}

export function computeSpread(stats: NumericStatsRow): NumericSpread | null {
  if (stats.max === stats.min) return null
  const denom = Math.abs(stats.median)
  if (denom === 0) return null
  return { relativeRange: (stats.max - stats.min) / denom }
}

export function computeDistributionShift(
  dataset: NumericStatsRow,
  comparison: NumericStatsRow,
): DistributionShift {
  const medianDelta = comparison.median - dataset.median
  const avgDelta = comparison.avg - dataset.avg
  return {
    medianDelta,
    medianRelativeChange: dataset.median !== 0 ? medianDelta / Math.abs(dataset.median) : null,
    avgDelta,
    avgRelativeChange: dataset.avg !== 0 ? avgDelta / Math.abs(dataset.avg) : null,
  }
}

// ── Top-level composer ───────────────────────────────────────────────

export function deriveColumnInsights(args: {
  column: string
  kind: "histogram" | "bars" | "facet-summary"
  facetRows?: InfoComparisonFacetRow[] | null
  histogram?: InfoHistogramComparison | null
  stats?: NumericStatsComparison | null
}): ColumnInsight {
  const { column, kind, facetRows, histogram, stats } = args

  const bins = histogram?.dataset.bins ?? []
  const totalCount = histogram?.dataset.totalCount ?? 0
  const datasetStats = stats?.dataset ?? null

  const isHistogram = kind === "histogram" && bins.length > 0

  return {
    column,
    kind,
    peakBin: isHistogram ? computePeakBin(bins, totalCount) : null,
    shape: isHistogram ? computeDistributionShape(bins, totalCount, datasetStats) : null,
    histogramConcentration: isHistogram ? computeHistogramConcentration(bins, totalCount) : null,
    categoricalConcentration:
      kind !== "histogram" && facetRows?.length
        ? computeCategoricalConcentration(facetRows)
        : null,
    diversity:
      kind !== "histogram" && facetRows?.length ? computeDiversity(facetRows) : null,
    dominantValue:
      kind !== "histogram" && facetRows?.length ? computeDominantValue(facetRows) : null,
    spread: datasetStats ? computeSpread(datasetStats) : null,
    skewIndicator:
      datasetStats
        ? computeDistributionShape(bins, totalCount, datasetStats)
        : null,
    selectionShift:
      stats?.selection && datasetStats
        ? computeDistributionShift(datasetStats, stats.selection)
        : null,
    filteredShift:
      stats?.filtered && datasetStats
        ? computeDistributionShift(datasetStats, stats.filtered)
        : null,
  }
}
