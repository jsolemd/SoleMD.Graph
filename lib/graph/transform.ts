import { coerceNullableNumber, coerceNullableString } from '../helpers'
import { getClusterColor } from './colors'
import type {
  ChunkNode,
  ClusterInfo,
  GraphData,
  GraphFacet,
  GraphStats,
} from './types'

export interface GraphPointRow {
  block_id: string | null
  block_type: string | null
  char_count: number | null
  chunk_index: number | null
  chunk_kind: string | null
  chunk_preview: string | null
  citekey: string | null
  cluster_id: number | null
  cluster_label: string | null
  cluster_probability: number | null
  doi: string | null
  has_figure_context: boolean | null
  has_table_context: boolean | null
  id: string
  journal: string | null
  node_id: string
  outlier_score: number | null
  paper_asset_count: number | null
  paper_author_count: number | null
  paper_chunk_count: number | null
  paper_entity_count: number | string | null
  paper_figure_count: number | null
  paper_id: string
  paper_page_count: number | null
  paper_reference_count: number | null
  paper_relation_count: number | string | null
  paper_sentence_count: number | null
  paper_table_count: number | null
  page_number: number | null
  pmcid: string | null
  pmid: number | string | null
  section_canonical: string | null
  section_path: string | null
  section_type: string | null
  stable_chunk_id: string | null
  title: string | null
  token_count: number | null
  x: number
  y: number
  year: number | null
}

export interface GraphClusterRow {
  candidate_count: number | null
  centroid_x: number
  centroid_y: number
  cluster_id: number
  entity_candidate_count: number | null
  is_noise: boolean | null
  label: string | null
  label_mode: string | null
  label_source: string | null
  lexical_candidate_count: number | null
  mean_cluster_probability: number | null
  mean_outlier_score: number | null
  member_count: number
  paper_count: number | null
  representative_rag_chunk_id: string | null
}

export interface GraphFacetRow {
  cluster_count: number | null
  facet_label: string | null
  facet_name: string
  facet_value: string
  paper_count: number | null
  point_count: number | null
  sort_key: string | null
}

interface BuildGraphDataArgs {
  clusters: GraphClusterRow[]
  facets: GraphFacetRow[]
  points: GraphPointRow[]
}

export function buildGraphData({
  points,
  clusters,
  facets,
}: BuildGraphDataArgs): GraphData {
  const clusterColors: Record<number, string> = {}
  const nodes: ChunkNode[] = []

  for (const [index, row] of points.entries()) {
    const clusterId = row.cluster_id ?? 0
    const color = getClusterColor(clusterId)
    clusterColors[clusterId] = color

    nodes.push({
      index,
      id: row.node_id,
      x: row.x,
      y: row.y,
      color,
      clusterId,
      clusterLabel: row.cluster_label,
      clusterProbability: row.cluster_probability ?? 0,
      outlierScore: row.outlier_score ?? 0,
      paperId: row.paper_id,
      paperTitle: row.title ?? 'Untitled paper',
      citekey: row.citekey ?? 'Uncited',
      year: row.year ?? null,
      journal: row.journal,
      doi: row.doi,
      pmid: coerceNullableString(row.pmid),
      pmcid: row.pmcid,
      stableChunkId: row.stable_chunk_id,
      chunkIndex: row.chunk_index ?? null,
      sectionType: row.section_type,
      sectionCanonical: row.section_canonical,
      sectionPath: row.section_path,
      pageNumber: row.page_number ?? null,
      tokenCount: row.token_count ?? null,
      charCount: row.char_count ?? null,
      chunkKind: row.chunk_kind,
      blockType: row.block_type,
      blockId: row.block_id,
      chunkPreview: row.chunk_preview,
      paperAuthorCount: row.paper_author_count ?? null,
      paperReferenceCount: row.paper_reference_count ?? null,
      paperAssetCount: row.paper_asset_count ?? null,
      paperChunkCount: row.paper_chunk_count ?? null,
      paperEntityCount: coerceNullableNumber(row.paper_entity_count),
      paperRelationCount: coerceNullableNumber(row.paper_relation_count),
      paperSentenceCount: row.paper_sentence_count ?? null,
      paperPageCount: row.paper_page_count ?? null,
      paperTableCount: row.paper_table_count ?? null,
      paperFigureCount: row.paper_figure_count ?? null,
      hasTableContext: Boolean(row.has_table_context),
      hasFigureContext: Boolean(row.has_figure_context),
    })
  }

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

  const uniquePapers = new Set(nodes.map((node) => node.paperId))
  const noiseCount = nodes.filter((node) => node.clusterId === 0).length

  const stats: GraphStats = {
    chunks: nodes.length,
    papers: uniquePapers.size,
    clusters: clusterInfo.filter((cluster) => !cluster.isNoise).length,
    noise: noiseCount,
  }

  return {
    nodes,
    clusters: clusterInfo,
    facets: graphFacets,
    stats,
    clusterColors,
  }
}
