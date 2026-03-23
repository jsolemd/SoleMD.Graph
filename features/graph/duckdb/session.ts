import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { NOISE_COLOR, NOISE_COLOR_LIGHT, DEFAULT_POINT_COLOR } from '@/features/graph/lib/brand-colors'
import { getPaletteColors } from '@/features/graph/lib/colors'
import {
  buildGeoNodes,
  buildGeoStats,
  buildGraphData,
  buildPaperNodes,
  buildPaperStats,
  type GeoPointRow,
  type GraphClusterRow,
  type GraphFacetRow,
  type GraphPointRow,
  type PaperPointRow,
} from '@/features/graph/lib/transform'
import type {
  AuthorGeoRow,
  GeoCitationLink,
  GeoLink,
  GraphBundle,
  GraphClusterDetail,
  GraphData,
  GraphNode,
  GraphQueryResult,
  GraphSelectionDetail,
  MapLayer,
  PaperDocument,
} from '@/features/graph/types'

import { createConnection, closeConnection } from './connection'
import {
  mapCluster,
  mapExemplar,
  mapPaper,
  mapChunkDetail,
  mapPaperDocument,
  type GraphClusterDetailRow,
  type GraphClusterExemplarRow,
  type GraphPaperDetailRow,
  type GraphChunkDetailRow,
  type PaperDocumentRow,
} from './mappers'
import { escapeSqlString, getAbsoluteUrl, executeReadOnlyQuery, queryRows } from './queries'

const CACHE_MAX_ENTRIES = 200

/** Simple bounded Map that evicts the oldest entry when full. */
function createBoundedCache<K, V>(max = CACHE_MAX_ENTRIES): Map<K, V> {
  const map = new Map<K, V>()
  const originalSet = map.set.bind(map)
  map.set = (key: K, value: V) => {
    if (map.size >= max && !map.has(key)) {
      const oldest = map.keys().next().value
      if (oldest !== undefined) map.delete(oldest)
    }
    return originalSet(key, value)
  }
  return map
}

const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/i

function validateTableName(name: string): string {
  if (!TABLE_NAME_RE.test(name)) {
    throw new Error(`Invalid table name: ${name}`)
  }
  return name
}

export interface GraphCanvasSource {
  duckDBConnection: {
    connection: AsyncDuckDBConnection
    duckdb: import('@duckdb/duckdb-wasm').AsyncDuckDB
  }
  pointsTableName: string
}

interface GraphBundleSession {
  availableLayers: MapLayer[]
  canvas: GraphCanvasSource
  data: GraphData
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getInstitutionAuthors: (institutionKey: string) => Promise<AuthorGeoRow[]>
  getAuthorInstitutions: (name: string, orcid: string | null) => Promise<AuthorGeoRow[]>
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
  getSelectionDetail: (node: GraphNode) => Promise<GraphSelectionDetail>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}

const DEFAULT_CLUSTER_COLORS = getPaletteColors('default', 'dark')
const DEFAULT_CLUSTER_COLORS_LIGHT = getPaletteColors('default', 'light')
const sessionCache = new Map<string, Promise<GraphBundleSession>>()

async function resolveBundleRelations(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle
): Promise<void> {
  const absoluteDuckdbUrl = getAbsoluteUrl(bundle.duckdbUrl)
  const probeTable = Object.keys(bundle.bundleManifest.tables)[0]

  if (!probeTable) {
    throw new Error('Graph bundle manifest does not declare any tables')
  }

  try {
    await conn.query(`ATTACH '${escapeSqlString(absoluteDuckdbUrl)}' AS graph_bundle`)
    await conn.query(`SELECT 1 FROM graph_bundle.${validateTableName(probeTable)} LIMIT 1`)

    for (const tableName of Object.keys(bundle.bundleManifest.tables)) {
      const safe = validateTableName(tableName)
      await conn.query(
        `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM graph_bundle.${safe}`
      )
    }
  } catch {
    for (const [tableName, tableUrl] of Object.entries(bundle.tableUrls)) {
      const safe = validateTableName(tableName)
      const absoluteTableUrl = getAbsoluteUrl(tableUrl)
      await conn.query(
        `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM read_parquet('${escapeSqlString(
          absoluteTableUrl
        )}')`
      )
    }
  }
}

/* ─── Reusable SQL query helpers ────────────────────────────────── */

async function queryClusterRows(
  conn: AsyncDuckDBConnection,
  clusterId: number
): Promise<GraphClusterDetailRow[]> {
  return queryRows<GraphClusterDetailRow>(
    conn,
    `SELECT
      cluster_id,
      label,
      label_mode,
      member_count,
      centroid_x,
      centroid_y,
      representative_rag_chunk_id,
      label_source,
      candidate_count,
      entity_candidate_count,
      lexical_candidate_count,
      mean_cluster_probability,
      mean_outlier_score,
      paper_count,
      is_noise
    FROM graph_clusters
    WHERE cluster_id = ?
    LIMIT 1`,
    [clusterId]
  )
}

