import { useMemo } from 'react'
import type { GraphNode, GraphStats, MapLayer } from '../types'
import { readNodeColumnValue } from '../info-widgets'

/* ─── Types ──────────────────────────────────────────────────── */

export interface ClusterStat {
  clusterId: number
  label: string
  count: number
}

export interface InfoStats {
  /** Total active-layer node count (denominator for proportions). */
  totalCount: number
  /** Scoped count — selection or full dataset. */
  scopedCount: number
  /** Whether we're showing a subset (selection active). */
  hasSelection: boolean

  papers: number
  clusters: number
  noise: number
  yearRange: { min: number; max: number } | null
  topClusters: ClusterStat[]
}

/* ─── Pure compute ───────────────────────────────────────────── */

/**
 * Compute info-panel stats from scoped + all nodes.
 * Pure function — no hooks, testable in isolation.
 *
 * `hasSelection` is the single source of truth for selection state,
 * derived from `selectedPointIndices.length > 0` in the orchestrator.
 * This avoids each consumer inferring selection differently.
 */
export function computeInfoStats(
  allNodes: GraphNode[],
  scopedNodes: GraphNode[],
  _layer: MapLayer,
  stats: GraphStats,
  hasSelection: boolean,
): InfoStats {
  const paperIds = new Set<string>()
  const clusterCounts = new Map<number, { label: string; count: number }>()
  let noiseNodes = 0
  let yearMin = Infinity
  let yearMax = -Infinity
  let hasYear = false

  for (const n of scopedNodes) {
    paperIds.add(n.paperId)

    const existing = clusterCounts.get(n.clusterId)
    if (existing) {
      existing.count++
    } else {
      clusterCounts.set(n.clusterId, {
        label: n.clusterLabel ?? `Cluster ${n.clusterId}`,
        count: 1,
      })
    }

    if (n.clusterId <= 0) noiseNodes++

    const year = readNodeColumnValue(n, 'year')
    if (typeof year === 'number') {
      hasYear = true
      if (year < yearMin) yearMin = year
      if (year > yearMax) yearMax = year
    }
  }

  // Count distinct noise cluster IDs (e.g. -1 and 0 are separate buckets)
  let noiseBuckets = 0
  for (const id of clusterCounts.keys()) {
    if (id <= 0) noiseBuckets++
  }

  const topClusters = [...clusterCounts.entries()]
    .filter(([id]) => id > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([clusterId, info]) => ({ clusterId, ...info }))

  return {
    totalCount: hasSelection ? allNodes.length : stats.points,
    scopedCount: scopedNodes.length,
    hasSelection,
    papers: paperIds.size,
    clusters: clusterCounts.size - noiseBuckets,
    noise: noiseNodes,
    yearRange: hasYear ? { min: yearMin, max: yearMax } : null,
    topClusters,
  }
}

/* ─── React hook ─────────────────────────────────────────────── */

export function useInfoStats(
  allNodes: GraphNode[],
  scopedNodes: GraphNode[],
  layer: MapLayer,
  stats: GraphStats,
  hasSelection: boolean,
): InfoStats {
  return useMemo(
    () => computeInfoStats(allNodes, scopedNodes, layer, stats, hasSelection),
    [allNodes, scopedNodes, layer, stats, hasSelection],
  )
}
