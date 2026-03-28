import { useMemo } from 'react'
import type { GraphNode } from '@/features/graph/types'
import { readNodeColumnValue } from '@/features/graph/lib/info-widgets'
import type { GraphInfoScope } from '@/features/graph/types'

/* ─── Types ──────────────────────────────────────────────────── */

export interface ClusterStat {
  clusterId: number
  label: string
  count: number
}

export type InfoScope = GraphInfoScope

export interface InfoStats {
  /** Total active-layer node count (denominator for proportions). */
  totalCount: number
  /** Scoped count — selection or full dataset. */
  scopedCount: number
  /** Current info-panel scope. */
  scope: InfoScope
  /** Whether we're showing a subset rather than the full dataset. */
  isSubset: boolean
  /** Whether the scope is driven by explicit selection intent. */
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
 * `scope` is the single source of truth for info-panel scoping:
 * dataset baseline, current working set, or explicit selection intent.
 */
export function computeInfoStats(
  allNodes: GraphNode[],
  scopedNodes: GraphNode[],
  scope: InfoScope,
): InfoStats {
  const hasSelection = scope === 'selected'
  const totalCount = allNodes.length
  const isSubset = scopedNodes.length < totalCount
  const paperIds = new Set<string>()
  const clusterCounts = new Map<number, { label: string; count: number }>()
  let noiseNodes = 0
  let yearMin = Infinity
  let yearMax = -Infinity
  let hasYear = false

  for (const n of scopedNodes) {
    if (n.paperId) {
      paperIds.add(n.paperId)
    }

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
    totalCount,
    scopedCount: scopedNodes.length,
    scope,
    isSubset,
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
  scope: InfoScope,
): InfoStats {
  return useMemo(
    () => computeInfoStats(allNodes, scopedNodes, scope),
    [allNodes, scopedNodes, scope],
  )
}
