import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { validateTableName } from '../utils'

export async function registerClusterViews(conn: AsyncDuckDBConnection) {
  const clusterTable = validateTableName('base_clusters')

  await conn.query(
    `CREATE OR REPLACE VIEW graph_clusters AS
     SELECT
       cluster_id,
       label,
       label_mode,
       member_count,
       centroid_x,
       centroid_y,
       CASE
         WHEN representative_node_kind = 'chunk' THEN representative_node_id
         ELSE NULL
       END AS representative_rag_chunk_id,
       label_source,
       candidate_count,
       NULL::INTEGER AS entity_candidate_count,
       NULL::INTEGER AS lexical_candidate_count,
       mean_cluster_probability,
       mean_outlier_score,
       paper_count,
       is_noise
     FROM ${clusterTable}`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW graph_facets AS
     SELECT
       NULL::VARCHAR AS facet_name,
       NULL::VARCHAR AS facet_value,
       NULL::VARCHAR AS facet_label,
       NULL::INTEGER AS point_count,
       NULL::INTEGER AS paper_count,
       NULL::INTEGER AS cluster_count,
       NULL::VARCHAR AS sort_key
     WHERE false`
  )
}
