import { NOISE_COLOR, NOISE_COLOR_LIGHT, DEFAULT_POINT_COLOR } from '@/features/graph/lib/brand-colors'
import { getPaletteColors } from '@/features/graph/lib/colors'
import type {
  AuthorGeoRow,
  GraphBundle,
  GraphClusterDetail,
  GraphData,
  GraphNode,
  GraphSearchResult,
  GraphSelectionDetail,
  GraphVisibilityBudget,
  MapLayer,
  PaperDocument,
} from '@/features/graph/types'

import {
  queryChunkTablePage,
  queryGeoTablePage,
  queryInfoBars,
  queryInfoHistogram,
  queryInfoSummary,
  queryFacetSummary,
  queryPaperTablePage,
  queryPointIndicesForScope,
  queryPointSearch,
  queryVisibilityBudget,
} from './analytics-queries'
import {
  buildCanvasSource,
  queryCanvasPointCounts,
  registerActiveCanvasAliasViews,
} from './canvas'
import { createConnection, closeConnection } from './connection'
import {
  queryClusterRows,
  queryExemplarRows,
  queryPaperDetail,
  queryPaperDocument,
  hydrateGeoData,
  mapCluster,
  mapExemplar,
  mapPaper,
  mapChunkDetail,
  type GraphChunkDetailRow,
} from './detail-queries'
import {
  queryGraphPointSelection,
  queryPaperPointSelection,
  queryGeoPointSelection,
  queryPaperNodesByPaperIds,
  queryUniversePointIdsByPaperIds,
  queryChunkNodesByChunkIds,
} from './node-queries'
import { activateOverlayByClusterNeighborhood } from './overlay'
import { queryRows, executeReadOnlyQuery } from './queries'
import type { GraphBundleSession, GraphCanvasListener, ProgressCallback } from './types'
import {
  createBoundedCache,
  validateTableName,
  requireBundleTable,
  getAutoloadBundleTables,
} from './utils'
import {
  resolveBundleRelations,
  registerUniverseLinksViews,
  registerUniversePointView,
  initializeOverlayMembershipTable,
  registerActivePointViews,
  replaceOverlayPointIds,
  clearOverlayPointIds,
  registerPaperDocumentViews,
  registerGraphChunkDetailsView,
  registerClusterExemplarView,
} from './views'

const DEFAULT_CLUSTER_COLORS = getPaletteColors('default', 'dark')
const DEFAULT_CLUSTER_COLORS_LIGHT = getPaletteColors('default', 'light')

