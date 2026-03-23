import { computeInfoStats } from './use-info-stats'
import type { ChunkNode, GraphNode } from '@/features/graph/types'

function makeChunkNode(overrides: Partial<ChunkNode> = {}): ChunkNode {
  return {
    nodeKind: 'chunk',
    index: 0,
    id: 'chunk-0',
    x: 0,
    y: 0,
    color: '#fff',
    clusterId: 1,
    clusterLabel: 'Cluster 1',
    clusterProbability: 0.9,
    outlierScore: 0.1,
    paperId: 'paper-1',
    paperTitle: 'Test Paper',
    citekey: 'test2024',
    year: 2024,
    journal: 'Test Journal',
    doi: null,
    pmid: null,
    pmcid: null,
    chunkPreview: null,
    paperAuthorCount: null,
    paperReferenceCount: null,
    paperAssetCount: null,
    paperChunkCount: null,
    paperEntityCount: null,
    paperRelationCount: null,
    paperSentenceCount: null,
    paperPageCount: null,
    paperTableCount: null,
    paperFigureCount: null,
    stableChunkId: null,
    chunkIndex: null,
    sectionCanonical: 'Introduction',
    pageNumber: null,
    tokenCount: 100,
    charCount: null,
    chunkKind: null,
    hasTableContext: false,
    hasFigureContext: false,
    ...overrides,
  }
}

describe('computeInfoStats', () => {
  it('returns full dataset stats when no selection', () => {
    const nodes: GraphNode[] = [
      makeChunkNode({ index: 0, clusterId: 1, paperId: 'p1', year: 2020 }),
      makeChunkNode({ index: 1, clusterId: 2, paperId: 'p2', year: 2024 }),
    ]

    const result = computeInfoStats(nodes, nodes, 'dataset')

    expect(result.hasSelection).toBe(false)
    expect(result.totalCount).toBe(2)
    expect(result.scopedCount).toBe(2)
    expect(result.papers).toBe(2)
    expect(result.clusters).toBe(2)
    expect(result.yearRange).toEqual({ min: 2020, max: 2024 })
  })

  it('detects selection when scope is selected', () => {
    const allNodes: GraphNode[] = [
      makeChunkNode({ index: 0, clusterId: 1, paperId: 'p1', year: 2020 }),
      makeChunkNode({ index: 1, clusterId: 2, paperId: 'p2', year: 2024 }),
      makeChunkNode({ index: 2, clusterId: 3, paperId: 'p3', year: 2022 }),
    ]
    const scopedNodes = [allNodes[0]]

    const result = computeInfoStats(allNodes, scopedNodes, 'selected')

    expect(result.hasSelection).toBe(true)
    expect(result.totalCount).toBe(3)
    expect(result.scopedCount).toBe(1)
    expect(result.papers).toBe(1)
    expect(result.yearRange).toEqual({ min: 2020, max: 2020 })
  })

  it('reports hasSelection=true even when all points are selected', () => {
    const nodes: GraphNode[] = [
      makeChunkNode({ index: 0, clusterId: 1, paperId: 'p1' }),
      makeChunkNode({ index: 1, clusterId: 2, paperId: 'p2' }),
    ]

    // Select all points — hasSelection is still true because
    // scope is 'selected' from the orchestrator
    const result = computeInfoStats(nodes, nodes, 'selected')

    expect(result.hasSelection).toBe(true)
    expect(result.totalCount).toBe(2)
    expect(result.scopedCount).toBe(2)
  })

  it('counts noise nodes and subtracts all noise cluster buckets from cluster count', () => {
    const nodes: GraphNode[] = [
      makeChunkNode({ index: 0, clusterId: 1 }),
      makeChunkNode({ index: 1, clusterId: -1, clusterLabel: 'Noise' }),
      makeChunkNode({ index: 2, clusterId: 0, clusterLabel: 'Noise' }),
    ]

    const result = computeInfoStats(nodes, nodes, 'dataset')

    expect(result.noise).toBe(2)
    // 3 unique clusterIds (1, -1, 0) minus 2 noise buckets (-1, 0) = 1 real cluster
    expect(result.clusters).toBe(1)
    // topClusters excludes noise (clusterId <= 0)
    expect(result.topClusters).toHaveLength(1)
    expect(result.topClusters[0].clusterId).toBe(1)
  })

  it('handles empty node array', () => {
    const result = computeInfoStats([], [], 'dataset')

    expect(result.scopedCount).toBe(0)
    expect(result.papers).toBe(0)
    expect(result.clusters).toBe(0)
    expect(result.noise).toBe(0)
    expect(result.yearRange).toBeNull()
    expect(result.topClusters).toEqual([])
  })

  it('handles single node', () => {
    const nodes: GraphNode[] = [
      makeChunkNode({ index: 0, clusterId: 5, paperId: 'p1', year: 2023 }),
    ]

    const result = computeInfoStats(nodes, nodes, 'dataset')

    expect(result.scopedCount).toBe(1)
    expect(result.papers).toBe(1)
    expect(result.clusters).toBe(1)
    expect(result.yearRange).toEqual({ min: 2023, max: 2023 })
    expect(result.topClusters).toHaveLength(1)
  })

  it('limits topClusters to 8', () => {
    const nodes: GraphNode[] = Array.from({ length: 10 }, (_, i) =>
      makeChunkNode({ index: i, clusterId: i + 1, clusterLabel: `C${i + 1}` }),
    )

    const result = computeInfoStats(nodes, nodes, 'dataset')

    expect(result.topClusters.length).toBeLessThanOrEqual(8)
  })

  it('handles null years gracefully', () => {
    const nodes: GraphNode[] = [
      makeChunkNode({ index: 0, year: null }),
      makeChunkNode({ index: 1, year: null }),
    ]

    const result = computeInfoStats(nodes, nodes, 'dataset')

    expect(result.yearRange).toBeNull()
  })
})
