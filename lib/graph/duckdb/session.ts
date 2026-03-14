import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { NOISE_COLOR, NOISE_COLOR_LIGHT, DEFAULT_POINT_COLOR } from '../brand-colors'
import { getPaletteColors } from '../colors'
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
} from '../transform'
import { EMPTY_LINKS_TABLE, LINK_COLUMNS } from '../layers'
import type {
  GraphBundle,
  GraphClusterDetail,
  GraphData,
  GraphNode,
  GraphQueryResult,
  GraphSelectionDetail,
  MapLayer,
  PaperDocument,
} from '../types'

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
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
  getSelectionDetail: (node: GraphNode) => Promise<GraphSelectionDetail>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}

interface BundleRelationResolver {
  relation: (tableName: string) => string
}

const DEFAULT_CLUSTER_COLORS = getPaletteColors('default', 'dark')
const DEFAULT_CLUSTER_COLORS_LIGHT = getPaletteColors('default', 'light')
const sessionCache = new Map<string, Promise<GraphBundleSession>>()

async function resolveBundleRelations(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle
): Promise<BundleRelationResolver> {
  const absoluteDuckdbUrl = getAbsoluteUrl(bundle.duckdbUrl)

  try {
    await conn.query(`ATTACH '${escapeSqlString(absoluteDuckdbUrl)}' AS graph_bundle`)
    await conn.query('SELECT 1 FROM graph_bundle.graph_points LIMIT 1')

    for (const tableName of Object.keys(bundle.bundleManifest.tables)) {
      await conn.query(
        `CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM graph_bundle.${tableName}`
      )
    }

    return {
      relation: (tableName) => tableName,
    }
  } catch {
    for (const [tableName, tableUrl] of Object.entries(bundle.tableUrls)) {
      const absoluteTableUrl = getAbsoluteUrl(tableUrl)
      await conn.query(
        `CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM read_parquet('${escapeSqlString(
          absoluteTableUrl
        )}')`
      )
    }

    return {
      relation: (tableName) => tableName,
    }
  }
}

