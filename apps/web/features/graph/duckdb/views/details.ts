import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

export async function registerClusterExemplarView(
  conn: AsyncDuckDBConnection,
  exemplarTable: string | null
) {
  if (exemplarTable) {
    await conn.query(
      `CREATE OR REPLACE VIEW graph_cluster_exemplars AS
       SELECT
         e.cluster_id,
         e.rank,
         e.node_id AS point_id,
         COALESCE(e.paper_id, p.paperId) AS paper_id,
         p.citekey,
         p.paperTitle AS title,
         e.exemplar_score,
         e.is_representative,
         COALESCE(p.paperTitle, p.displayLabel) AS preview
       FROM ${exemplarTable} e
       LEFT JOIN current_points_web p
         ON p.id = e.node_id`
    )
    return
  }

  await conn.query(
    `CREATE OR REPLACE VIEW graph_cluster_exemplars AS
     SELECT
       NULL::INTEGER AS cluster_id,
       NULL::INTEGER AS rank,
       NULL::VARCHAR AS point_id,
       NULL::VARCHAR AS paper_id,
       NULL::VARCHAR AS citekey,
       NULL::VARCHAR AS title,
       NULL::DOUBLE AS exemplar_score,
       false AS is_representative,
       NULL::VARCHAR AS preview
     WHERE false`
  )
}
