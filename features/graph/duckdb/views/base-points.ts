import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { requireBundleTable, validateTableName } from '../utils'

export const LOCAL_POINT_RUNTIME_COLUMNS = [
  'point_index',
  'id',
  'paper_id',
  'hex_color',
  'hex_color_light',
  'x',
  'y',
  'cluster_id',
  'cluster_label',
  'cluster_probability',
  'title',
  'citekey',
  'journal',
  'year',
  'display_label',
  'semantic_groups_csv',
  'organ_systems_csv',
  'relation_categories_csv',
  'text_availability',
  'is_in_base',
  'base_rank',
  'paper_author_count',
  'paper_reference_count',
  'paper_entity_count',
  'paper_relation_count',
] as const

function assertCanonicalPointColumns(bundle: GraphBundle, tableName: 'base_points' | 'universe_points') {
  const table = requireBundleTable(bundle, tableName)
  const columns = new Set((table.columns ?? []).map((column) => column.toLowerCase()))

  for (const column of LOCAL_POINT_RUNTIME_COLUMNS) {
    if (!columns.has(column)) {
      throw new Error(
        `Canonical graph bundle table "${tableName}" is missing required column "${column}".`
      )
    }
  }
}

export function createPointCanvasProjectionSql(bundle: GraphBundle) {
  assertCanonicalPointColumns(bundle, 'base_points')
  if (bundle.bundleManifest.tables.universe_points) {
    assertCanonicalPointColumns(bundle, 'universe_points')
  }

  return (sourceTable: string, indexSql: string) => `
    SELECT
      ${indexSql} AS index,
      point_index AS sourcePointIndex,
      id,
      'primary' AS nodeRole,
      hex_color AS hexColor,
      hex_color_light AS hexColorLight,
      x,
      y,
      COALESCE(cluster_id, 0) AS clusterId,
      cluster_label AS clusterLabel,
      COALESCE(cluster_probability, 0) AS clusterProbability,
      paper_id AS paperId,
      COALESCE(display_label, title, citekey, id) AS displayLabel,
      title AS paperTitle,
      citekey,
      journal,
      year,
      semantic_groups_csv AS semanticGroups,
      organ_systems_csv AS organSystems,
      relation_categories_csv AS relationCategories,
      text_availability AS textAvailability,
      is_in_base AS isInBase,
      CAST(base_rank AS DOUBLE) AS baseRank,
      CAST(paper_author_count AS DOUBLE) AS paperAuthorCount,
      CAST(paper_reference_count AS DOUBLE) AS paperReferenceCount,
      CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
      CAST(paper_relation_count AS DOUBLE) AS paperRelationCount
    FROM ${sourceTable}`
}

export function createPointQueryProjectionSql(bundle: GraphBundle) {
  const buildCanvasProjectionSql = createPointCanvasProjectionSql(bundle)
  return (sourceTable: string, indexSql: string) =>
    buildCanvasProjectionSql(sourceTable, indexSql)
}

export async function registerBasePointsView(
  conn: AsyncDuckDBConnection,
  buildPointCanvasProjectionSql: (sourceTable: string, indexSql: string) => string,
  buildPointQueryProjectionSql: (sourceTable: string, indexSql: string) => string
) {
  const pointTable = validateTableName('base_points')

  await conn.query(
    `CREATE OR REPLACE VIEW base_points_canvas_web AS
     ${buildPointCanvasProjectionSql(pointTable, 'point_index')}`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW base_points_web AS
     ${buildPointQueryProjectionSql(pointTable, 'point_index')}`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW base_paper_points_canvas_web AS
     SELECT
       index,
       base_points_canvas_web.* EXCLUDE (index),
       index AS paperIndex
     FROM base_points_canvas_web`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW base_paper_points_web AS
     SELECT
       index,
       base_points_web.* EXCLUDE (index),
       index AS paperIndex
     FROM base_points_web`
  )
}