async function createGraphBundleSession(bundle: GraphBundle): Promise<GraphBundleSession> {
  const { conn, db, worker } = await createConnection()

  try {
    const relations = await resolveBundleRelations(conn, bundle)
    const colorCase = DEFAULT_CLUSTER_COLORS.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    const colorCaseLight = DEFAULT_CLUSTER_COLORS_LIGHT.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    // TODO: simplify aliasing — view already renames columns
    await conn.query(
      `CREATE OR REPLACE VIEW graph_points_web AS
      SELECT
        point_index AS index,
        node_id AS id,
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
        page_number AS pageNumber,
        token_count AS tokenCount,
        char_count AS charCount,
        chunk_kind AS chunkKind,
        chunk_preview AS chunkPreview,
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
      FROM ${relations.relation('graph_points')}`
    )

    // Detect available layers from the manifest
    const availableLayers: MapLayer[] = ['chunk']
    const hasPaperDocuments = Boolean(bundle.bundleManifest.tables.paper_documents)

    if (bundle.bundleManifest.tables.paper_points) {
      const paperColorCase = DEFAULT_CLUSTER_COLORS.map(
        (color, index) => `WHEN ${index} THEN '${color}'`
      ).join('\n        ')
      const paperColorCaseLight = DEFAULT_CLUSTER_COLORS_LIGHT.map(
        (color, index) => `WHEN ${index} THEN '${color}'`
      ).join('\n        ')
      await conn.query(
        `CREATE OR REPLACE VIEW paper_points_web AS
        SELECT
          point_index AS index,
          node_id AS id,
          CASE
            WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR}'
            ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS.length})
          ${paperColorCase}
              ELSE '${DEFAULT_POINT_COLOR}'
            END
          END AS hexColor,
          CASE
            WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR_LIGHT}'
            ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS_LIGHT.length})
          ${paperColorCaseLight}
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
          display_preview AS chunkPreview,
          display_preview AS displayPreview,
          COALESCE(payload_was_truncated, false) AS payloadWasTruncated,
          -- Chunk-only columns as NULL placeholders so crossfilter queries
          -- registered on the chunk layer don't break during layer transitions.
          NULL::VARCHAR AS stableChunkId,
          NULL::INTEGER AS chunkIndex,
          NULL::VARCHAR AS sectionCanonical,
          NULL::INTEGER AS pageNumber,
          NULL::INTEGER AS tokenCount,
          NULL::INTEGER AS charCount,
          NULL::VARCHAR AS chunkKind,
          false AS hasTableContext,
          false AS hasFigureContext,
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
        FROM ${relations.relation('paper_points')}`
      )
      availableLayers.push('paper')
    }

    // Geo layer — real-world lat/lng, no UMAP/HDBSCAN
    if (bundle.bundleManifest.tables.geo_points) {
      await conn.query(
        `CREATE OR REPLACE VIEW geo_points_web AS
        SELECT
          point_index AS index,
          node_id AS id,
          COALESCE(color_hex, '${DEFAULT_POINT_COLOR}') AS hexColor,
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
        FROM ${relations.relation('geo_points')}`
      )
      availableLayers.push('geo')
    }

    // Empty links view — Cosmograph crashes (pragma_table_info on internal
    // cosmograph_links) when the `links` prop transitions from a table name
    // to undefined. This zero-row view lets us always pass a valid table.
    await conn.query(
      `CREATE OR REPLACE VIEW ${EMPTY_LINKS_TABLE} AS
      SELECT
        NULL::VARCHAR AS ${LINK_COLUMNS.sourceBy},
        NULL::INTEGER AS ${LINK_COLUMNS.sourceIndexBy},
        NULL::VARCHAR AS ${LINK_COLUMNS.targetBy},
        NULL::INTEGER AS ${LINK_COLUMNS.targetIndexBy}
      WHERE false`
    )

    // Create paper_documents view if available in bundle
    if (hasPaperDocuments) {
      await conn.query(
        `CREATE OR REPLACE VIEW paper_documents_web AS
        SELECT * FROM ${relations.relation('paper_documents')}`
      )
    }

    const points = await queryRows<GraphPointRow>(
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
        stableChunkId AS stable_chunk_id,
        chunkIndex AS chunk_index,
        sectionCanonical AS section_canonical,
        pageNumber AS page_number,
        tokenCount AS token_count,
        charCount AS char_count,
        chunkKind AS chunk_kind,
        chunkPreview AS chunk_preview,
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
      FROM ${relations.relation('graph_clusters')}
      ORDER BY cluster_id`
    )

    const facets = bundle.bundleManifest.tables.graph_facets
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
          FROM ${relations.relation('graph_facets')}
          ORDER BY facet_name, sort_key, facet_value`
        )
      : []

    const data = buildGraphData({
      points,
      clusters,
      facets,
    })

    // Load paper nodes if paper layer is available
    if (availableLayers.includes('paper')) {
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
    }

    const selectionCache = new Map<string, Promise<GraphSelectionDetail>>()
    const clusterCache = new Map<number, Promise<GraphClusterDetail>>()
    const paperDocumentCache = new Map<string, Promise<PaperDocument | null>>()

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
      getPaperDocument(paperId: string) {
        const cached = paperDocumentCache.get(paperId)
        if (cached) return cached

        const next = (async (): Promise<PaperDocument | null> => {
          if (!hasPaperDocuments) return null

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
        })()

        paperDocumentCache.set(paperId, next)
        return next
      },
      getClusterDetail(clusterId: number) {
        const cached = clusterCache.get(clusterId)
        if (cached) return cached

        const next = (async (): Promise<GraphClusterDetail> => {
          const clusterRows = await queryRows<GraphClusterDetailRow>(
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
            FROM ${relations.relation('graph_clusters')}
            WHERE cluster_id = ?
            LIMIT 1`,
            [clusterId]
          )

          const exemplarRows = await queryRows<GraphClusterExemplarRow>(
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
            FROM ${relations.relation('graph_cluster_exemplars')}
            WHERE cluster_id = ?
            ORDER BY rank
            LIMIT 5`,
            [clusterId]
          )

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
          if (node.nodeKind === 'paper') {
            // Paper node: query paper details + cluster + exemplars (no chunk_details)
            const paperRows = await queryRows<GraphPaperDetailRow>(
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
              FROM ${relations.relation('graph_papers')}
              WHERE paper_id = ?
              LIMIT 1`,
              [node.paperId]
            )

            const clusterRows = await queryRows<GraphClusterDetailRow>(
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
              FROM ${relations.relation('graph_clusters')}
              WHERE cluster_id = ?
              LIMIT 1`,
              [node.clusterId]
            )

            const exemplarRows = await queryRows<GraphClusterExemplarRow>(
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
              FROM ${relations.relation('graph_cluster_exemplars')}
              WHERE cluster_id = ?
              ORDER BY rank
              LIMIT 5`,
              [node.clusterId]
            )

            // Load paper document on demand
            let paperDocument: PaperDocument | null = null
            if (hasPaperDocuments) {
              const docRows = await queryRows<PaperDocumentRow>(
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
                [node.paperId]
              )
              paperDocument = docRows[0] ? mapPaperDocument(docRows[0]) : null
            }

            return {
              chunk: null,
              cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
              exemplars: exemplarRows.map(mapExemplar),
              paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
              paperDocument,
            }
          }

          // Chunk node: existing path
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
            FROM ${relations.relation('graph_chunk_details')}
            WHERE rag_chunk_id = ?
            LIMIT 1`,
            [node.id]
          )

          const paperRows = await queryRows<GraphPaperDetailRow>(
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
            FROM ${relations.relation('graph_papers')}
            WHERE paper_id = ?
            LIMIT 1`,
            [node.paperId]
          )

          const clusterRows = await queryRows<GraphClusterDetailRow>(
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
            FROM ${relations.relation('graph_clusters')}
            WHERE cluster_id = ?
            LIMIT 1`,
            [node.clusterId]
          )

          const exemplarRows = await queryRows<GraphClusterExemplarRow>(
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
            FROM ${relations.relation('graph_cluster_exemplars')}
            WHERE cluster_id = ?
            ORDER BY rank
            LIMIT 5`,
            [node.clusterId]
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
