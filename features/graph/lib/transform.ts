import { coerceNullableNumber, coerceNullableString } from '@/lib/helpers'
import { NOISE_COLOR, NOISE_COLOR_LIGHT } from './brand-colors'
import { getPaletteColors, hexToHsl, hslToHex } from './colors'
import type {
  AliasNode,
  ChunkNode,
  ClusterInfo,
  GeoNode,
  GraphData,
  GraphFacet,
  GraphNode,
  GraphNodeBase,
  GraphStats,
  PaperNode,
  RelationAssertionNode,
  TermNode,
} from '@/features/graph/types'

/* ─── Per-paper shade within cluster ──────────────────────── */

/** Shift lightness of a hex color by a paper index within its cluster. */
function shadeByPaper(hex: string, paperIndex: number): string {
  const { h, s, l } = hexToHsl(hex)
  // Alternate lighter/darker: index 0 = base, 1 = +2L, 2 = -2L, 3 = +4L, ...
  const step = Math.ceil(paperIndex / 2) * 2
  const offset = paperIndex % 2 === 0 ? 0 : (paperIndex % 4 < 2 ? step : -step)
  return hslToHex(h, s, Math.max(30, Math.min(80, l + offset)))
}

/* ─── Cluster color resolution ────────────────────────────── */

function resolveClusterColors(
  clusterId: number,
  palette: string[],
  paletteLight: string[],
): { color: string; colorLight: string } {
  return {
    color: clusterId <= 0 ? NOISE_COLOR : palette[clusterId % palette.length],
    colorLight: clusterId <= 0 ? NOISE_COLOR_LIGHT : paletteLight[clusterId % paletteLight.length],
  }
}

/* ─── Base node factory ───────────────────────────────────── */

function buildBaseNode(
  overrides: Partial<GraphNodeBase> & Pick<GraphNodeBase, 'id' | 'x' | 'y' | 'index' | 'color' | 'colorLight' | 'clusterId'>,
): GraphNodeBase {
  return {
    clusterLabel: null,
    clusterProbability: 0,
    outlierScore: 0,
    paperId: null,
    paperTitle: null,
    citekey: null,
    year: null,
    journal: null,
    doi: null,
    pmid: null,
    pmcid: null,
    displayLabel: null,
    searchText: null,
    chunkPreview: null,
    canonicalName: null,
    category: null,
    semanticGroups: null,
    organSystems: null,
    mentionCount: null,
    paperCount: null,
    chunkCount: null,
    relationCount: null,
    aliasCount: null,
    relationType: null,
    relationCategory: null,
    relationDirection: null,
    relationCertainty: null,
    assertionStatus: null,
    evidenceStatus: null,
    aliasText: null,
    aliasType: null,
    aliasQualityScore: null,
    aliasSource: null,
    nodeRole: 'primary',
    isDefaultVisible: true,
    payloadJson: null,
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
    ...overrides,
  }
}

/* ─── Row types ───────────────────────────────────────────── */

