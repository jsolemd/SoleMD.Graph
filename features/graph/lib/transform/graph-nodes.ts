import { coerceNullableNumber, coerceNullableString } from '@/lib/helpers'
import { NOISE_COLOR, NOISE_COLOR_LIGHT } from '../brand-colors'
import { getPaletteColors, hexToHsl, hslToHex } from '../colors'
import type {
  AliasNode,
  ChunkNode,
  GraphNode,
  GraphNodeBase,
  GraphStats,
  PaperNode,
  RelationAssertionNode,
  TermNode,
} from '@/features/graph/types'
import type { GraphPointRow } from './row-types'

/* ─── Per-paper shade within cluster ──────────────────────── */

/** Shift lightness of a hex color by a paper index within its cluster. */
export function shadeByPaper(hex: string, paperIndex: number): string {
  const { h, s, l } = hexToHsl(hex)
  // Alternate lighter/darker: index 0 = base, 1 = +2L, 2 = -2L, 3 = +4L, ...
  const step = Math.ceil(paperIndex / 2) * 2
  const offset = paperIndex % 2 === 0 ? 0 : (paperIndex % 4 < 2 ? step : -step)
  return hslToHex(h, s, Math.max(30, Math.min(80, l + offset)))
}

/* ─── Cluster color resolution ────────────────────────────── */

export function resolveClusterColors(
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

export function buildBaseNode(
  overrides: Partial<GraphNodeBase> & Pick<GraphNodeBase, 'id' | 'x' | 'y' | 'index' | 'color' | 'colorLight' | 'clusterId'>,
): GraphNodeBase {
  return {
    clusterLabel: null,
    clusterProbability: 0,
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
    topEntities: null,
    canonicalName: null,
    category: null,
    semanticGroups: null,
    organSystems: null,
    relationCategories: null,
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
    isInBase: false,
    baseRank: null,
    payloadJson: null,
    textAvailability: null,
    isOpenAccess: null,
    hasOpenAccessPdf: null,
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

/* ─── Graph node factory ─────────────────────────────────── */

export function buildGraphNode(
  row: GraphPointRow,
  fallbackIndex = 0,
): GraphNode {
  const darkPalette = getPaletteColors('default', 'dark')
  const lightPalette = getPaletteColors('default', 'light')
  const clusterId = row.cluster_id ?? 0
  const paperIdx = row.paper_cluster_index ?? 0
  const clusterColors = resolveClusterColors(clusterId, darkPalette, lightPalette)
  const color =
    clusterId <= 0 || paperIdx === 0
      ? clusterColors.color
      : shadeByPaper(clusterColors.color, paperIdx)
  const colorLight =
    clusterId <= 0 || paperIdx === 0
      ? clusterColors.colorLight
      : shadeByPaper(clusterColors.colorLight, paperIdx)

  const base = buildBaseNode({
    index: row.point_index ?? fallbackIndex,
    id: row.node_id,
    x: row.x,
    y: row.y,
    color,
    colorLight,
    clusterId,
    clusterLabel: row.cluster_label,
    clusterProbability: row.cluster_probability ?? 0,
    paperId: row.paper_id ?? null,
    paperTitle: row.title ?? null,
    citekey: row.citekey ?? null,
    year: row.year ?? null,
    journal: row.journal,
    doi: row.doi,
    pmid: coerceNullableString(row.pmid),
    pmcid: row.pmcid,
    displayLabel:
      row.display_label ??
      row.title ??
      row.canonical_name ??
      row.alias_text ??
      row.relation_type ??
      row.chunk_preview ??
      row.node_id,
    searchText: row.search_text ?? null,
    chunkPreview: row.chunk_preview ?? row.display_preview ?? null,
    topEntities: row.top_entities_csv ?? null,
    canonicalName: row.canonical_name ?? null,
    category: row.category ?? null,
    semanticGroups: row.semantic_groups_csv ?? null,
    organSystems: row.organ_systems_csv ?? null,
    relationCategories: row.relation_categories_csv ?? null,
    mentionCount: coerceNullableNumber(row.mention_count),
    paperCount: coerceNullableNumber(row.paper_count),
    chunkCount: coerceNullableNumber(row.chunk_count ?? row.paper_chunk_count),
    relationCount: coerceNullableNumber(
      row.relation_count ?? row.paper_relation_count,
    ),
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
    nodeRole: (row.node_role === 'overlay' ? 'overlay' : 'primary') as
      | 'overlay'
      | 'primary',
    isInBase: row.is_in_base === true,
    baseRank: coerceNullableNumber(row.base_rank),
    payloadJson: row.payload_json ?? null,
    textAvailability: row.text_availability ?? null,
    isOpenAccess: row.is_open_access ?? null,
    hasOpenAccessPdf: row.has_open_access_pdf ?? null,
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
    return {
      ...base,
      nodeKind: 'paper',
      displayPreview: row.display_preview ?? row.chunk_preview ?? null,
      payloadWasTruncated: false,
    } satisfies PaperNode
  }
  if (nodeKind === 'term') {
    return {
      ...base,
      nodeKind: 'term',
      definition: row.definition ?? null,
      semanticTypes: row.semantic_types_csv ?? null,
      aliasesCsv: row.aliases_csv ?? null,
    } satisfies TermNode
  }
  if (nodeKind === 'relation_assertion') {
    return {
      ...base,
      nodeKind: 'relation_assertion',
    } satisfies RelationAssertionNode
  }
  if (nodeKind === 'alias') {
    return {
      ...base,
      nodeKind: 'alias',
    } satisfies AliasNode
  }
  return {
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
  } satisfies ChunkNode
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