export async function createGraphBundleSession(
  bundle: GraphBundle,
  onProgress: ProgressCallback
): Promise<GraphBundleSession> {
  const { conn, db, worker } = await createConnection()
  const autoloadTables = getAutoloadBundleTables(bundle)

  try {
    onProgress(bundle.bundleChecksum, {
      stage: 'resolving',
      message: 'Opening DuckDB-Wasm and resolving the active graph bundle.',
      percent: 2,
    })
    let bundleAttached = await resolveBundleRelations(conn, bundle, autoloadTables)
    onProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Registering canonical bundle tables and active views.',
      percent: 10,
    })
    const attachedTableSet = new Set(autoloadTables)
    requireBundleTable(bundle, 'base_points')
    requireBundleTable(bundle, 'base_clusters')
    const pointTable = validateTableName('base_points')
    const pointManifest = requireBundleTable(bundle, 'base_points')
    const pointColumns = new Set((pointManifest?.columns ?? []).map((column) => column.toLowerCase()))
    const clusterTable = validateTableName('base_clusters')
    const colorCase = DEFAULT_CLUSTER_COLORS.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    const colorCaseLight = DEFAULT_CLUSTER_COLORS_LIGHT.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    const pointExpr = (column: string, fallback: string) =>
      pointColumns.has(column.toLowerCase()) ? column : fallback
    const defaultHexColorExpr = `CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS.length})
             ${colorCase}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END`
    const defaultHexColorLightExpr = `CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR_LIGHT}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS_LIGHT.length})
             ${colorCaseLight}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END`
    const buildPointViewSelect = (sourceTable: string, indexSql: string) => `
       SELECT
         ${indexSql} AS index,
         point_index AS sourcePointIndex,
         id,
         id AS node_id,
         node_kind AS nodeKind,
         COALESCE(${pointExpr("node_role", "'primary'")}, 'primary') AS nodeRole,
         ${pointExpr('hex_color', defaultHexColorExpr)} AS hexColor,
         ${pointExpr('hex_color_light', defaultHexColorLightExpr)} AS hexColorLight,
         ${pointExpr('hex_color', defaultHexColorExpr)} AS hex_color,
         ${pointExpr('hex_color_light', defaultHexColorLightExpr)} AS hex_color_light,
         x,
         y,
         COALESCE(cluster_id, 0) AS clusterId,
         cluster_label AS clusterLabel,
         COALESCE(cluster_probability, 0) AS clusterProbability,
         paper_id AS paperId,
         title AS paperTitle,
         citekey,
         journal,
         year,
         doi,
         CAST(pmid AS VARCHAR) AS pmid,
         pmcid,
         NULL::VARCHAR AS stableChunkId,
         NULL::INTEGER AS chunkIndex,
         NULL::VARCHAR AS sectionCanonical,
         NULL::VARCHAR AS sectionType,
         NULL::INTEGER AS pageNumber,
         NULL::INTEGER AS tokenCount,
         NULL::INTEGER AS charCount,
         NULL::VARCHAR AS chunkKind,
         NULL::VARCHAR AS chunkPreview,
         display_label AS displayLabel,
         search_text AS searchText,
         NULL::VARCHAR AS canonicalName,
         NULL::VARCHAR AS category,
         NULL::VARCHAR AS definition,
         NULL::VARCHAR AS semanticTypes,
         semantic_groups_csv AS semanticGroups,
         organ_systems_csv AS organSystems,
         ${pointExpr('top_entities_csv', 'NULL::VARCHAR')} AS topEntities,
         ${pointExpr('relation_categories_csv', 'NULL::VARCHAR')} AS relationCategories,
         NULL::VARCHAR AS aliasesCsv,
         NULL::DOUBLE AS mentionCount,
         NULL::DOUBLE AS paperCount,
         NULL::DOUBLE AS chunkCount,
         CAST(${pointExpr('relation_count', 'paper_relation_count')} AS DOUBLE) AS relationCount,
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
         is_in_base AS isInBase,
         CAST(${pointExpr("base_rank", "0")} AS DOUBLE) AS baseRank,
         CASE
           WHEN COALESCE(${pointExpr("node_role", "'primary'")}, 'primary') = 'overlay' THEN true
           ELSE false
         END AS isOverlayActive,
         NULL::VARCHAR AS payloadJson,
         title AS displayPreview,
         false AS payloadWasTruncated,
         ${pointExpr("text_availability", "json_extract_string(payload_json, '$.text_availability')")} AS textAvailability,
         COALESCE(${pointExpr("is_open_access", "TRY_CAST(json_extract(payload_json, '$.is_open_access') AS BOOLEAN)")}, false) AS isOpenAccess,
         COALESCE(${pointExpr("has_open_access_pdf", "(json_extract_string(payload_json, '$.open_access_pdf_url') IS NOT NULL AND json_extract_string(payload_json, '$.open_access_pdf_url') <> '')")}, false) AS hasOpenAccessPdf,
         paper_author_count AS paperAuthorCount,
         paper_reference_count AS paperReferenceCount,
         paper_asset_count AS paperAssetCount,
         0::INTEGER AS paperChunkCount,
         CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
         CAST(paper_relation_count AS DOUBLE) AS paperRelationCount,
         NULL::INTEGER AS paperSentenceCount,
         NULL::INTEGER AS paperPageCount,
         NULL::INTEGER AS paperTableCount,
         NULL::INTEGER AS paperFigureCount,
         COALESCE(paper_cluster_index, 0) AS paperClusterIndex,
         false AS hasTableContext,
         false AS hasFigureContext
       FROM ${sourceTable}`;
    await conn.query(
      `CREATE OR REPLACE VIEW base_points_web AS
       ${buildPointViewSelect(
         pointTable,
         'ROW_NUMBER() OVER (ORDER BY point_index)::INTEGER - 1'
       )}`
    )

    await registerUniversePointView(conn, {
      sourceTable: attachedTableSet.has('universe_points')
        ? validateTableName('universe_points')
        : null,
      selectSql: buildPointViewSelect,
    })

    await initializeOverlayMembershipTable(conn)
    await registerActivePointViews(conn)

    await registerUniverseLinksViews(conn, {
      universeLinksTable: attachedTableSet.has('universe_links')
        ? validateTableName('universe_links')
        : null,
    })

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

    const availableLayers: MapLayer[] = ['chunk']

    await registerPaperDocumentViews(
      conn,
      attachedTableSet.has('paper_documents')
        ? validateTableName('paper_documents')
        : null
    )
    await registerGraphChunkDetailsView(conn)
    await registerClusterExemplarView(
      conn,
      attachedTableSet.has('cluster_exemplars')
        ? validateTableName('cluster_exemplars')
        : null
    )

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

    let overlayRevision = 0
    await registerActiveCanvasAliasViews(conn, overlayRevision)

    const geoPointCount = bundle.bundleManifest.tables.geo_points?.rowCount ?? 0
    const initialPointCounts = await queryCanvasPointCounts(conn, geoPointCount)

    onProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Canvas tables are ready. Graph rendering can begin immediately.',
      percent: 12,
      loadedRows: 0,
      totalRows: initialPointCounts.chunk,
    })

    let dataPromise: Promise<GraphData> | null = null

    const hasAuthorGeo = Boolean(bundle.bundleManifest.tables.graph_author_geo)
    const selectionCache = createBoundedCache<string, Promise<GraphSelectionDetail>>()
    const clusterCache = createBoundedCache<number, Promise<GraphClusterDetail>>()
    const paperDocumentCache = createBoundedCache<string, Promise<PaperDocument | null>>()
    const authorCache = createBoundedCache<string, Promise<AuthorGeoRow[]>>()
    const searchCache = createBoundedCache<string, Promise<GraphSearchResult[]>>()
    const visibilityBudgetCache = createBoundedCache<string, Promise<GraphVisibilityBudget | null>>()
    const scopeIndicesCache = createBoundedCache<string, Promise<number[]>>()
    let ensureOptionalTablesPromise: Promise<void> | null = null
    let canvas = buildCanvasSource({
      conn,
      db,
      pointCounts: initialPointCounts,
      overlayCount: 0,
      overlayRevision,
    })
    const canvasListeners = new Set<GraphCanvasListener>()

    const emitCanvas = () => {
      for (const listener of canvasListeners) {
        listener(canvas)
      }
    }

    const subscribeCanvas = (listener: GraphCanvasListener) => {
      canvasListeners.add(listener)
      listener(canvas)
      return () => {
        canvasListeners.delete(listener)
      }
    }

    const resetOverlayDependentCaches = () => {
      searchCache.clear()
      visibilityBudgetCache.clear()
      scopeIndicesCache.clear()
    }

    const refreshCanvas = async (incrementRevision = true) => {
      const pointCounts = await queryCanvasPointCounts(conn, geoPointCount)
      const overlayRows = await queryRows<{ count: number }>(
        conn,
        `SELECT count(*)::INTEGER AS count FROM overlay_points_web`
      )
      if (incrementRevision) {
        overlayRevision += 1
      }
      await registerActiveCanvasAliasViews(conn, overlayRevision)
      canvas = buildCanvasSource({
        conn,
        db,
        pointCounts,
        overlayCount: overlayRows[0]?.count ?? 0,
        overlayRevision,
      })
      emitCanvas()
      return { overlayCount: canvas.overlayCount }
    }

    const ensureOptionalBundleTables = async (tableNames: string[]) => {
      while (true) {
        const requested = [...new Set(tableNames)].filter(
          (tableName) =>
            Boolean(bundle.bundleManifest.tables[tableName]) &&
            !attachedTableSet.has(tableName)
        )
        if (requested.length === 0) {
          return
        }

        if (ensureOptionalTablesPromise) {
          await ensureOptionalTablesPromise
          continue
        }

        ensureOptionalTablesPromise = (async () => {
          bundleAttached = await resolveBundleRelations(
            conn,
            bundle,
            requested,
            bundleAttached
          )

          for (const tableName of requested) {
            attachedTableSet.add(tableName)
          }

          if (requested.includes('universe_points')) {
            await registerUniversePointView(conn, {
              sourceTable: validateTableName('universe_points'),
              selectSql: buildPointViewSelect,
            })
          }

          if (requested.includes('universe_links')) {
            await registerUniverseLinksViews(conn, {
              universeLinksTable: validateTableName('universe_links'),
            })
          }

          if (requested.includes('paper_documents')) {
            await registerPaperDocumentViews(conn, validateTableName('paper_documents'))
            await registerGraphChunkDetailsView(conn)
          }

          if (requested.includes('cluster_exemplars')) {
            await registerClusterExemplarView(
              conn,
              validateTableName('cluster_exemplars')
            )
          }
        })().finally(() => {
          ensureOptionalTablesPromise = null
        })

        await ensureOptionalTablesPromise
        return
      }
    }

    return {
      availableLayers,
      canvas,
      subscribeCanvas,
      getData() {
        if (!dataPromise) {
          dataPromise = hydrateGeoData(conn, bundle, availableLayers, onProgress)
        }
        return dataPromise
      },
      async setOverlayPointIds(pointIds: string[]) {
        await ensureOptionalBundleTables(['universe_points', 'universe_links'])
        resetOverlayDependentCaches()
        const result = await replaceOverlayPointIds(conn, pointIds)
        await refreshCanvas()
        return result
      },
      async clearOverlay() {
        resetOverlayDependentCaches()
        await clearOverlayPointIds(conn)
        return refreshCanvas()
      },
      async activateOverlay(args) {
        await ensureOptionalBundleTables(['universe_points', 'universe_links'])
        resetOverlayDependentCaches()
        const result =
          args.kind === 'cluster-neighborhood'
            ? await activateOverlayByClusterNeighborhood(conn, args)
            : (() => {
                throw new Error(`Unsupported overlay activation kind: ${args.kind}`)
              })()
        await refreshCanvas()
        return result
      },
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

        const next = (async () => {
          await ensureOptionalBundleTables(['paper_documents'])
          return queryPaperDocument(conn, paperId)
        })()

        paperDocumentCache.set(paperId, next)
        return next
      },
      getPaperNodesByPaperIds(paperIds: string[]) {
        return queryPaperNodesByPaperIds(conn, paperIds)
      },
      async getUniversePointIdsByPaperIds(paperIds: string[]) {
        await ensureOptionalBundleTables(['universe_points'])
        return queryUniversePointIdsByPaperIds(conn, paperIds)
      },
      getChunkNodesByChunkIds(chunkIds: string[]) {
        return queryChunkNodesByChunkIds(conn, chunkIds)
      },
      resolvePointSelection(layer, selector) {
        if (layer === 'paper') {
          return queryPaperPointSelection(conn, selector)
        }
        if (layer === 'chunk') {
          return queryGraphPointSelection(conn, selector)
        }
        if (layer === 'geo') {
          return queryGeoPointSelection(conn, selector)
        }
        return Promise.resolve(null)
      },
      getTablePage(args) {
        if (args.layer === 'paper') {
          return queryPaperTablePage(conn, args)
        }
        if (args.layer === 'geo') {
          return queryGeoTablePage(conn, args)
        }
        return queryChunkTablePage(conn, args)
      },
      getInfoSummary(args) {
        return queryInfoSummary(conn, args)
      },
      getInfoBars(args) {
        return queryInfoBars(conn, {
          ...args,
          maxItems: args.maxItems ?? 8,
        })
      },
      getInfoHistogram(args) {
        return queryInfoHistogram(conn, {
          ...args,
          bins: args.bins ?? 16,
        })
      },
      getFacetSummary(args) {
        return queryFacetSummary(conn, {
          ...args,
          maxItems: args.maxItems ?? 6,
        })
      },
      searchPoints(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          column: args.column,
          query: args.query.trim().toLowerCase(),
          limit: args.limit ?? 12,
        })
        const cached = searchCache.get(cacheKey)
        if (cached) return cached

        const next = queryPointSearch(conn, args)
        searchCache.set(cacheKey, next)
        return next
      },
      getVisibilityBudget(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          id: args.selector.id ?? null,
          index: args.selector.index ?? null,
          scopeSql: args.scopeSql?.trim() || null,
        })
        const cached = visibilityBudgetCache.get(cacheKey)
        if (cached) return cached

        const next = queryVisibilityBudget(conn, args)
        visibilityBudgetCache.set(cacheKey, next)
        return next
      },
      getPointIndicesForScope(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          scopeSql: args.scopeSql.trim(),
        })
        const cached = scopeIndicesCache.get(cacheKey)
        if (cached) return cached

        const next = queryPointIndicesForScope(conn, args)
        scopeIndicesCache.set(cacheKey, next)
        return next
      },
      getClusterDetail(clusterId: number) {
        const cached = clusterCache.get(clusterId)
        if (cached) return cached

        const next = (async (): Promise<GraphClusterDetail> => {
          await ensureOptionalBundleTables(['cluster_exemplars'])
          const [clusterRows_, exemplarRows] = await Promise.all([
            queryClusterRows(conn, clusterId),
            queryExemplarRows(conn, clusterId),
          ])

          return {
            cluster: clusterRows_[0] ? mapCluster(clusterRows_[0]) : null,
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
          await ensureOptionalBundleTables(['cluster_exemplars', 'paper_documents'])
          const [clusterRows_, exemplarRows] = await Promise.all([
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
              cluster: clusterRows_[0] ? mapCluster(clusterRows_[0]) : null,
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
              cluster: clusterRows_[0] ? mapCluster(clusterRows_[0]) : null,
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
            cluster: clusterRows_[0] ? mapCluster(clusterRows_[0]) : null,
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
