import { coerceNullableNumber, coerceNullableString } from '../helpers'
import { getPaletteColors } from './colors'
import { NOISE_COLOR, NOISE_COLOR_LIGHT } from './brand-colors'
import type {
  ChunkNode,
  ClusterInfo,
  GeoNode,
  GraphData,
  GraphFacet,
  GraphStats,
  PaperNode,
} from './types'

export interface GraphPointRow {
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
  point_index: number | null
  pmcid: string | null
  pmid: number | string | null
  section_canonical: string | null
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
  const darkPalette = getPaletteColors('default', 'dark')
  const lightPalette = getPaletteColors('default', 'light')
  const nodes: ChunkNode[] = []

  for (const [index, row] of points.entries()) {
    const clusterId = row.cluster_id ?? 0
    const color = clusterId <= 0
      ? NOISE_COLOR
      : darkPalette[clusterId % darkPalette.length]
    const colorLight = clusterId <= 0
      ? NOISE_COLOR_LIGHT
      : lightPalette[clusterId % lightPalette.length]

    nodes.push({
      nodeKind: 'chunk',
      index: row.point_index ?? index,
      id: row.node_id,
      x: row.x,
      y: row.y,
      color,
      colorLight,
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
      sectionCanonical: row.section_canonical,
      pageNumber: row.page_number ?? null,
      tokenCount: row.token_count ?? null,
      charCount: row.char_count ?? null,
      chunkKind: row.chunk_kind,
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
    points: nodes.length,
    pointLabel: 'chunks',
    papers: uniquePapers.size,
    clusters: clusterInfo.filter((cluster) => !cluster.isNoise).length,
    noise: noiseCount,
  }

  return {
    nodes,
    clusters: clusterInfo,
    facets: graphFacets,
    paperNodes: [],
    geoNodes: [],
    paperStats: null,
    geoStats: null,
    stats,
  }
}

/* ─── Paper node builder ─────────────────────────────────────── */

export interface PaperPointRow {
  id: string
  node_id: string
  paper_id: string
  x: number
  y: number
  point_index: number | null
  cluster_id: number | null
  cluster_label: string | null
  cluster_probability: number | null
  outlier_score: number | null
  citekey: string | null
  title: string | null
  journal: string | null
  year: number | null
  doi: string | null
  pmid: number | string | null
  pmcid: string | null
  chunk_preview: string | null
  display_preview: string | null
  payload_was_truncated: boolean | null
  paper_author_count: number | null
  paper_reference_count: number | null
  paper_asset_count: number | null
  paper_chunk_count: number | null
  paper_entity_count: number | string | null
  paper_relation_count: number | string | null
  paper_sentence_count: number | null
  paper_page_count: number | null
  paper_table_count: number | null
  paper_figure_count: number | null
}

export function buildPaperNodes(rows: PaperPointRow[]): PaperNode[] {
  const darkPalette = getPaletteColors('default', 'dark')
  const lightPalette = getPaletteColors('default', 'light')
  const nodes: PaperNode[] = []

  for (const [index, row] of rows.entries()) {
    const clusterId = row.cluster_id ?? 0
    const color = clusterId <= 0
      ? NOISE_COLOR
      : darkPalette[clusterId % darkPalette.length]
    const colorLight = clusterId <= 0
      ? NOISE_COLOR_LIGHT
      : lightPalette[clusterId % lightPalette.length]

    nodes.push({
      nodeKind: 'paper',
      index: row.point_index ?? index,
      id: row.node_id,
      x: row.x,
      y: row.y,
      color,
      colorLight,
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
      chunkPreview: row.chunk_preview ?? row.display_preview,
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
      displayPreview: row.display_preview ?? null,
      payloadWasTruncated: Boolean(row.payload_was_truncated),
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

/* ─── Geo node builder ──────────────────────────────────────── */

export interface GeoPointRow {
  point_index: number | null
  id: string
  node_id: string
  x: number
  y: number
  cluster_id: number | null
  cluster_label: string | null
  color_hex: string | null
  size_value: number | null
  institution: string | null
  ror_id: string | null
  city: string | null
  region: string | null
  country: string | null
  country_code: string | null
  paper_count: number | null
  author_count: number | null
  first_year: number | null
  last_year: number | null
}

export function buildGeoNodes(rows: GeoPointRow[]): GeoNode[] {
  const darkPalette = getPaletteColors('default', 'dark')
  const lightPalette = getPaletteColors('default', 'light')
  const nodes: GeoNode[] = []

  for (const [index, row] of rows.entries()) {
    const clusterId = row.cluster_id ?? 0
    const color = row.color_hex
      ?? (clusterId <= 0 ? NOISE_COLOR : darkPalette[clusterId % darkPalette.length])
    const colorLight = clusterId <= 0
      ? NOISE_COLOR_LIGHT
      : lightPalette[clusterId % lightPalette.length]

    nodes.push({
      nodeKind: 'institution',
      index: row.point_index ?? index,
      id: row.node_id ?? row.id,
      x: row.x,
      y: row.y,
      color,
      colorLight,
      clusterId,
      clusterLabel: row.cluster_label,
      clusterProbability: 1,
      outlierScore: 0,
      paperId: '',
      paperTitle: '',
      citekey: '',
      year: row.first_year ?? null,
      journal: null,
      doi: null,
      pmid: null,
      pmcid: null,
      chunkPreview: row.institution ?? null,
      paperAuthorCount: row.author_count ?? null,
      paperReferenceCount: null,
      paperAssetCount: null,
      paperChunkCount: null,
      paperEntityCount: null,
      paperRelationCount: null,
      paperSentenceCount: null,
      paperPageCount: null,
      paperTableCount: null,
      paperFigureCount: null,
      institution: row.institution ?? null,
      rorId: row.ror_id ?? null,
      city: row.city ?? null,
      region: row.region ?? null,
      country: row.country ?? null,
      countryCode: row.country_code ?? null,
      paperCount: row.paper_count ?? 0,
      authorCount: row.author_count ?? 0,
      firstYear: row.first_year ?? null,
      lastYear: row.last_year ?? null,
    })
  }

  return nodes
}

export function buildGeoStats(geoNodes: GeoNode[]): GraphStats {
  const countries = new Set(geoNodes.map((n) => n.countryCode).filter(Boolean))
  return {
    points: geoNodes.length,
    pointLabel: 'institutions',
    papers: geoNodes.reduce((sum, n) => sum + n.paperCount, 0),
    clusters: countries.size,
    noise: 0,
  }
}
