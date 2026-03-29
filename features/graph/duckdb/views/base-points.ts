import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { NOISE_COLOR, NOISE_COLOR_LIGHT, DEFAULT_POINT_COLOR } from '@/features/graph/lib/brand-colors'
import { getPaletteColors } from '@/features/graph/lib/colors'
import type { GraphBundle } from '@/features/graph/types'

import { validateTableName, requireBundleTable } from '../utils'

const DEFAULT_CLUSTER_COLORS = getPaletteColors('default', 'dark')
const DEFAULT_CLUSTER_COLORS_LIGHT = getPaletteColors('default', 'light')

export function createPointViewSelectBuilder(bundle: GraphBundle) {
  const pointManifest = requireBundleTable(bundle, 'base_points')
  const pointColumns = new Set((pointManifest?.columns ?? []).map((column) => column.toLowerCase()))

  const colorCase = DEFAULT_CLUSTER_COLORS.map(
    (color, index) => `WHEN ${index} THEN '${color}'`
  ).join('\n        ')
  const colorCaseLight = DEFAULT_CLUSTER_COLORS_LIGHT.map(
    (color, index) => `WHEN ${index} THEN '${color}'`
  ).join('\n        ')

  const pointExpr = (column: string, fallback: string) =>
    pointColumns.has(column.toLowerCase()) ? column : fallback

  const defaultHexColorExpr = `CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS.length})
             ${colorCase}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END`
  const defaultHexColorLightExpr = `CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR_LIGHT}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS_LIGHT.length})
             ${colorCaseLight}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END`

  return (sourceTable: string, indexSql: string) => `
       SELECT
         ${indexSql} AS index,
         point_index AS sourcePointIndex,
         id,
         id AS node_id,
         node_kind AS nodeKind,
         COALESCE(${pointExpr("node_role", "'primary'")}, 'primary') AS nodeRole,
         ${pointExpr('hex_color', defaultHexColorExpr)} AS hexColor,
         ${pointExpr('hex_color_light', defaultHexColorLightExpr)} AS hexColorLight,
         ${pointExpr('hex_color', defaultHexColorExpr)} AS hex_color,
         ${pointExpr('hex_color_light', defaultHexColorLightExpr)} AS hex_color_light,
         x,
         y,
         COALESCE(cluster_id, 0) AS clusterId,
         cluster_label AS clusterLabel,
         COALESCE(cluster_probability, 0) AS clusterProbability,
         paper_id AS paperId,
         title AS paperTitle,
         citekey,
         journal,
         year,
         doi,
         CAST(pmid AS VARCHAR) AS pmid,
         pmcid,
         NULL::VARCHAR AS stableChunkId,
         NULL::INTEGER AS chunkIndex,
         NULL::VARCHAR AS sectionCanonical,
         NULL::VARCHAR AS sectionType,
         NULL::INTEGER AS pageNumber,
         NULL::INTEGER AS tokenCount,
         NULL::INTEGER AS charCount,
         NULL::VARCHAR AS chunkKind,
         NULL::VARCHAR AS chunkPreview,
         display_label AS displayLabel,
         search_text AS searchText,
         NULL::VARCHAR AS canonicalName,
         NULL::VARCHAR AS category,
         NULL::VARCHAR AS definition,
         NULL::VARCHAR AS semanticTypes,
         semantic_groups_csv AS semanticGroups,
         organ_systems_csv AS organSystems,
         ${pointExpr('top_entities_csv', 'NULL::VARCHAR')} AS topEntities,
         ${pointExpr('relation_categories_csv', 'NULL::VARCHAR')} AS relationCategories,
         NULL::VARCHAR AS aliasesCsv,
         NULL::DOUBLE AS mentionCount,
         NULL::DOUBLE AS paperCount,
         NULL::DOUBLE AS chunkCount,
         CAST(${pointExpr('relation_count', 'paper_relation_count')} AS DOUBLE) AS relationCount,
         NULL::DOUBLE AS aliasCount,
         NULL::VARCHAR AS relationType,
         NULL::VARCHAR AS relationCategory,
         NULL::VARCHAR AS relationDirection,
         NULL::VARCHAR AS relationCertainty,
         NULL::VARCHAR AS assertionStatus,
         NULL::VARCHAR AS evidenceStatus,
         NULL::VARCHAR AS aliasText,
         NULL::VARCHAR AS aliasType,
         NULL::DOUBLE AS aliasQualityScore,
         NULL::VARCHAR AS aliasSource,
         is_in_base AS isInBase,
         CAST(${pointExpr("base_rank", "0")} AS DOUBLE) AS baseRank,
         CASE
           WHEN COALESCE(${pointExpr("node_role", "'primary'")}, 'primary') = 'overlay' THEN true
           ELSE false
         END AS isOverlayActive,
         NULL::VARCHAR AS payloadJson,
         title AS displayPreview,
         false AS payloadWasTruncated,
         ${pointExpr("text_availability", "json_extract_string(payload_json, '$.text_availability')")} AS textAvailability,
         COALESCE(${pointExpr("is_open_access", "TRY_CAST(json_extract(payload_json, '$.is_open_access') AS BOOLEAN)")}, false) AS isOpenAccess,
         COALESCE(${pointExpr("has_open_access_pdf", "(json_extract_string(payload_json, '$.open_access_pdf_url') IS NOT NULL AND json_extract_string(payload_json, '$.open_access_pdf_url') <> '')")}, false) AS hasOpenAccessPdf,
         paper_author_count AS paperAuthorCount,
         paper_reference_count AS paperReferenceCount,
         paper_asset_count AS paperAssetCount,
         0::INTEGER AS paperChunkCount,
         CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
         CAST(paper_relation_count AS DOUBLE) AS paperRelationCount,
         NULL::INTEGER AS paperSentenceCount,
         NULL::INTEGER AS paperPageCount,
         NULL::INTEGER AS paperTableCount,
         NULL::INTEGER AS paperFigureCount,
         COALESCE(paper_cluster_index, 0) AS paperClusterIndex,
         false AS hasTableContext,
         false AS hasFigureContext
       FROM ${sourceTable}`
}

export async function registerBasePointsView(
  conn: AsyncDuckDBConnection,
  buildPointViewSelect: (sourceTable: string, indexSql: string) => string
) {
  const pointTable = validateTableName('base_points')
  await conn.query(
    `CREATE OR REPLACE VIEW base_points_web AS
     ${buildPointViewSelect(
       pointTable,
       'ROW_NUMBER() OVER (ORDER BY point_index)::INTEGER - 1'
     )}`
  )
}
