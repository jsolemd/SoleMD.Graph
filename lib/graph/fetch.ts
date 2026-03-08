import 'server-only'
import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { getClusterColor } from './colors'
import type { ChunkNode, ClusterExemplar, ClusterInfo, GraphData, GraphStats } from './types'

export const fetchGraphData = cache(async (): Promise<GraphData> => {
  const supabase = createServerClient()

  const [pointsResult, papersResult, clustersResult, exemplarsResult] =
    await Promise.all([
      supabase
        .from('graph_points_current')
        .select('node_id, paper_id, x, y, cluster_id, cluster_label, cluster_probability, outlier_score')
        .eq('graph_name', 'cosmograph')
        .eq('node_kind', 'rag_chunk')
        .limit(5000),
      supabase
        .from('papers')
        .select('id, title, citekey, year'),
      supabase
        .from('graph_clusters_current')
        .select('cluster_id, label, member_count, centroid_x, centroid_y')
        .eq('graph_name', 'cosmograph')
        .eq('node_kind', 'rag_chunk'),
      supabase
        .from('graph_cluster_exemplars_current')
        .select('cluster_id, rank, rag_chunk_id, exemplar_score, is_representative, chunk_text, paper_id')
        .eq('graph_name', 'cosmograph')
        .eq('node_kind', 'rag_chunk')
        .lte('rank', 5),
    ])

  if (pointsResult.error) throw new Error(`points: ${pointsResult.error.message}`)
  if (papersResult.error) throw new Error(`papers: ${papersResult.error.message}`)
  if (clustersResult.error) throw new Error(`clusters: ${clustersResult.error.message}`)
  if (exemplarsResult.error) throw new Error(`exemplars: ${exemplarsResult.error.message}`)

  // Index papers by ID for O(1) lookup
  const papersById = new Map(
    papersResult.data.map((p: Record<string, unknown>) => [p.id as string, p])
  )

  const clusterColors: Record<number, string> = {}
  const nodes: ChunkNode[] = []
  let nodeIndex = 0

  for (const row of pointsResult.data) {
    const paper = papersById.get(row.paper_id as string)
    if (!paper) continue

    const clusterId = (row.cluster_id as number) ?? 0
    const color = getClusterColor(clusterId)
    clusterColors[clusterId] = color

    nodes.push({
      index: nodeIndex++,
      id: row.node_id as string,
      x: row.x as number,
      y: row.y as number,
      color,
      clusterId,
      clusterLabel: row.cluster_label as string | null,
      clusterProbability: (row.cluster_probability as number) ?? 0,
      outlierScore: (row.outlier_score as number) ?? 0,
      paperId: row.paper_id as string,
      paperTitle: paper.title as string,
      citekey: paper.citekey as string,
      year: (paper.year as number) ?? null,
    })
  }

  // Build cluster info
  const clusters: ClusterInfo[] = clustersResult.data.map((row: Record<string, unknown>) => ({
    clusterId: row.cluster_id as number,
    label: row.label as string,
    memberCount: row.member_count as number,
    centroidX: row.centroid_x as number,
    centroidY: row.centroid_y as number,
  }))

  // Build exemplars
  const exemplars: ClusterExemplar[] = exemplarsResult.data.map((row: Record<string, unknown>) => ({
    clusterId: row.cluster_id as number,
    rank: row.rank as number,
    ragChunkId: row.rag_chunk_id as string,
    paperId: row.paper_id as string,
    chunkText: row.chunk_text as string,
    exemplarScore: row.exemplar_score as number,
    isRepresentative: row.is_representative as boolean,
  }))

  const uniquePapers = new Set(nodes.map((n) => n.paperId))
  const noiseCount = nodes.filter((n) => n.clusterId === 0).length

  const stats: GraphStats = {
    chunks: nodes.length,
    papers: uniquePapers.size,
    clusters: clusters.filter((c) => c.clusterId !== 0).length,
    noise: noiseCount,
  }

  return { nodes, clusters, exemplars, stats, clusterColors }
})