export interface GraphPointRow {
  alias_count: number | null
  alias_quality_score: number | null
  alias_source: string | null
  alias_text: string | null
  alias_type: string | null
  assertion_status: string | null
  canonical_name: string | null
  category: string | null
  definition: string | null
  semantic_types_csv: string | null
  aliases_csv: string | null
  char_count: number | null
  chunk_count: number | string | null
  chunk_index: number | null
  chunk_kind: string | null
  chunk_preview: string | null
  display_label: string | null
  display_preview: string | null
  citekey: string | null
  cluster_id: number | null
  cluster_label: string | null
  cluster_probability: number | null
  doi: string | null
  evidence_status: string | null
  has_figure_context: boolean | null
  has_table_context: boolean | null
  id: string
  is_default_visible: boolean | null
  journal: string | null
  mention_count: number | null
  node_kind: string | null
  node_role: string | null
  node_id: string
  organ_systems_csv: string | null
  outlier_score: number | null
  paper_asset_count: number | null
  paper_author_count: number | null
  paper_chunk_count: number | null
  paper_cluster_index: number | null
  paper_entity_count: number | string | null
  paper_figure_count: number | null
  paper_id: string
  paper_page_count: number | null
  paper_count: number | string | null
  paper_reference_count: number | null
  paper_relation_count: number | string | null
  paper_sentence_count: number | null
  paper_table_count: number | null
  page_number: number | null
  payload_json: string | null
  point_index: number | null
  pmcid: string | null
  pmid: number | string | null
  relation_category: string | null
  relation_certainty: string | null
  relation_count: number | string | null
  relation_direction: string | null
  relation_type: string | null
  search_text: string | null
  semantic_groups_csv: string | null
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

export function buildStatsForNodes(
  nodes: GraphNode[],
  { pointLabel }: { pointLabel: string },
): GraphStats {
  const paperIds = new Set<string>()
  const clusterIds = new Set<number>()
  let noiseCount = 0
  for (const n of nodes) {
    if (n.paperId) paperIds.add(n.paperId)
    if (n.clusterId === 0) noiseCount++
    if (Number.isFinite(n.clusterId) && n.clusterId > 0) clusterIds.add(n.clusterId)
  }
  return {
    points: nodes.length,
    pointLabel,
    papers: paperIds.size,
    clusters: clusterIds.size,
    noise: noiseCount,
  }
}

export function buildGraphData({
  points,
  clusters,
  facets,
}: BuildGraphDataArgs): GraphData {
  const darkPalette = getPaletteColors('default', 'dark')
  const lightPalette = getPaletteColors('default', 'light')
  const nodes: GraphNode[] = []

  for (const [index, row] of points.entries()) {
    const clusterId = row.cluster_id ?? 0
    const paperIdx = row.paper_cluster_index ?? 0
    const clusterColors = resolveClusterColors(clusterId, darkPalette, lightPalette)
    const color = clusterId <= 0 || paperIdx === 0
      ? clusterColors.color
      : shadeByPaper(clusterColors.color, paperIdx)
    const colorLight = clusterId <= 0 || paperIdx === 0
      ? clusterColors.colorLight
      : shadeByPaper(clusterColors.colorLight, paperIdx)

    const base = buildBaseNode({
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
      paperId: row.paper_id ?? null,
      paperTitle: row.title ?? null,
      citekey: row.citekey ?? null,
      year: row.year ?? null,
      journal: row.journal,
      doi: row.doi,
      pmid: coerceNullableString(row.pmid),
      pmcid: row.pmcid,
      displayLabel: row.display_label ?? row.title ?? row.canonical_name ?? row.alias_text ?? row.relation_type ?? row.chunk_preview ?? row.node_id,
      searchText: row.search_text ?? null,
      chunkPreview: row.chunk_preview ?? row.display_preview ?? null,
      canonicalName: row.canonical_name ?? null,
      category: row.category ?? null,
      semanticGroups: row.semantic_groups_csv ?? null,
      organSystems: row.organ_systems_csv ?? null,
      mentionCount: coerceNullableNumber(row.mention_count),
      paperCount: coerceNullableNumber(row.paper_count),
      chunkCount: coerceNullableNumber(row.chunk_count ?? row.paper_chunk_count),
      relationCount: coerceNullableNumber(row.relation_count ?? row.paper_relation_count),
      aliasCount: coerceNullableNumber(row.alias_count),
      relationType: row.relation_type ?? null,
      relationCategory: row.relation_category ?? null,
      relationDirection: row.relation_direction ?? null,
      relationCertainty: row.relation_certainty ?? null,
      assertionStatus: row.assertion_status ?? null,
      evidenceStatus: row.evidence_status ?? null,
      aliasText: row.alias_text ?? null,
      aliasType: row.alias_type ?? null,
      aliasQualityScore: coerceNullableNumber(row.alias_quality_score),
      aliasSource: row.alias_source ?? null,
      nodeRole: (row.node_role === 'overlay' ? 'overlay' : 'primary') as 'overlay' | 'primary',
      isDefaultVisible: Boolean(row.is_default_visible ?? true),
      payloadJson: row.payload_json ?? null,
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
    })

    const nodeKind = (row.node_kind ?? 'chunk') as GraphNode['nodeKind']
    if (nodeKind === 'paper') {
      nodes.push({
        ...base,
        nodeKind: 'paper',
        displayPreview: row.display_preview ?? row.chunk_preview ?? null,
        payloadWasTruncated: false,
      } satisfies PaperNode)
      continue
    }
    if (nodeKind === 'term') {
      nodes.push({
        ...base,
        nodeKind: 'term',
        definition: row.definition ?? null,
        semanticTypes: row.semantic_types_csv ?? null,
        aliasesCsv: row.aliases_csv ?? null,
      } satisfies TermNode)
      continue
    }
    if (nodeKind === 'relation_assertion') {
      nodes.push({
        ...base,
        nodeKind: 'relation_assertion',
      } satisfies RelationAssertionNode)
      continue
    }
    if (nodeKind === 'alias') {
      nodes.push({
        ...base,
        nodeKind: 'alias',
      } satisfies AliasNode)
      continue
    }
    nodes.push({
      ...base,
      nodeKind: 'chunk',
      stableChunkId: row.stable_chunk_id,
      chunkIndex: row.chunk_index ?? null,
      sectionCanonical: row.section_canonical,
      pageNumber: row.page_number ?? null,
      tokenCount: row.token_count ?? null,
      charCount: row.char_count ?? null,
      chunkKind: row.chunk_kind,
      hasTableContext: Boolean(row.has_table_context),
      hasFigureContext: Boolean(row.has_figure_context),
    } satisfies ChunkNode)
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

  // Re-index paper nodes 0-based to match paper_points_web ROW_NUMBER() OVER (ORDER BY index) - 1
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
  paper_cluster_index: number | null
}

export function buildPaperNodes(rows: PaperPointRow[]): PaperNode[] {
  const darkPalette = getPaletteColors('default', 'dark')
  const lightPalette = getPaletteColors('default', 'light')
  const nodes: PaperNode[] = []

  for (const [index, row] of rows.entries()) {
    const clusterId = row.cluster_id ?? 0
    const { color, colorLight } = resolveClusterColors(clusterId, darkPalette, lightPalette)

    nodes.push({
      ...buildBaseNode({
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
        displayLabel: row.title ?? row.citekey ?? row.node_id,
        chunkPreview: row.chunk_preview ?? row.display_preview,
        paperCount: 1,
        chunkCount: coerceNullableNumber(row.paper_chunk_count),
        relationCount: coerceNullableNumber(row.paper_relation_count),
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
      }),
      nodeKind: 'paper',
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
    const base = resolveClusterColors(clusterId, darkPalette, lightPalette)
    const color = row.color_hex ?? base.color
    const colorLight = base.colorLight

    nodes.push({
      ...buildBaseNode({
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
        year: row.first_year ?? null,
        displayLabel: row.institution ?? row.node_id,
        chunkPreview: row.institution ?? null,
        paperAuthorCount: row.author_count ?? null,
      }),
      nodeKind: 'institution',
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
