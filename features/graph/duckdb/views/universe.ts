import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { LOCAL_POINT_RUNTIME_COLUMNS } from './base-points'

export const ATTACHED_UNIVERSE_POINTS_TABLE = 'attached_universe_points'

export async function initializeAttachedUniversePointTable(
  conn: AsyncDuckDBConnection
) {
  await conn.query(
    `CREATE TEMP TABLE IF NOT EXISTS ${ATTACHED_UNIVERSE_POINTS_TABLE} AS
     SELECT ${LOCAL_POINT_RUNTIME_COLUMNS.join(', ')}
     FROM base_points
     WHERE false`
  )
}

function buildUniverseSourceSql(sourceTable: string | null) {
  const tables = [
    sourceTable,
    ATTACHED_UNIVERSE_POINTS_TABLE,
  ].filter((tableName): tableName is string => Boolean(tableName))

  if (tables.length === 0) {
    return null
  }

  return tables
    .map((tableName) => `SELECT * FROM ${tableName}`)
    .join('\nUNION ALL\n')
}

export async function registerUniverseLinksViews(
  conn: AsyncDuckDBConnection,
  args: {
    universeLinksTable: string | null
  }
) {
  const { universeLinksTable } = args

  await conn.query(
    `CREATE OR REPLACE VIEW universe_links_web AS
     ${
       universeLinksTable
         ? `SELECT
              l.source_node_id,
              l.source_point_index,
              l.target_node_id,
              l.target_point_index,
              l.link_kind,
              l.weight,
              l.is_directed,
              l.is_in_base,
              l.certainty,
              l.relation_id,
              l.paper_id
            FROM ${universeLinksTable} l`
         : `SELECT
              NULL::VARCHAR AS source_node_id,
              NULL::INTEGER AS source_point_index,
              NULL::VARCHAR AS target_node_id,
              NULL::INTEGER AS target_point_index,
              NULL::VARCHAR AS link_kind,
              NULL::DOUBLE AS weight,
              false AS is_directed,
              false AS is_in_base,
              NULL::VARCHAR AS certainty,
              NULL::VARCHAR AS relation_id,
             NULL::VARCHAR AS paper_id
            WHERE false`
     }`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW base_links_web AS
     SELECT
       l.source_node_id,
       src.index AS source_point_index,
       l.target_node_id,
       dst.index AS target_point_index,
       l.link_kind,
       l.weight,
       l.is_directed,
       l.is_in_base,
       l.certainty,
       l.relation_id,
       l.paper_id
     FROM universe_links_web l
     JOIN base_points_canvas_web src
       ON src.id = l.source_node_id
     JOIN base_points_canvas_web dst
       ON dst.id = l.target_node_id`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_links_web AS
     SELECT
       l.source_node_id,
       src.index AS source_point_index,
       l.target_node_id,
       dst.index AS target_point_index,
       l.link_kind,
       l.weight,
       l.is_directed,
       l.is_in_base,
       l.certainty,
       l.relation_id,
       l.paper_id
     FROM universe_links_web l
     JOIN active_point_index_lookup_web src
       ON src.id = l.source_node_id
     JOIN active_point_index_lookup_web dst
       ON dst.id = l.target_node_id`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_paper_links_web AS
     SELECT
       l.source_node_id,
       src.index AS source_point_index,
       l.target_node_id,
       dst.index AS target_point_index
     FROM universe_links_web l
     JOIN active_paper_points_canvas_web src
       ON src.id = l.source_node_id
     JOIN active_paper_points_canvas_web dst
       ON dst.id = l.target_node_id
     WHERE l.link_kind = 'citation'`
  )
}

export async function registerUniversePointView(
  conn: AsyncDuckDBConnection,
  args: {
    sourceTable: string | null
    selectCanvasSql: (tableName: string, indexSql: string) => string
    selectQuerySql: (tableName: string, indexSql: string) => string
  }
) {
  const { sourceTable, selectCanvasSql, selectQuerySql } = args
  const sourceSql = buildUniverseSourceSql(sourceTable)

  if (sourceSql) {
    const sourceRelation = `(${sourceSql}) AS universe_source`
    await conn.query(
      `CREATE OR REPLACE VIEW universe_points_canvas_web AS
       ${selectCanvasSql(sourceRelation, 'point_index')}`
    )
    await conn.query(
      `CREATE OR REPLACE VIEW universe_points_web AS
       ${selectQuerySql(sourceRelation, 'point_index')}`
    )
    return
  }

  await conn.query(
    `CREATE OR REPLACE VIEW universe_points_web AS
     SELECT * FROM base_points_web WHERE false`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW universe_points_canvas_web AS
     SELECT * FROM base_points_canvas_web WHERE false`
  )
}
