import type {
  ClusterInfo,
  GraphData,
  GraphFacet,
  PaperNode,
} from '@/features/graph/types'
import type { BuildGraphDataArgs } from './row-types'
import { buildGraphNode, buildStatsForNodes } from './graph-nodes'

export function buildGraphData({
  points,
  clusters,
  facets,
}: BuildGraphDataArgs): GraphData {
  const nodes = points.map((row, index) => buildGraphNode(row, index))

  const clusterInfo: ClusterInfo[] = clusters.map((cluster) => ({
    clusterId: cluster.cluster_id,
    label: cluster.label ?? (cluster.cluster_id === 0 ? 'Noise' : `Cluster ${cluster.cluster_id}`),
    labelMode: cluster.label_mode,
    labelSource: cluster.label_source,
    memberCount: cluster.member_count,
    centroidX: cluster.centroid_x,
    centroidY: cluster.centroid_y,
    representativeRagChunkId: cluster.representative_rag_chunk_id,
    candidateCount: cluster.candidate_count ?? null,
    entityCandidateCount: cluster.entity_candidate_count ?? null,
    lexicalCandidateCount: cluster.lexical_candidate_count ?? null,
    meanClusterProbability: cluster.mean_cluster_probability ?? null,
    meanOutlierScore: cluster.mean_outlier_score ?? null,
    paperCount: cluster.paper_count ?? null,
    isNoise: Boolean(cluster.is_noise ?? cluster.cluster_id === 0),
  }))

  const graphFacets: GraphFacet[] = facets.map((facet) => ({
    facetName: facet.facet_name,
    facetValue: facet.facet_value,
    facetLabel: facet.facet_label,
    pointCount: facet.point_count ?? 0,
    paperCount: facet.paper_count ?? 0,
    clusterCount: facet.cluster_count ?? 0,
    sortKey: facet.sort_key,
  }))

  // Re-index paper nodes 0-based to match active_paper_points_web ROW_NUMBER() OVER (ORDER BY index) - 1
  const paperNodes = nodes
    .filter((node): node is PaperNode => node.nodeKind === 'paper')
    .sort((a, b) => a.index - b.index)
    .map((node, i) => ({ ...node, index: i }))
  const stats = buildStatsForNodes(nodes, { pointLabel: 'nodes' })

  return {
    nodes,
    clusters: clusterInfo,
    facets: graphFacets,
    paperNodes,
    geoNodes: [],
    geoLinks: [],
    geoCitationLinks: [],
    paperStats: buildStatsForNodes(paperNodes, { pointLabel: 'papers' }),
    geoStats: null,
    stats,
  }
}
