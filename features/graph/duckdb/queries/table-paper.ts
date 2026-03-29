import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { buildPaperNodes, type GraphPointRow } from '@/features/graph/lib/transform'

import {
  buildCurrentViewPredicate,
  buildIndexWhereClause,
  sliceScopeIndices,
} from '../sql-helpers'

import { queryRows } from './core'

export async function queryPaperTablePage(
  conn: AsyncDuckDBConnection,
  args: {
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
) {
  const { page, pageSize, view, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const scoped = view === 'selected'
    ? sliceScopeIndices({
        view,
        page,
        pageSize,
        currentPointIndices,
        selectedPointIndices,
      })
    : null
  const currentPredicate = buildCurrentViewPredicate({
    currentPointIndices,
    currentPointScopeSql,
  })
  const totalRows =
    view === 'selected'
      ? (scoped?.totalRows ?? 0)
      : (
          await queryRows<{ count: number }>(
            conn,
            `SELECT count(*)::INTEGER AS count
             FROM active_paper_points_web
             WHERE ${currentPredicate}`
          )
        )[0]?.count ??
        0

  if (totalRows === 0) {
    return { totalRows: 0, page, pageSize, rows: [] }
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
    WHERE ${
      scoped?.pageIndices
        ? buildIndexWhereClause(scoped.pageIndices)
        : currentPredicate
    }
    ORDER BY index${
      scoped?.pageIndices ? '' : '\n    LIMIT ? OFFSET ?'
    }`,
    scoped?.pageIndices ? [] : [pageSize, (Math.max(page, 1) - 1) * Math.max(pageSize, 1)]
  )

  return {
    totalRows,
    page,
    pageSize,
    rows: buildPaperNodes(rows),
  }
}
