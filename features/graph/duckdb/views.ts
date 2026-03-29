import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

import { escapeSqlString, getAbsoluteUrl, queryRows } from './queries'
import { validateTableName, buildPlaceholderList } from './utils'

export async function resolveBundleRelations(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  tableNames: string[],
  bundleAttached = false
): Promise<boolean> {
  const selectedTableNames = [...new Set(tableNames)].filter(
    (tableName) => Boolean(bundle.bundleManifest.tables[tableName])
  )

  if (selectedTableNames.length === 0) {
    return bundleAttached
  }

  const probeTable = selectedTableNames[0]

  if (!probeTable) {
    throw new Error('Graph bundle manifest does not declare any tables')
  }

  if (bundle.duckdbUrl) {
    const absoluteDuckdbUrl = getAbsoluteUrl(bundle.duckdbUrl)
    try {
      if (!bundleAttached) {
        await conn.query(`ATTACH '${escapeSqlString(absoluteDuckdbUrl)}' AS graph_bundle`)
        await conn.query(`SELECT 1 FROM graph_bundle.${validateTableName(probeTable)} LIMIT 1`)
      }

      for (const tableName of selectedTableNames) {
        const safe = validateTableName(tableName)
        await conn.query(
          `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM graph_bundle.${safe}`
        )
      }
      return true
    } catch {
      // Fall back to direct parquet table registration below.
    }
  }

  for (const tableName of selectedTableNames) {
    const tableUrl = bundle.tableUrls[tableName]
    if (!tableUrl) {
      continue
    }
    const safe = validateTableName(tableName)
    const absoluteTableUrl = getAbsoluteUrl(tableUrl)
    await conn.query(
      `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM read_parquet('${escapeSqlString(
        absoluteTableUrl
      )}')`
    )
  }

  return bundleAttached
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
     JOIN active_points_web src
       ON src.id = l.source_node_id
     JOIN active_points_web dst
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
     JOIN active_paper_points_web src
       ON src.id = l.source_node_id
     JOIN active_paper_points_web dst
       ON dst.id = l.target_node_id
     WHERE l.link_kind = 'citation'`
  )
}

export async function registerUniversePointView(
  conn: AsyncDuckDBConnection,
  args: {
    sourceTable: string | null
    selectSql: (tableName: string, indexSql: string) => string
  }
) {
  const { sourceTable, selectSql } = args
  if (sourceTable) {
    await conn.query(
      `CREATE OR REPLACE VIEW universe_points_web AS
       ${selectSql(sourceTable, 'point_index')}`
    )
    return
  }

  await conn.query(
    `CREATE OR REPLACE VIEW universe_points_web AS
     SELECT * FROM base_points_web WHERE false`
  )
}

export async function initializeOverlayMembershipTable(conn: AsyncDuckDBConnection) {
  await conn.query(`DROP TABLE IF EXISTS overlay_point_ids`)
  await conn.query(
    `CREATE TEMP TABLE overlay_point_ids (
       id VARCHAR PRIMARY KEY
     )`
  )
}

export async function registerActivePointViews(conn: AsyncDuckDBConnection) {
  await conn.query(
    `CREATE OR REPLACE VIEW overlay_points_web AS
     SELECT
       * REPLACE ('overlay' AS nodeRole, true AS isOverlayActive)
     FROM universe_points_web
     WHERE id IN (SELECT id FROM overlay_point_ids)
       AND id NOT IN (SELECT id FROM base_points_web)`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_points_web AS
     WITH unioned AS (
       SELECT * FROM base_points_web
       UNION ALL
       SELECT * FROM overlay_points_web
     )
     SELECT
       ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN COALESCE(nodeRole, 'primary') = 'overlay' THEN 1 ELSE 0 END,
           index,
           sourcePointIndex,
           id
       )::INTEGER - 1 AS index,
       unioned.* EXCLUDE (index)
     FROM unioned`
  )

  await conn.query(
    `CREATE OR REPLACE VIEW active_paper_points_web AS
     WITH paper_points AS (
       SELECT *
       FROM active_points_web
       WHERE nodeKind = 'paper'
     )
     SELECT
       ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN COALESCE(nodeRole, 'primary') = 'overlay' THEN 1 ELSE 0 END,
           index,
           sourcePointIndex,
           id
       )::INTEGER - 1 AS index,
       paper_points.* EXCLUDE (index),
       ROW_NUMBER() OVER (
         ORDER BY
           CASE WHEN COALESCE(nodeRole, 'primary') = 'overlay' THEN 1 ELSE 0 END,
           index,
           sourcePointIndex,
           id
       )::INTEGER - 1 AS paperIndex
     FROM paper_points`
  )
}

