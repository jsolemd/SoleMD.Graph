import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { EDGE_SOURCE_BITMAP } from '@/features/graph/lib/edge-types'

export const ORB_ENTITY_EDGES_CURRENT_VIEW = 'orb_entity_edges_current'

export async function registerOrbEntityEdgeViews(
  conn: AsyncDuckDBConnection,
  args: {
    entityEdgesTable: string | null
  }
) {
  const { entityEdgesTable } = args
  const sourceBitmap = EDGE_SOURCE_BITMAP.entity

  await conn.query(
    `CREATE OR REPLACE VIEW ${ORB_ENTITY_EDGES_CURRENT_VIEW} AS
     ${
       entityEdgesTable
         ? `SELECT
              e.source_node_id,
              src.index AS source_point_index,
              e.target_node_id,
              dst.index AS target_point_index,
              'entity' AS link_kind,
              e.weight,
              false AS is_directed,
              true AS is_in_base,
              NULL::VARCHAR AS certainty,
              NULL::VARCHAR AS relation_id,
              NULL::VARCHAR AS paper_id,
              ${sourceBitmap}::INTEGER AS source_bitmap
            FROM ${entityEdgesTable} e
            JOIN active_point_index_lookup_web src
              ON src.id = e.source_node_id
            JOIN active_point_index_lookup_web dst
              ON dst.id = e.target_node_id
            WHERE e.source_node_id IS NOT NULL
              AND e.target_node_id IS NOT NULL`
         : `SELECT
              NULL::VARCHAR AS source_node_id,
              NULL::INTEGER AS source_point_index,
              NULL::VARCHAR AS target_node_id,
              NULL::INTEGER AS target_point_index,
              'entity'::VARCHAR AS link_kind,
              NULL::DOUBLE AS weight,
              false AS is_directed,
              false AS is_in_base,
              NULL::VARCHAR AS certainty,
              NULL::VARCHAR AS relation_id,
              NULL::VARCHAR AS paper_id,
              ${sourceBitmap}::INTEGER AS source_bitmap
            WHERE false`
     }`
  )
}
