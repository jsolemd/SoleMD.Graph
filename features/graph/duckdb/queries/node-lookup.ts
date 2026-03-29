import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import {
  buildGraphNode,
  buildPaperNodes,
  type GraphPointRow,
} from '@/features/graph/lib/transform'
import type { ChunkNode, PaperNode } from '@/features/graph/types'

import { buildPlaceholderList } from '../utils'

import { queryRows } from './core'

export async function queryPaperNodesByPaperIds(
  conn: AsyncDuckDBConnection,
  paperIds: string[]
): Promise<Record<string, PaperNode>> {
  const uniqueIds = [...new Set(paperIds.filter((paperId) => paperId.trim().length > 0))]
  if (uniqueIds.length === 0) {
    return {}
  }

  const rows = await queryRows<GraphPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      nodeKind AS node_kind,
      nodeRole AS node_role,
      paperId AS paper_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      clusterProbability AS cluster_probability,
      citekey,
      paperTitle AS title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      NULL::VARCHAR AS stable_chunk_id,
      NULL::INTEGER AS chunk_index,
      NULL::VARCHAR AS section_canonical,
      NULL::INTEGER AS page_number,
      NULL::INTEGER AS token_count,
      NULL::INTEGER AS char_count,
      NULL::VARCHAR AS chunk_kind,
      NULL::VARCHAR AS chunk_preview,
      displayLabel AS display_label,
      searchText AS search_text,
      NULL::VARCHAR AS canonical_name,
      NULL::VARCHAR AS category,
      NULL::VARCHAR AS definition,
      NULL::VARCHAR AS semantic_types_csv,
      semanticGroups AS semantic_groups_csv,
      organSystems AS organ_systems_csv,
      topEntities AS top_entities_csv,
      relationCategories AS relation_categories_csv,
      NULL::REAL AS mention_count,
      NULL::REAL AS paper_count,
      NULL::REAL AS chunk_count,
      paperRelationCount AS relation_count,
      NULL::REAL AS alias_count,
      NULL::VARCHAR AS relation_type,
      NULL::VARCHAR AS relation_category,
      NULL::VARCHAR AS relation_direction,
      NULL::VARCHAR AS relation_certainty,
      NULL::VARCHAR AS assertion_status,
      NULL::VARCHAR AS evidence_status,
      NULL::VARCHAR AS alias_text,
      NULL::VARCHAR AS alias_type,
      NULL::REAL AS alias_quality_score,
      NULL::VARCHAR AS alias_source,
      isInBase AS is_in_base,
      baseRank AS base_rank,
      NULL::VARCHAR AS payload_json,
      textAvailability AS text_availability,
      isOpenAccess AS is_open_access,
      hasOpenAccessPdf AS has_open_access_pdf,
      paperAuthorCount AS paper_author_count,
      paperReferenceCount AS paper_reference_count,
      paperAssetCount AS paper_asset_count,
      NULL::INTEGER AS paper_chunk_count,
      paperEntityCount AS paper_entity_count,
      paperRelationCount AS paper_relation_count,
      NULL::INTEGER AS paper_sentence_count,
      NULL::INTEGER AS paper_page_count,
      NULL::INTEGER AS paper_table_count,
      NULL::INTEGER AS paper_figure_count,
      paperClusterIndex AS paper_cluster_index,
      false AS has_table_context,
      false AS has_figure_context
    FROM active_paper_points_web
    WHERE paperId IN (${buildPlaceholderList(uniqueIds.length)})`,
    uniqueIds
  )

  return Object.fromEntries(
    buildPaperNodes(rows)
      .filter((node) => Boolean(node.paperId))
      .map((node) => [node.paperId as string, node])
  )
}

export async function queryUniversePointIdsByPaperIds(
  conn: AsyncDuckDBConnection,
  paperIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(paperIds.filter((paperId) => paperId.trim().length > 0))]
  if (uniqueIds.length === 0) {
    return {}
  }

  const rows = await queryRows<{ paper_id: string; node_id: string }>(
    conn,
    `SELECT
      paperId AS paper_id,
      id AS node_id
    FROM universe_points_web
    WHERE nodeKind = 'paper'
      AND paperId IN (${buildPlaceholderList(uniqueIds.length)})`,
    uniqueIds
  )

  return Object.fromEntries(
    rows
      .filter((row) => row.paper_id && row.node_id)
      .map((row) => [row.paper_id, row.node_id])
  )
}

export async function queryChunkNodesByChunkIds(
  conn: AsyncDuckDBConnection,
  chunkIds: string[]
): Promise<Record<string, ChunkNode>> {
  const uniqueIds = [...new Set(chunkIds.filter((chunkId) => chunkId.trim().length > 0))]
  if (uniqueIds.length === 0) {
    return {}
  }

  const rows = await queryRows<GraphPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      nodeKind AS node_kind,
      nodeRole AS node_role,
      paperId AS paper_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      clusterProbability AS cluster_probability,
      citekey,
      paperTitle AS title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      stableChunkId AS stable_chunk_id,
      chunkIndex AS chunk_index,
      sectionCanonical AS section_canonical,
      pageNumber AS page_number,
      tokenCount AS token_count,
      charCount AS char_count,
      chunkKind AS chunk_kind,
      chunkPreview AS chunk_preview,
      displayLabel AS display_label,
      searchText AS search_text,
      NULL::VARCHAR AS canonical_name,
      NULL::VARCHAR AS category,
      NULL::VARCHAR AS definition,
      NULL::VARCHAR AS semantic_types_csv,
      semanticGroups AS semantic_groups_csv,
      organSystems AS organ_systems_csv,
      topEntities AS top_entities_csv,
      relationCategories AS relation_categories_csv,
      NULL::REAL AS mention_count,
      NULL::REAL AS paper_count,
      NULL::REAL AS chunk_count,
      paperRelationCount AS relation_count,
      NULL::REAL AS alias_count,
      NULL::VARCHAR AS relation_type,
      NULL::VARCHAR AS relation_category,
      NULL::VARCHAR AS relation_direction,
      NULL::VARCHAR AS relation_certainty,
      NULL::VARCHAR AS assertion_status,
      NULL::VARCHAR AS evidence_status,
      NULL::VARCHAR AS alias_text,
      NULL::VARCHAR AS alias_type,
      NULL::REAL AS alias_quality_score,
      NULL::VARCHAR AS alias_source,
      isInBase AS is_in_base,
      baseRank AS base_rank,
      NULL::VARCHAR AS payload_json,
      textAvailability AS text_availability,
      isOpenAccess AS is_open_access,
      hasOpenAccessPdf AS has_open_access_pdf,
      paperAuthorCount AS paper_author_count,
      paperReferenceCount AS paper_reference_count,
      paperAssetCount AS paper_asset_count,
      NULL::INTEGER AS paper_chunk_count,
      paperEntityCount AS paper_entity_count,
      paperRelationCount AS paper_relation_count,
      NULL::INTEGER AS paper_sentence_count,
      NULL::INTEGER AS paper_page_count,
      NULL::INTEGER AS paper_table_count,
      NULL::INTEGER AS paper_figure_count,
      paperClusterIndex AS paper_cluster_index,
      false AS has_table_context,
      false AS has_figure_context
    FROM active_points_web
    WHERE nodeKind = 'chunk'
      AND (id IN (${buildPlaceholderList(uniqueIds.length)})
        OR stableChunkId IN (${buildPlaceholderList(uniqueIds.length)}))`,
    [...uniqueIds, ...uniqueIds]
  )

  const nodes = rows
    .map((row) => buildGraphNode(row))
    .filter((node): node is ChunkNode => node.nodeKind === 'chunk')

  const resolved: Record<string, ChunkNode> = {}
  for (const node of nodes) {
    resolved[node.id] = node
    if (node.stableChunkId) {
      resolved[node.stableChunkId] = node
    }
  }
  return resolved
}
