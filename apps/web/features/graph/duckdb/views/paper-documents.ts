import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

export async function registerPaperDocumentViews(
  conn: AsyncDuckDBConnection,
  documentTable: string | null
) {
  if (documentTable) {
    await conn.query(
      `CREATE OR REPLACE VIEW paper_documents_web AS
       SELECT
         paper_id,
         NULL::VARCHAR AS source_embedding_id,
         citekey,
         title,
         NULL::VARCHAR AS source_payload_policy,
         NULL::VARCHAR AS source_text_hash,
         NULL::VARCHAR AS context_label,
         display_preview,
         COALESCE(payload_was_truncated, false) AS was_truncated,
         NULL::INTEGER AS context_char_count,
         NULL::INTEGER AS body_char_count,
         NULL::INTEGER AS text_char_count,
         NULL::INTEGER AS context_token_count,
         NULL::INTEGER AS body_token_count,
         journal,
         year,
         doi,
         CAST(pmid AS VARCHAR) AS pmid,
         pmcid,
         abstract,
         author_count,
         reference_count,
         asset_count,
         chunk_count,
         entity_count,
         relation_count,
         page_count,
         table_count,
         figure_count,
         text_availability,
         is_open_access,
         open_access_pdf_url,
         open_access_pdf_status,
         open_access_pdf_license,
         authors_json
       FROM ${documentTable}`
    )

    await conn.query(
      `CREATE OR REPLACE VIEW paper_catalog_web AS
       SELECT
         COALESCE(p.paperId, d.paper_id) AS paper_id,
         COALESCE(MAX(p.citekey), MAX(d.citekey)) AS citekey,
         COALESCE(MAX(p.paperTitle), MAX(d.title)) AS title,
         COALESCE(MAX(p.journal), MAX(d.journal)) AS journal,
         COALESCE(MAX(p.year), MAX(d.year)) AS year,
         MAX(d.doi) AS doi,
         MAX(d.pmid) AS pmid,
         MAX(d.pmcid) AS pmcid,
         MAX(d.abstract) AS abstract,
         COALESCE(MAX(d.authors_json), '[]') AS authors_json,
         COALESCE(MAX(p.paperAuthorCount), MAX(d.author_count)) AS author_count,
         COALESCE(MAX(p.paperReferenceCount), MAX(d.reference_count)) AS reference_count,
         MAX(d.asset_count) AS asset_count,
         MAX(d.chunk_count) AS chunk_count,
         COALESCE(MAX(p.paperEntityCount), MAX(d.entity_count)) AS entity_count,
         COALESCE(MAX(p.paperRelationCount), MAX(d.relation_count)) AS relation_count,
         NULL::INTEGER AS sentence_count,
         MAX(d.page_count) AS page_count,
         MAX(d.table_count) AS table_count,
         MAX(d.figure_count) AS figure_count,
         MAX(d.text_availability) AS text_availability,
         MAX(d.is_open_access) AS is_open_access,
         MAX(d.open_access_pdf_url) AS open_access_pdf_url,
         MAX(d.open_access_pdf_status) AS open_access_pdf_status,
         MAX(d.open_access_pdf_license) AS open_access_pdf_license,
         COUNT(*) FILTER (WHERE p.id IS NOT NULL) AS graph_point_count,
         COUNT(DISTINCT CASE WHEN p.clusterId > 0 THEN p.clusterId END) AS graph_cluster_count
       FROM current_paper_points_web p
         FULL OUTER JOIN paper_documents_web d
           ON p.paperId = d.paper_id
       GROUP BY
         COALESCE(p.paperId, d.paper_id)`
    )
    return
  }

  await conn.query(
    `CREATE OR REPLACE VIEW paper_documents_web AS
     SELECT
       NULL::VARCHAR AS paper_id,
       NULL::VARCHAR AS source_embedding_id,
       NULL::VARCHAR AS citekey,
       NULL::VARCHAR AS title,
       NULL::VARCHAR AS source_payload_policy,
       NULL::VARCHAR AS source_text_hash,
       NULL::VARCHAR AS context_label,
       NULL::VARCHAR AS display_preview,
       false AS was_truncated,
       NULL::INTEGER AS context_char_count,
       NULL::INTEGER AS body_char_count,
       NULL::INTEGER AS text_char_count,
       NULL::INTEGER AS context_token_count,
       NULL::INTEGER AS body_token_count,
       NULL::VARCHAR AS journal,
       NULL::INTEGER AS year,
       NULL::VARCHAR AS doi,
       NULL::VARCHAR AS pmid,
       NULL::VARCHAR AS pmcid,
       NULL::VARCHAR AS abstract,
       NULL::INTEGER AS author_count,
       NULL::INTEGER AS reference_count,
       NULL::INTEGER AS asset_count,
       NULL::INTEGER AS chunk_count,
       NULL::INTEGER AS entity_count,
       NULL::INTEGER AS relation_count,
       NULL::INTEGER AS page_count,
       NULL::INTEGER AS table_count,
       NULL::INTEGER AS figure_count,
       NULL::VARCHAR AS text_availability,
       NULL::BOOLEAN AS is_open_access,
       NULL::VARCHAR AS open_access_pdf_url,
       NULL::VARCHAR AS open_access_pdf_status,
       NULL::VARCHAR AS open_access_pdf_license,
       '[]' AS authors_json
     WHERE false`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW paper_catalog_web AS
     SELECT
       NULL::VARCHAR AS paper_id,
       NULL::VARCHAR AS citekey,
       NULL::VARCHAR AS title,
       NULL::VARCHAR AS journal,
       NULL::INTEGER AS year,
       NULL::VARCHAR AS doi,
       NULL::VARCHAR AS pmid,
       NULL::VARCHAR AS pmcid,
       NULL::VARCHAR AS abstract,
       '[]' AS authors_json,
       NULL::INTEGER AS author_count,
       NULL::INTEGER AS reference_count,
       NULL::INTEGER AS asset_count,
       NULL::INTEGER AS chunk_count,
       NULL::INTEGER AS entity_count,
       NULL::INTEGER AS relation_count,
       NULL::INTEGER AS sentence_count,
       NULL::INTEGER AS page_count,
       NULL::INTEGER AS table_count,
       NULL::INTEGER AS figure_count,
       NULL::VARCHAR AS text_availability,
       NULL::BOOLEAN AS is_open_access,
       NULL::VARCHAR AS open_access_pdf_url,
       NULL::VARCHAR AS open_access_pdf_status,
       NULL::VARCHAR AS open_access_pdf_license,
       NULL::BIGINT AS graph_point_count,
       NULL::BIGINT AS graph_cluster_count
     WHERE false`
  )
}
