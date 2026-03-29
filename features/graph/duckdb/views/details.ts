import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

export async function registerGraphChunkDetailsView(conn: AsyncDuckDBConnection) {
  await conn.query(
    `CREATE OR REPLACE VIEW graph_chunk_details AS
     SELECT
       gp.id AS rag_chunk_id,
       gp.paperId AS paper_id,
       gp.citekey,
       gp.paperTitle AS title,
       gp.journal,
       gp.year,
       gp.doi,
       CAST(gp.pmid AS VARCHAR) AS pmid,
       gp.pmcid,
       gp.stableChunkId AS stable_chunk_id,
       gp.chunkIndex AS chunk_index,
       gp.sectionType AS section_type,
       gp.sectionCanonical AS section_canonical,
       NULL::VARCHAR AS section_path,
       gp.pageNumber AS page_number,
       gp.tokenCount AS token_count,
       gp.charCount AS char_count,
       gp.chunkKind AS chunk_kind,
       NULL::VARCHAR AS block_type,
       NULL::VARCHAR AS block_id,
       gp.chunkPreview AS chunk_text,
       gp.chunkPreview AS chunk_preview,
       papers.abstract,
       gp.clusterId AS cluster_id,
       gp.clusterLabel AS cluster_label,
       gp.clusterProbability AS cluster_probability,
       NULL::DOUBLE AS outlier_score,
       NULL::VARCHAR AS source_embedding_id
     FROM active_points_web gp
     LEFT JOIN paper_catalog_web papers ON papers.paper_id = gp.paperId
     WHERE gp.nodeKind = 'chunk'`
  )
}

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
         e.node_id AS rag_chunk_id,
         COALESCE(e.paper_id, p.paperId) AS paper_id,
         p.citekey,
         p.paperTitle AS title,
         p.sectionType AS section_type,
         p.sectionCanonical AS section_canonical,
         p.pageNumber AS page_number,
         e.exemplar_score,
         e.is_representative,
         COALESCE(p.chunkPreview, p.displayLabel) AS chunk_preview
       FROM ${exemplarTable} e
       LEFT JOIN active_points_web p
         ON p.id = e.node_id`
    )
    return
  }

  await conn.query(
    `CREATE OR REPLACE VIEW graph_cluster_exemplars AS
     SELECT
       NULL::INTEGER AS cluster_id,
       NULL::INTEGER AS rank,
       NULL::VARCHAR AS rag_chunk_id,
       NULL::VARCHAR AS paper_id,
       NULL::VARCHAR AS citekey,
       NULL::VARCHAR AS title,
       NULL::VARCHAR AS section_type,
       NULL::VARCHAR AS section_canonical,
       NULL::INTEGER AS page_number,
       NULL::DOUBLE AS exemplar_score,
       false AS is_representative,
       NULL::VARCHAR AS chunk_preview
     WHERE false`
  )
}