async function queryExemplarRows(
  conn: AsyncDuckDBConnection,
  clusterId: number
): Promise<GraphClusterExemplarRow[]> {
  return queryRows<GraphClusterExemplarRow>(
    conn,
    `SELECT
      cluster_id,
      rank,
      rag_chunk_id,
      paper_id,
      citekey,
      title,
      section_type,
      section_canonical,
      page_number,
      exemplar_score,
      is_representative,
      chunk_preview
    FROM graph_cluster_exemplars
    WHERE cluster_id = ?
    ORDER BY rank
    LIMIT 5`,
    [clusterId]
  )
}

async function queryPaperDocument(
  conn: AsyncDuckDBConnection,
  paperId: string
): Promise<PaperDocument | null> {
  const rows = await queryRows<PaperDocumentRow>(
    conn,
    `SELECT
      paper_id,
      source_embedding_id,
      citekey,
      title,
      source_payload_policy,
      source_text_hash,
      context_label,
      display_preview,
      was_truncated,
      context_char_count,
      body_char_count,
      text_char_count,
      context_token_count,
      body_token_count
    FROM paper_documents_web
    WHERE paper_id = ?
    LIMIT 1`,
    [paperId]
  )
  return rows[0] ? mapPaperDocument(rows[0]) : null
}

async function queryPaperDetail(
  conn: AsyncDuckDBConnection,
  paperId: string
): Promise<GraphPaperDetailRow[]> {
  return queryRows<GraphPaperDetailRow>(
    conn,
    `SELECT
      paper_id,
      citekey,
      title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      abstract,
      authors_json,
      author_count,
      reference_count,
      asset_count,
      chunk_count,
      entity_count,
      relation_count,
      sentence_count,
      page_count,
      table_count,
      figure_count,
      graph_point_count,
      graph_cluster_count
    FROM graph_papers
    WHERE paper_id = ?
    LIMIT 1`,
    [paperId]
  )
}

