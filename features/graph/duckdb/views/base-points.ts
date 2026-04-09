import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { requireBundleTable, validateTableName } from '../utils'

export const BASE_POINT_CANONICAL_SOURCE_TABLE = 'base_points'
export const BASE_POINT_CANVAS_RUNTIME_SOURCE_TABLE = 'base_points_canvas_runtime'
export const BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE = 'base_points_query_runtime'

export const LOCAL_POINT_CANVAS_RUNTIME_COLUMNS = [
  'point_index',
  'id',
  'paper_id',
  'hex_color',
  'hex_color_light',
  'x',
  'y',
  'cluster_id',
  'cluster_label',
  'title',
  'citekey',
  'journal',
  'year',
  'display_label',
  'paper_author_count',
  'paper_reference_count',
  'paper_entity_count',
  'paper_relation_count',
] as const

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
  'title',
  'citekey',
  'journal',
  'year',
  'display_label',
  'semantic_groups_csv',
  'relation_categories_csv',
  'text_availability',
  'is_in_base',
  'base_rank',
  'paper_author_count',
  'paper_reference_count',
  'paper_entity_count',
  'paper_relation_count',
] as const

const RESOLVED_CLUSTER_LABEL_SQL = `
      CASE
        WHEN COALESCE(cluster_id, 0) > 0
          THEN COALESCE(
            NULLIF(cluster_label, ''),
            'Cluster ' || CAST(COALESCE(cluster_id, 0) AS VARCHAR)
          )
        ELSE NULL
      END`

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
      ${RESOLVED_CLUSTER_LABEL_SQL} AS clusterLabel,
      paper_id AS paperId,
      COALESCE(display_label, title, citekey, id) AS displayLabel,
      title AS paperTitle,
      citekey,
      journal,
      year,
      CAST(paper_author_count AS DOUBLE) AS paperAuthorCount,
      CAST(paper_reference_count AS DOUBLE) AS paperReferenceCount,
      CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
      CAST(paper_relation_count AS DOUBLE) AS paperRelationCount
    FROM ${sourceTable}`
}

export function createPointQueryProjectionSql(bundle: GraphBundle) {
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
      ${RESOLVED_CLUSTER_LABEL_SQL} AS clusterLabel,
      paper_id AS paperId,
      COALESCE(display_label, title, citekey, id) AS displayLabel,
      title AS paperTitle,
      citekey,
      journal,
      year,
      semantic_groups_csv AS semanticGroups,
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

export async function registerBasePointsView(
  conn: AsyncDuckDBConnection,
  args: {
    sourceTable?: string
    buildPointCanvasProjectionSql: (sourceTable: string, indexSql: string) => string
    buildPointQueryProjectionSql: (sourceTable: string, indexSql: string) => string
  }
) {
  const pointTable = validateTableName(
    args.sourceTable ?? BASE_POINT_CANONICAL_SOURCE_TABLE
  )

  await registerBasePointCanvasView(conn, {
    sourceTable: pointTable,
    buildPointCanvasProjectionSql: args.buildPointCanvasProjectionSql,
  })
  await registerBasePointQueryViews(conn, {
    sourceTable: pointTable,
    buildPointQueryProjectionSql: args.buildPointQueryProjectionSql,
  })
}

export async function registerBasePointCanvasView(
  conn: AsyncDuckDBConnection,
  args: {
    sourceTable?: string
    buildPointCanvasProjectionSql: (sourceTable: string, indexSql: string) => string
  }
) {
  const pointTable = validateTableName(
    args.sourceTable ?? BASE_POINT_CANVAS_RUNTIME_SOURCE_TABLE
  )

  await conn.query(
    `CREATE OR REPLACE VIEW base_points_canvas_web AS
     ${args.buildPointCanvasProjectionSql(pointTable, 'point_index')}`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW base_paper_points_canvas_web AS
     SELECT
       index,
       base_points_canvas_web.* EXCLUDE (index),
       index AS paperIndex
     FROM base_points_canvas_web`
  )
}

export async function registerBasePointQueryViews(
  conn: AsyncDuckDBConnection,
  args: {
    sourceTable?: string
    buildPointQueryProjectionSql: (sourceTable: string, indexSql: string) => string
  }
) {
  const pointTable = validateTableName(
    args.sourceTable ?? BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE
  )

  await conn.query(
    `CREATE OR REPLACE VIEW base_points_web AS
     ${args.buildPointQueryProjectionSql(pointTable, 'point_index')}`
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
