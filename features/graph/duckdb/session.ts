import type {
  AuthorGeoRow,
  GraphBundle,
  GraphClusterDetail,
  GraphData,
  GraphNode,
  GraphSearchResult,
  GraphSelectionDetail,
  GraphVisibilityBudget,
  PaperDocument,
} from '@/features/graph/types'

import {
  buildCanvasSource,
  queryCanvasPointCounts,
  registerActiveCanvasAliasViews,
} from './canvas'
import { createConnection, closeConnection } from './connection'
import { mapCluster, mapExemplar, mapPaper, mapChunkDetail, type GraphChunkDetailRow } from './mappers'
import { activateOverlayByClusterNeighborhood } from './overlay'
import {
  executeReadOnlyQuery,
  hydrateGeoData,
  queryChunkNodesByChunkIds,
  queryChunkTablePage,
  queryClusterRows,
  queryExemplarRows,
  queryFacetSummary,
  queryGeoPointSelection,
  queryGeoTablePage,
  queryGraphPointSelection,
  queryInfoBars,
  queryInfoHistogram,
  queryInfoSummary,
  queryPaperDetail,
  queryPaperDocument,
  queryPaperNodesByPaperIds,
  queryPaperPointSelection,
  queryPaperTablePage,
  queryPointIndicesForScope,
  queryPointSearch,
  queryRows,
  queryUniversePointIdsByPaperIds,
  queryVisibilityBudget,
} from './queries'
import type { GraphBundleSession, GraphCanvasListener, ProgressCallback } from './types'
import { createBoundedCache, getAutoloadBundleTables } from './utils'
import {
  registerInitialSessionViews,
  createEnsureOptionalBundleTables,
  replaceOverlayPointIds,
  clearOverlayPointIds,
} from './views'

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

    onProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Registering canonical bundle tables and active views.',
      percent: 10,
    })

    const viewState = await registerInitialSessionViews(conn, bundle, autoloadTables)
    const { availableLayers } = viewState
    const ensureOptionalBundleTables = createEnsureOptionalBundleTables(conn, bundle, viewState)

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

    let canvas = buildCanvasSource({
      conn, db, pointCounts: initialPointCounts, overlayCount: 0, overlayRevision,
    })
    const canvasListeners = new Set<GraphCanvasListener>()

    const emitCanvas = () => {
      for (const listener of canvasListeners) listener(canvas)
    }

    const subscribeCanvas = (listener: GraphCanvasListener) => {
      canvasListeners.add(listener)
      listener(canvas)
      return () => { canvasListeners.delete(listener) }
    }

    const resetOverlayDependentCaches = () => {
      searchCache.clear()
      visibilityBudgetCache.clear()
      scopeIndicesCache.clear()
    }

    const refreshCanvas = async (incrementRevision = true) => {
      const pointCounts = await queryCanvasPointCounts(conn, geoPointCount)
      const overlayRows = await queryRows<{ count: number }>(
        conn, `SELECT count(*)::INTEGER AS count FROM overlay_points_web`
      )
      if (incrementRevision) overlayRevision += 1
      await registerActiveCanvasAliasViews(conn, overlayRevision)
      canvas = buildCanvasSource({
        conn, db, pointCounts,
        overlayCount: overlayRows[0]?.count ?? 0, overlayRevision,
      })
      emitCanvas()
      return { overlayCount: canvas.overlayCount }
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
            authorId: string; name: string | null; surname: string | null
            givenName: string | null; orcid: string | null; citekey: string | null
            paperTitle: string | null; year: number | null; institution: string | null
            department: string | null; institutionKey: string | null
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
            authorId: string; name: string | null; surname: string | null
            givenName: string | null; orcid: string | null; citekey: string | null
            paperTitle: string | null; year: number | null; institution: string | null
            department: string | null; institutionKey: string | null
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
        if (layer === 'paper') return queryPaperPointSelection(conn, selector)
        if (layer === 'chunk') return queryGraphPointSelection(conn, selector)
        if (layer === 'geo') return queryGeoPointSelection(conn, selector)
        return Promise.resolve(null)
      },
      getTablePage(args) {
        if (args.layer === 'paper') return queryPaperTablePage(conn, args)
        if (args.layer === 'geo') return queryGeoTablePage(conn, args)
        return queryChunkTablePage(conn, args)
      },
      getInfoSummary(args) {
        return queryInfoSummary(conn, args)
      },
      getInfoBars(args) {
        return queryInfoBars(conn, { ...args, maxItems: args.maxItems ?? 8 })
      },
      getInfoHistogram(args) {
        return queryInfoHistogram(conn, { ...args, bins: args.bins ?? 16 })
      },
      getFacetSummary(args) {
        return queryFacetSummary(conn, { ...args, maxItems: args.maxItems ?? 6 })
      },
      searchPoints(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer, column: args.column,
          query: args.query.trim().toLowerCase(), limit: args.limit ?? 12,
        })
        const cached = searchCache.get(cacheKey)
        if (cached) return cached
        const next = queryPointSearch(conn, args)
        searchCache.set(cacheKey, next)
        return next
      },
      getVisibilityBudget(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer, id: args.selector.id ?? null,
          index: args.selector.index ?? null, scopeSql: args.scopeSql?.trim() || null,
        })
        const cached = visibilityBudgetCache.get(cacheKey)
        if (cached) return cached
        const next = queryVisibilityBudget(conn, args)
        visibilityBudgetCache.set(cacheKey, next)
        return next
      },
      getPointIndicesForScope(args) {
        const cacheKey = JSON.stringify({ layer: args.layer, scopeSql: args.scopeSql.trim() })
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
        if (cached) return cached

        const next = (async (): Promise<GraphSelectionDetail> => {
          await ensureOptionalBundleTables(['cluster_exemplars', 'paper_documents'])
          const [clusterRows_, exemplarRows] = await Promise.all([
            queryClusterRows(conn, node.clusterId),
            queryExemplarRows(conn, node.clusterId),
          ])

          if (node.nodeKind === 'paper') {
            const paperRows = await queryPaperDetail(conn, node.paperId ?? node.id)
            const paperDocument = await queryPaperDocument(conn, node.paperId ?? node.id)
            return {
              chunk: null,
              cluster: clusterRows_[0] ? mapCluster(clusterRows_[0]) : null,
              exemplars: exemplarRows.map(mapExemplar),
              paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
              paperDocument,
            }
          }

          const paperRows = node.paperId ? await queryPaperDetail(conn, node.paperId) : []

          if (node.nodeKind !== 'chunk') {
            const paperDocument = node.paperId
              ? await queryPaperDocument(conn, node.paperId) : null
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
              rag_chunk_id, paper_id, citekey, title, journal, year, doi,
              pmid, pmcid, stable_chunk_id, chunk_index, section_type,
              section_canonical, section_path, page_number, token_count,
              char_count, chunk_kind, block_type, block_id, chunk_text,
              chunk_preview, abstract, cluster_id, cluster_label,
              cluster_probability, outlier_score, source_embedding_id
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