async function createGraphBundleSession(bundle: GraphBundle): Promise<GraphBundleSession> {
  const { conn, db, worker } = await createConnection()

  try {
    await resolveBundleRelations(conn, bundle)
    const hasCorpusGraph = Boolean(bundle.bundleManifest.tables.corpus_points)
    const pointTable = validateTableName(hasCorpusGraph ? 'corpus_points' : 'graph_points')
    const clusterTable = validateTableName(hasCorpusGraph ? 'corpus_clusters' : 'graph_clusters')
    const facetTable =
      hasCorpusGraph && bundle.bundleManifest.tables.corpus_facets
        ? validateTableName('corpus_facets')
        : bundle.bundleManifest.tables.graph_facets
          ? validateTableName('graph_facets')
          : null
    const exemplarTable =
      hasCorpusGraph && bundle.bundleManifest.tables.corpus_cluster_exemplars
        ? validateTableName('corpus_cluster_exemplars')
        : bundle.bundleManifest.tables.graph_cluster_exemplars
          ? validateTableName('graph_cluster_exemplars')
          : null
    const documentTable =
      hasCorpusGraph && bundle.bundleManifest.tables.corpus_documents
        ? validateTableName('corpus_documents')
        : bundle.bundleManifest.tables.paper_documents
          ? validateTableName('paper_documents')
          : null
    const corpusLinksTable =
      hasCorpusGraph && bundle.bundleManifest.tables.corpus_links
        ? validateTableName('corpus_links')
        : null
    const colorCase = DEFAULT_CLUSTER_COLORS.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    const colorCaseLight = DEFAULT_CLUSTER_COLORS_LIGHT.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    await conn.query(
      hasCorpusGraph
        ? `CREATE OR REPLACE VIEW graph_points_web AS
           SELECT
             point_index AS index,
             id,
             id AS node_id,
             node_kind AS nodeKind,
             node_role AS nodeRole,
             COALESCE(hex_color, CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS.length})
             ${colorCase}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END) AS hexColor,
             COALESCE(hex_color_light, CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR_LIGHT}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS_LIGHT.length})
             ${colorCaseLight}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END) AS hexColorLight,
             x,
             y,
             COALESCE(cluster_id, 0) AS clusterId,
             cluster_label AS clusterLabel,
             COALESCE(cluster_probability, 0) AS clusterProbability,
             COALESCE(outlier_score, 0) AS outlierScore,
             paper_id AS paperId,
             title AS paperTitle,
             citekey,
             journal,
             year,
             doi,
             CAST(pmid AS VARCHAR) AS pmid,
             pmcid,
             stable_chunk_id AS stableChunkId,
             chunk_index AS chunkIndex,
             section_canonical AS sectionCanonical,
             json_extract_string(payload_json, '$.section_type') AS sectionType,
             page_number AS pageNumber,
             token_count AS tokenCount,
             char_count AS charCount,
             chunk_kind AS chunkKind,
             chunk_preview AS chunkPreview,
             display_label AS displayLabel,
             search_text AS searchText,
             canonical_name AS canonicalName,
             category,
             definition,
             semantic_types_csv AS semanticTypes,
             semantic_groups_csv AS semanticGroups,
             organ_systems_csv AS organSystems,
             aliases_csv AS aliasesCsv,
             CAST(mention_count AS DOUBLE) AS mentionCount,
             CAST(paper_count AS DOUBLE) AS paperCount,
             CAST(chunk_count AS DOUBLE) AS chunkCount,
             CAST(relation_count AS DOUBLE) AS relationCount,
             CAST(alias_count AS DOUBLE) AS aliasCount,
             relation_type AS relationType,
             relation_category AS relationCategory,
             relation_direction AS relationDirection,
             relation_certainty AS relationCertainty,
             assertion_status AS assertionStatus,
             evidence_status AS evidenceStatus,
             alias_text AS aliasText,
             alias_type AS aliasType,
             CAST(alias_quality_score AS DOUBLE) AS aliasQualityScore,
             alias_source AS aliasSource,
             COALESCE(is_default_visible, true) AS isDefaultVisible,
             payload_json AS payloadJson,
             json_extract_string(payload_json, '$.display_preview') AS displayPreview,
             COALESCE(
               TRY_CAST(json_extract(payload_json, '$.was_truncated') AS BOOLEAN),
               false
             ) AS payloadWasTruncated,
             paper_author_count AS paperAuthorCount,
             paper_reference_count AS paperReferenceCount,
             paper_asset_count AS paperAssetCount,
             paper_chunk_count AS paperChunkCount,
             CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
             CAST(paper_relation_count AS DOUBLE) AS paperRelationCount,
             paper_sentence_count AS paperSentenceCount,
             paper_page_count AS paperPageCount,
             paper_table_count AS paperTableCount,
             paper_figure_count AS paperFigureCount,
             COALESCE(paper_cluster_index, 0) AS paperClusterIndex,
             false AS hasTableContext,
             false AS hasFigureContext
           FROM ${pointTable}`
        : `CREATE OR REPLACE VIEW graph_points_web AS
           SELECT
             point_index AS index,
             node_id AS id,
             node_id AS node_id,
             'chunk' AS nodeKind,
             'primary' AS nodeRole,
             CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS.length})
             ${colorCase}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END AS hexColor,
             CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR_LIGHT}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS_LIGHT.length})
             ${colorCaseLight}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END AS hexColorLight,
             x,
             y,
             COALESCE(cluster_id, 0) AS clusterId,
             cluster_label AS clusterLabel,
             COALESCE(cluster_probability, 0) AS clusterProbability,
             COALESCE(outlier_score, 0) AS outlierScore,
             paper_id AS paperId,
             title AS paperTitle,
             citekey,
             journal,
             year,
             doi,
             CAST(pmid AS VARCHAR) AS pmid,
             pmcid,
             stable_chunk_id AS stableChunkId,
             chunk_index AS chunkIndex,
             section_canonical AS sectionCanonical,
             NULL::VARCHAR AS sectionType,
             page_number AS pageNumber,
             token_count AS tokenCount,
             char_count AS charCount,
             chunk_kind AS chunkKind,
             chunk_preview AS chunkPreview,
             chunk_preview AS displayLabel,
             chunk_preview AS searchText,
             NULL::VARCHAR AS canonicalName,
             NULL::VARCHAR AS category,
             NULL::VARCHAR AS semanticGroups,
             NULL::VARCHAR AS organSystems,
             NULL::DOUBLE AS mentionCount,
             NULL::DOUBLE AS paperCount,
             NULL::DOUBLE AS chunkCount,
             NULL::DOUBLE AS relationCount,
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
             true AS isDefaultVisible,
             NULL::VARCHAR AS payloadJson,
             NULL::VARCHAR AS displayPreview,
             false AS payloadWasTruncated,
             paper_author_count AS paperAuthorCount,
             paper_reference_count AS paperReferenceCount,
             paper_asset_count AS paperAssetCount,
             paper_chunk_count AS paperChunkCount,
             CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
             CAST(paper_relation_count AS DOUBLE) AS paperRelationCount,
             paper_sentence_count AS paperSentenceCount,
             paper_page_count AS paperPageCount,
             paper_table_count AS paperTableCount,
             paper_figure_count AS paperFigureCount,
             COALESCE(has_table_context, false) AS hasTableContext,
             COALESCE(has_figure_context, false) AS hasFigureContext
           FROM ${pointTable}`
    )

    await conn.query(
      `CREATE OR REPLACE VIEW corpus_links_web AS
       ${
         corpusLinksTable
           ? `SELECT
                source_node_id,
                source_point_index,
                target_node_id,
                target_point_index,
                link_kind,
                weight,
                is_directed,
                is_default_visible,
                certainty,
                relation_id,
                paper_id
              FROM ${corpusLinksTable}`
           : `SELECT
                NULL::VARCHAR AS source_node_id,
                NULL::INTEGER AS source_point_index,
                NULL::VARCHAR AS target_node_id,
                NULL::INTEGER AS target_point_index,
                NULL::VARCHAR AS link_kind,
                NULL::DOUBLE AS weight,
                false AS is_directed,
                false AS is_default_visible,
                NULL::VARCHAR AS certainty,
                NULL::VARCHAR AS relation_id,
                NULL::VARCHAR AS paper_id
              WHERE false`
       }`
    )

    await conn.query(
      bundle.bundleManifest.tables.paper_points && !hasCorpusGraph
        ? `CREATE OR REPLACE VIEW paper_points_web AS
             SELECT
               point_index AS index,
               id,
               id AS node_id,
               paper_id AS paperId,
               x,
               y,
               COALESCE(cluster_id, 0) AS clusterId,
               cluster_label AS clusterLabel,
               COALESCE(cluster_probability, 0) AS clusterProbability,
               COALESCE(outlier_score, 0) AS outlierScore,
               citekey,
               title AS paperTitle,
               journal,
               year,
               doi,
               CAST(pmid AS VARCHAR) AS pmid,
               pmcid,
               NULL::VARCHAR AS chunkPreview,
               display_preview AS displayPreview,
               COALESCE(payload_was_truncated, false) AS payloadWasTruncated,
               paper_author_count AS paperAuthorCount,
               paper_reference_count AS paperReferenceCount,
               paper_asset_count AS paperAssetCount,
               paper_chunk_count AS paperChunkCount,
               CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
               CAST(paper_relation_count AS DOUBLE) AS paperRelationCount,
               paper_sentence_count AS paperSentenceCount,
               paper_page_count AS paperPageCount,
               paper_table_count AS paperTableCount,
               paper_figure_count AS paperFigureCount
             FROM paper_points`
        : `CREATE OR REPLACE VIEW paper_points_web AS
           SELECT * REPLACE ((ROW_NUMBER() OVER (ORDER BY index) - 1)::INTEGER AS index),
                  (ROW_NUMBER() OVER (ORDER BY index) - 1)::INTEGER AS paperIndex
           FROM graph_points_web WHERE nodeKind = 'paper'`
    )

    // Paper links: extract citation edges from corpus_links, joining against
    // paper_points_web to get the re-indexed (0-based) paper indices that
    // Cosmograph requires for its WebGL buffer.
    await conn.query(
      hasCorpusGraph && bundle.bundleManifest.tables.corpus_links
        ? `CREATE OR REPLACE VIEW paper_links AS
           SELECT
             l.source_node_id,
             src.paperIndex AS source_point_index,
             l.target_node_id,
             dst.paperIndex AS target_point_index
           FROM ${corpusLinksTable} l
           JOIN paper_points_web src ON src.id = l.source_node_id
           JOIN paper_points_web dst ON dst.id = l.target_node_id
           WHERE l.link_kind = 'citation'`
        : bundle.bundleManifest.tables.paper_links
          ? `CREATE OR REPLACE VIEW paper_links AS
             SELECT
               source_node_id,
               source_point_index,
               target_node_id,
               target_point_index
             FROM paper_links`
        : `CREATE OR REPLACE VIEW paper_links AS
           SELECT
             NULL::VARCHAR AS source_node_id,
             NULL::INTEGER AS source_point_index,
             NULL::VARCHAR AS target_node_id,
             NULL::INTEGER AS target_point_index
           WHERE false`
    )

    await conn.query(
      hasCorpusGraph
        ? `CREATE OR REPLACE VIEW graph_clusters AS
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
        : `CREATE OR REPLACE VIEW graph_clusters AS SELECT * FROM ${clusterTable}`
    )

    if (facetTable) {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_facets AS
         SELECT * FROM ${facetTable}`
      )
    } else {
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

    const availableLayers: MapLayer[] = ['chunk']

    if (hasCorpusGraph && documentTable) {
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
        `CREATE OR REPLACE VIEW graph_papers AS
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
         FROM paper_points_web p
         FULL OUTER JOIN paper_documents_web d
           ON p.paperId = d.paper_id
         GROUP BY
           COALESCE(p.paperId, d.paper_id)`
      )
    } else if (bundle.bundleManifest.tables.paper_documents) {
      await conn.query(
        `CREATE OR REPLACE VIEW paper_documents_web AS
         SELECT
           paper_id,
           source_embedding_id,
           citekey,
           title,
           source_payload_policy,
           source_text_hash,
           context_label,
           display_preview,
           was_truncated,
           context_char_count,
           body_char_count,
           text_char_count,
           context_token_count,
           body_token_count,
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
         FROM paper_documents`
      )
    } else {
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
    }

    // Fallback: graph_papers is only created above when hasCorpusGraph && documentTable.
    // For non-corpus bundles (or corpus bundles without a document table), create an
    // empty fallback so that paper detail queries don't error on a missing view.
    if (!(hasCorpusGraph && documentTable)) {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_papers AS
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

    if (hasCorpusGraph) {
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
           gp.outlierScore AS outlier_score,
           NULL::VARCHAR AS source_embedding_id
         FROM graph_points_web gp
         LEFT JOIN graph_papers papers ON papers.paper_id = gp.paperId
         WHERE gp.nodeKind = 'chunk'`
      )
    } else if (!bundle.bundleManifest.tables.graph_chunk_details) {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_chunk_details AS
         SELECT
           NULL::VARCHAR AS rag_chunk_id,
           NULL::VARCHAR AS paper_id,
           NULL::VARCHAR AS citekey,
           NULL::VARCHAR AS title,
           NULL::VARCHAR AS journal,
           NULL::INTEGER AS year,
           NULL::VARCHAR AS doi,
           NULL::VARCHAR AS pmid,
           NULL::VARCHAR AS pmcid,
           NULL::VARCHAR AS stable_chunk_id,
           NULL::INTEGER AS chunk_index,
           NULL::VARCHAR AS section_type,
           NULL::VARCHAR AS section_canonical,
           NULL::VARCHAR AS section_path,
           NULL::INTEGER AS page_number,
           NULL::INTEGER AS token_count,
           NULL::INTEGER AS char_count,
           NULL::VARCHAR AS chunk_kind,
           NULL::VARCHAR AS block_type,
           NULL::VARCHAR AS block_id,
           NULL::VARCHAR AS chunk_text,
           NULL::VARCHAR AS chunk_preview,
           NULL::VARCHAR AS abstract,
           NULL::INTEGER AS cluster_id,
           NULL::VARCHAR AS cluster_label,
           NULL::DOUBLE AS cluster_probability,
           NULL::DOUBLE AS outlier_score,
           NULL::VARCHAR AS source_embedding_id
         WHERE false`
      )
    }

    if (hasCorpusGraph && exemplarTable) {
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
         LEFT JOIN graph_points_web p
           ON p.id = e.node_id`
      )
    } else if (!bundle.bundleManifest.tables.graph_cluster_exemplars) {
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

    availableLayers.push('paper')

    // Geo layer — real-world lat/lng, no UMAP/HDBSCAN
    if (bundle.bundleManifest.tables.geo_points) {
      await conn.query(
        `CREATE OR REPLACE VIEW geo_points_web AS
        SELECT
          point_index AS index,
          node_id AS id,
          COALESCE(color_hex, '${DEFAULT_POINT_COLOR}') AS hexColor,
          -- TODO: geo_points parquet lacks a color_hex_light column. Once the
          -- pipeline emits a light-palette variant, use it here instead of
          -- reusing the dark color.
          COALESCE(color_hex, '${DEFAULT_POINT_COLOR}') AS hexColorLight,
          x,
          y,
          COALESCE(cluster_id, 0) AS clusterId,
          cluster_label AS clusterLabel,
          1.0 AS clusterProbability,
          0.0 AS outlierScore,
          '' AS paperId,
          institution AS paperTitle,
          '' AS citekey,
          NULL::VARCHAR AS journal,
          first_year AS year,
          NULL::VARCHAR AS doi,
          NULL::VARCHAR AS pmid,
          NULL::VARCHAR AS pmcid,
          institution AS chunkPreview,
          -- Geo-specific columns
          institution,
          ror_id AS rorId,
          city,
          region,
          country,
          country_code AS countryCode,
          COALESCE(paper_count, 0) AS paperCount,
          COALESCE(author_count, 0) AS authorCount,
          first_year AS firstYear,
          last_year AS lastYear,
          COALESCE(size_value, paper_count, 1) AS sizeValue,
          -- Placeholder columns for crossfilter compatibility
          NULL::VARCHAR AS stableChunkId,
          NULL::INTEGER AS chunkIndex,
          NULL::VARCHAR AS sectionCanonical,
          NULL::INTEGER AS pageNumber,
          NULL::INTEGER AS tokenCount,
          NULL::INTEGER AS charCount,
          NULL::VARCHAR AS chunkKind,
          false AS hasTableContext,
          false AS hasFigureContext,
          NULL::INTEGER AS paperAuthorCount,
          NULL::INTEGER AS paperReferenceCount,
          NULL::INTEGER AS paperAssetCount,
          NULL::INTEGER AS paperChunkCount,
          NULL::DOUBLE AS paperEntityCount,
          NULL::DOUBLE AS paperRelationCount,
          NULL::INTEGER AS paperSentenceCount,
          NULL::INTEGER AS paperPageCount,
          NULL::INTEGER AS paperTableCount,
          NULL::INTEGER AS paperFigureCount
        FROM geo_points`
      )
      availableLayers.push('geo')

      // Geo links — collaboration edges between institutions
      if (bundle.bundleManifest.tables.geo_links) {
        await conn.query(
          `CREATE OR REPLACE VIEW geo_links_web AS
          SELECT
            source_node_id AS sourceId,
            source_point_index AS sourceIndex,
            target_node_id AS targetId,
            target_point_index AS targetIndex,
            paper_count AS paperCount
          FROM geo_links`
        )
      }

      // Geo citation links — citation edges between institutions
      if (bundle.bundleManifest.tables.geo_citation_links) {
        await conn.query(
          `CREATE OR REPLACE VIEW geo_citation_links_web AS
          SELECT
            source_node_id AS sourceId,
            source_point_index AS sourceIndex,
            target_node_id AS targetId,
            target_point_index AS targetIndex,
            citation_count AS citationCount
          FROM geo_citation_links`
        )
      }

      // Author-institution mapping for drill-down
      if (bundle.bundleManifest.tables.graph_author_geo) {
        await conn.query(
          `CREATE OR REPLACE VIEW author_geo_web AS
          SELECT
            paper_author_id AS authorId,
            name,
            surname,
            given_name AS givenName,
            orcid,
            citekey,
            paper_title AS paperTitle,
            year,
            institution,
            department,
            institution_key AS institutionKey
          FROM graph_author_geo`
        )
      }
    }

    const points = await queryRows<GraphPointRow>(
      conn,
      `SELECT
        index AS point_index,
        id,
        id AS node_id,
        nodeKind AS node_kind,
        nodeRole AS node_role,
        paperId AS paper_id,
        x,
        y,
        clusterId AS cluster_id,
        clusterLabel AS cluster_label,
        clusterProbability AS cluster_probability,
        outlierScore AS outlier_score,
        citekey,
        paperTitle AS title,
        journal,
        year,
        doi,
        pmid,
        pmcid,
        stableChunkId AS stable_chunk_id,
        chunkIndex AS chunk_index,
        sectionCanonical AS section_canonical,
        pageNumber AS page_number,
        tokenCount AS token_count,
        charCount AS char_count,
        chunkKind AS chunk_kind,
        chunkPreview AS chunk_preview,
        displayLabel AS display_label,
        searchText AS search_text,
        canonicalName AS canonical_name,
        category,
        semanticGroups AS semantic_groups_csv,
        organSystems AS organ_systems_csv,
        mentionCount AS mention_count,
        paperCount AS paper_count,
        chunkCount AS chunk_count,
        relationCount AS relation_count,
        aliasCount AS alias_count,
        relationType AS relation_type,
        relationCategory AS relation_category,
        relationDirection AS relation_direction,
        relationCertainty AS relation_certainty,
        assertionStatus AS assertion_status,
        evidenceStatus AS evidence_status,
        aliasText AS alias_text,
        aliasType AS alias_type,
        aliasQualityScore AS alias_quality_score,
        aliasSource AS alias_source,
        isDefaultVisible AS is_default_visible,
        payloadJson AS payload_json,
        paperAuthorCount AS paper_author_count,
        paperReferenceCount AS paper_reference_count,
        paperAssetCount AS paper_asset_count,
        paperChunkCount AS paper_chunk_count,
        paperEntityCount AS paper_entity_count,
        paperRelationCount AS paper_relation_count,
        paperSentenceCount AS paper_sentence_count,
        paperPageCount AS paper_page_count,
        paperTableCount AS paper_table_count,
        paperFigureCount AS paper_figure_count,
        hasTableContext AS has_table_context,
        hasFigureContext AS has_figure_context
      FROM graph_points_web
      ORDER BY index`
    )

    const clusters = await queryRows<GraphClusterRow>(
      conn,
      `SELECT
        cluster_id,
        label,
        label_mode,
        member_count,
        centroid_x,
        centroid_y,
        representative_rag_chunk_id,
        label_source,
        candidate_count,
        entity_candidate_count,
        lexical_candidate_count,
        mean_cluster_probability,
        mean_outlier_score,
        paper_count,
        is_noise
      FROM graph_clusters
      ORDER BY cluster_id`
    )

    const facets = facetTable
      ? await queryRows<GraphFacetRow>(
          conn,
          `SELECT
            facet_name,
            facet_value,
            facet_label,
            point_count,
            paper_count,
            cluster_count,
            sort_key
          FROM graph_facets
          ORDER BY facet_name, sort_key, facet_value`
        )
      : []

    const data = buildGraphData({
      points,
      clusters,
      facets,
    })

    // Load paper nodes — buildGraphData already extracts paper nodes from
    // the corpus graph, so we only need a separate query for standalone
    // paper bundles (paper_points table without a corpus graph).
    if (!hasCorpusGraph && bundle.bundleManifest.tables.paper_points) {
      const paperPointRows = await queryRows<PaperPointRow>(
        conn,
        `SELECT
          index AS point_index,
          id,
          id AS node_id,
          paperId AS paper_id,
          x,
          y,
          clusterId AS cluster_id,
          clusterLabel AS cluster_label,
          clusterProbability AS cluster_probability,
          outlierScore AS outlier_score,
          citekey,
          paperTitle AS title,
          journal,
          year,
          doi,
          pmid,
          pmcid,
          chunkPreview AS chunk_preview,
          displayPreview AS display_preview,
          payloadWasTruncated AS payload_was_truncated,
          paperAuthorCount AS paper_author_count,
          paperReferenceCount AS paper_reference_count,
          paperAssetCount AS paper_asset_count,
          paperChunkCount AS paper_chunk_count,
          paperEntityCount AS paper_entity_count,
          paperRelationCount AS paper_relation_count,
          paperSentenceCount AS paper_sentence_count,
          paperPageCount AS paper_page_count,
          paperTableCount AS paper_table_count,
          paperFigureCount AS paper_figure_count
        FROM paper_points_web
        ORDER BY index`
      )

      data.paperNodes = buildPaperNodes(paperPointRows)
      data.paperStats = buildPaperStats(data.paperNodes, data.clusters)
    }

    // Load geo nodes if geo layer is available
    if (availableLayers.includes('geo')) {
      const geoPointRows = await queryRows<GeoPointRow>(
        conn,
        `SELECT
          index AS point_index,
          id,
          id AS node_id,
          x,
          y,
          clusterId AS cluster_id,
          clusterLabel AS cluster_label,
          hexColor AS color_hex,
          sizeValue AS size_value,
          institution,
          rorId AS ror_id,
          city,
          region,
          country,
          countryCode AS country_code,
          paperCount AS paper_count,
          authorCount AS author_count,
          firstYear AS first_year,
          lastYear AS last_year
        FROM geo_points_web
        ORDER BY index`
      )

      data.geoNodes = buildGeoNodes(geoPointRows)
      data.geoStats = buildGeoStats(data.geoNodes)

      const geoNodeLookup = new Map(data.geoNodes.map((n) => [n.id, n]))

      // Load geo links (collaboration edges)
      if (bundle.bundleManifest.tables.geo_links) {
        const linkRows = await queryRows<{
          sourceId: string
          sourceIndex: number
          targetId: string
          targetIndex: number
          paperCount: number
        }>(
          conn,
          `SELECT sourceId, sourceIndex, targetId, targetIndex, paperCount
          FROM geo_links_web`
        )
        data.geoLinks = linkRows
          .map((row) => {
            const src = geoNodeLookup.get(row.sourceId)
            const tgt = geoNodeLookup.get(row.targetId)
            if (!src || !tgt) return null
            return {
              sourceId: row.sourceId,
              targetId: row.targetId,
              sourceIndex: row.sourceIndex,
              targetIndex: row.targetIndex,
              paperCount: row.paperCount ?? 1,
              sourceLng: src.x,
              sourceLat: src.y,
              targetLng: tgt.x,
              targetLat: tgt.y,
            } satisfies GeoLink
          })
          .filter((l): l is GeoLink => l !== null)
      }

      // Load geo citation links
      if (bundle.bundleManifest.tables.geo_citation_links) {
        const citationLinkRows = await queryRows<{
          sourceId: string
          sourceIndex: number
          targetId: string
          targetIndex: number
          citationCount: number
        }>(
          conn,
          `SELECT sourceId, sourceIndex, targetId, targetIndex, citationCount
          FROM geo_citation_links_web`
        )
        data.geoCitationLinks = citationLinkRows
          .map((row) => {
            const src = geoNodeLookup.get(row.sourceId)
            const tgt = geoNodeLookup.get(row.targetId)
            if (!src || !tgt) return null
            return {
              sourceId: row.sourceId,
              targetId: row.targetId,
              sourceIndex: row.sourceIndex,
              targetIndex: row.targetIndex,
              citationCount: row.citationCount ?? 1,
              sourceLng: src.x,
              sourceLat: src.y,
              targetLng: tgt.x,
              targetLat: tgt.y,
            } satisfies GeoCitationLink
          })
          .filter((l): l is GeoCitationLink => l !== null)
      }
    }

    const hasAuthorGeo = Boolean(bundle.bundleManifest.tables.graph_author_geo)
    const selectionCache = createBoundedCache<string, Promise<GraphSelectionDetail>>()
    const clusterCache = createBoundedCache<number, Promise<GraphClusterDetail>>()
    const paperDocumentCache = createBoundedCache<string, Promise<PaperDocument | null>>()
    const authorCache = createBoundedCache<string, Promise<AuthorGeoRow[]>>()

    return {
      availableLayers,
      canvas: {
        duckDBConnection: {
          duckdb: db,
          connection: conn,
        },
        pointsTableName: 'graph_points_web',
      },
      data,
      runReadOnlyQuery(sql: string) {
        return executeReadOnlyQuery(conn, sql)
      },
      getInstitutionAuthors(institutionKey: string) {
        const cached = authorCache.get(institutionKey)
        if (cached) return cached

        const next = (async (): Promise<AuthorGeoRow[]> => {
          if (!hasAuthorGeo) return []

          const rows = await queryRows<{
            authorId: string
            name: string | null
            surname: string | null
            givenName: string | null
            orcid: string | null
            citekey: string | null
            paperTitle: string | null
            year: number | null
            institution: string | null
            department: string | null
            institutionKey: string | null
          }>(
            conn,
            `SELECT * FROM author_geo_web WHERE institutionKey = ? ORDER BY year DESC, surname`,
            [institutionKey]
          )
          return rows.map((r) => ({ ...r }))
        })()

        authorCache.set(institutionKey, next)
        return next
      },
      getAuthorInstitutions(name: string, orcid: string | null) {
        const cacheKey = orcid ? `orcid:${orcid}` : `name:${name}`
        const cached = authorCache.get(cacheKey)
        if (cached) return cached

        const next = (async (): Promise<AuthorGeoRow[]> => {
          if (!hasAuthorGeo) return []

          const rows = await queryRows<{
            authorId: string
            name: string | null
            surname: string | null
            givenName: string | null
            orcid: string | null
            citekey: string | null
            paperTitle: string | null
            year: number | null
            institution: string | null
            department: string | null
            institutionKey: string | null
          }>(
            conn,
            orcid
              ? `SELECT * FROM author_geo_web WHERE orcid = ? ORDER BY year DESC, institutionKey`
              : `SELECT * FROM author_geo_web WHERE name = ? ORDER BY year DESC, institutionKey`,
            [orcid ?? name]
          )
          return rows.map((r) => ({ ...r }))
        })()

        authorCache.set(cacheKey, next)
        return next
      },
      getPaperDocument(paperId: string) {
        const cached = paperDocumentCache.get(paperId)
        if (cached) return cached

        const next = queryPaperDocument(conn, paperId)

        paperDocumentCache.set(paperId, next)
        return next
      },
      getClusterDetail(clusterId: number) {
        const cached = clusterCache.get(clusterId)
        if (cached) return cached

        const next = (async (): Promise<GraphClusterDetail> => {
          const [clusterRows, exemplarRows] = await Promise.all([
            queryClusterRows(conn, clusterId),
            queryExemplarRows(conn, clusterId),
          ])

          return {
            cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
            exemplars: exemplarRows.map(mapExemplar),
          }
        })()

        clusterCache.set(clusterId, next)
        return next
      },
      getSelectionDetail(node: GraphNode) {
        const cached = selectionCache.get(node.id)

        if (cached) {
          return cached
        }

        const next = (async (): Promise<GraphSelectionDetail> => {
          const [clusterRows, exemplarRows] = await Promise.all([
            queryClusterRows(conn, node.clusterId),
            queryExemplarRows(conn, node.clusterId),
          ])

          if (node.nodeKind === 'paper') {
            // Paper node: query paper details + cluster + exemplars (no chunk_details)
            const paperRows = await queryPaperDetail(conn, node.paperId ?? node.id)

            // Load paper document on demand
            const paperDocument = await queryPaperDocument(conn, node.paperId ?? node.id)

            return {
              chunk: null,
              cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
              exemplars: exemplarRows.map(mapExemplar),
              paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
              paperDocument,
            }
          }

          const paperRows = node.paperId
            ? await queryPaperDetail(conn, node.paperId)
            : []

          if (node.nodeKind !== 'chunk') {
            const paperDocument = node.paperId
              ? await queryPaperDocument(conn, node.paperId)
              : null

            return {
              chunk: null,
              cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
              exemplars: exemplarRows.map(mapExemplar),
              paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
              paperDocument,
            }
          }

          const chunkRows = await queryRows<GraphChunkDetailRow>(
            conn,
            `SELECT
              rag_chunk_id,
              paper_id,
              citekey,
              title,
              journal,
              year,
              doi,
              pmid,
              pmcid,
              stable_chunk_id,
              chunk_index,
              section_type,
              section_canonical,
              section_path,
              page_number,
              token_count,
              char_count,
              chunk_kind,
              block_type,
              block_id,
              chunk_text,
              chunk_preview,
              abstract,
              cluster_id,
              cluster_label,
              cluster_probability,
              outlier_score,
              source_embedding_id
            FROM graph_chunk_details
            WHERE rag_chunk_id = ?
            LIMIT 1`,
            [node.id]
          )

          return {
            chunk: chunkRows[0] ? mapChunkDetail(chunkRows[0]) : null,
            cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
            exemplars: exemplarRows.map(mapExemplar),
            paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
            paperDocument: null,
          }
        })()

        selectionCache.set(node.id, next)
        return next
      },
    }
  } catch (error) {
    await closeConnection(conn, db, worker)
    throw error
  }
}

export function loadGraphBundle(bundle: GraphBundle) {
  let session = sessionCache.get(bundle.bundleChecksum)

  if (!session) {
    session = createGraphBundleSession(bundle).catch((error) => {
      sessionCache.delete(bundle.bundleChecksum)
      throw error
    })
    sessionCache.set(bundle.bundleChecksum, session)
  }

  return session
}