export async function replaceOverlayPointIds(
  conn: AsyncDuckDBConnection,
  pointIds: string[]
): Promise<{ overlayCount: number }> {
  const uniqueIds = [...new Set(pointIds.filter((pointId) => pointId.trim().length > 0))]

  await conn.query(`DELETE FROM overlay_point_ids`)
  if (uniqueIds.length > 0) {
    const statement = await conn.prepare(
      `INSERT INTO overlay_point_ids
       SELECT id
       FROM universe_points_web
       WHERE id IN (${buildPlaceholderList(uniqueIds.length)})
         AND id NOT IN (SELECT id FROM base_points_web)`
    )
    try {
      await statement.query(...uniqueIds)
    } finally {
      await statement.close()
    }
  }

  const rows = await queryRows<{ count: number }>(
    conn,
    `SELECT count(*)::INTEGER AS count FROM overlay_points_web`
  )

  return { overlayCount: rows[0]?.count ?? 0 }
}

export async function clearOverlayPointIds(conn: AsyncDuckDBConnection): Promise<void> {
  await conn.query(`DELETE FROM overlay_point_ids`)
}

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
         COALESCE(MAX(p.doi), MAX(d.doi)) AS doi,
         COALESCE(MAX(p.pmid), MAX(d.pmid)) AS pmid,
         COALESCE(MAX(p.pmcid), MAX(d.pmcid)) AS pmcid,
         MAX(d.abstract) AS abstract,
         COALESCE(MAX(d.authors_json), '[]') AS authors_json,
         COALESCE(MAX(p.paperAuthorCount), MAX(d.author_count)) AS author_count,
         COALESCE(MAX(p.paperReferenceCount), MAX(d.reference_count)) AS reference_count,
         COALESCE(MAX(p.paperAssetCount), MAX(d.asset_count)) AS asset_count,
         COALESCE(MAX(p.paperChunkCount), MAX(d.chunk_count)) AS chunk_count,
         COALESCE(MAX(p.paperEntityCount), MAX(d.entity_count)) AS entity_count,
         COALESCE(MAX(p.paperRelationCount), MAX(d.relation_count)) AS relation_count,
         NULL::INTEGER AS sentence_count,
         COALESCE(MAX(p.paperPageCount), MAX(d.page_count)) AS page_count,
         COALESCE(MAX(p.paperTableCount), MAX(d.table_count)) AS table_count,
         COALESCE(MAX(p.paperFigureCount), MAX(d.figure_count)) AS figure_count,
         MAX(d.text_availability) AS text_availability,
         MAX(d.is_open_access) AS is_open_access,
         MAX(d.open_access_pdf_url) AS open_access_pdf_url,
         MAX(d.open_access_pdf_status) AS open_access_pdf_status,
         MAX(d.open_access_pdf_license) AS open_access_pdf_license,
         COUNT(*) FILTER (WHERE p.id IS NOT NULL) AS graph_point_count,
         COUNT(DISTINCT CASE WHEN p.clusterId > 0 THEN p.clusterId END) AS graph_cluster_count
       FROM active_paper_points_web p
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
