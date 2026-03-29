import type { ClusterInfo, GraphStats, PaperNode } from '@/features/graph/types'
import type { GraphPointRow } from './row-types'
import { buildGraphNode } from './graph-nodes'

/* ─── Paper node builder ─────────────────────────────────────── */

export function buildPaperNodes(rows: GraphPointRow[]): PaperNode[] {
  const nodes: PaperNode[] = []

  for (const [index, row] of rows.entries()) {
    const node = buildGraphNode(row, index)
    nodes.push({
      ...node,
      nodeKind: 'paper',
      displayPreview: row.display_preview ?? null,
      payloadWasTruncated: false,
    })
  }

  return nodes
}

export function buildPaperStats(
  paperNodes: PaperNode[],
  clusters: ClusterInfo[]
): GraphStats {
  const noiseCount = paperNodes.filter((node) => node.clusterId === 0).length
  return {
    points: paperNodes.length,
    pointLabel: 'papers',
    papers: paperNodes.length,
    clusters: clusters.filter((c) => !c.isNoise).length,
    noise: noiseCount,
  }
}
