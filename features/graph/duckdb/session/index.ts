import type {
  GraphBundle,
  GraphClusterDetail,
  GraphPointRecord,
  GraphSearchResult,
  GraphSelectionDetail,
  GraphVisibilityBudget,
  PaperDocument,
} from '@/features/graph/types'

import { maybeAttachGraphPaperRefs } from '../attachment'
import { getCanvasPointCounts, registerActiveCanvasAliasViews } from '../canvas'
import { createConnection, closeConnection } from '../connection'
import { mapCluster, mapExemplar, mapPaper } from '../mappers'
import {
  executeReadOnlyQuery,
  exportCorpusTableCsv,
  queryClusterRows,
  queryCorpusPointSelection,
  queryCorpusTablePage,
  queryExemplarRows,
  queryPaperDetail,
  queryPaperDocument,
  queryPaperNodesByGraphPaperRefs,
  queryPointSearch,
  queryScopeCoordinates,
  querySelectionScopeGraphPaperRefs,
  queryUniversePointIdsByGraphPaperRefs,
  queryVisibilityBudget,
} from '../queries'
import type { GraphBundleSession, ProgressCallback } from '../types'
import { createBoundedCache, getAutoloadBundleTables } from '../utils'
import {
  createEnsureOptionalBundleTables,
  initializeSelectedPointTable,
  registerInitialSessionViews,
} from '../views'
import { createSessionInfoQueries } from './info-queries'
import { createSessionOverlayController } from './overlay-controller'

function normalizeGraphPaperRefs(graphPaperRefs: string[]): string[] {
  return [...new Set(graphPaperRefs.filter((graphPaperRef) => graphPaperRef.trim().length > 0))]
}

export async function createGraphBundleSession(
  bundle: GraphBundle,
  onProgress: ProgressCallback
): Promise<GraphBundleSession> {
  const { conn, db, worker } = await createConnection()
  const autoloadTables = getAutoloadBundleTables(bundle)
  let disposed = false

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
    const { availableLayers, basePointCount } = viewState
    const ensureOptionalBundleTables = createEnsureOptionalBundleTables(conn, bundle, viewState)

    await initializeSelectedPointTable(conn)
    await registerActiveCanvasAliasViews(conn, {
      overlayRevision: 0,
      overlayCount: 0,
    })

    const initialPointCounts = getCanvasPointCounts(basePointCount, 0)

    onProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Canvas tables are ready. Graph rendering can begin immediately.',
      percent: 12,
      loadedRows: 0,
      totalRows: initialPointCounts.corpus,
    })

    const pointSelectionCache = createBoundedCache<string, Promise<GraphPointRecord | null>>()
    const selectionCache = createBoundedCache<string, Promise<GraphSelectionDetail>>()
    const clusterCache = createBoundedCache<number, Promise<GraphClusterDetail>>()
    const paperDocumentCache = createBoundedCache<string, Promise<PaperDocument | null>>()
    const searchCache = createBoundedCache<string, Promise<GraphSearchResult[]>>()
    const visibilityBudgetCache = createBoundedCache<string, Promise<GraphVisibilityBudget | null>>()
    const scopeCoordinatesCache = createBoundedCache<string, Promise<number[] | null>>()

    let infoQueries:
      | ReturnType<typeof createSessionInfoQueries>
      | null = null

    const resetOverlayDependentCaches = () => {
      pointSelectionCache.clear()
      searchCache.clear()
      visibilityBudgetCache.clear()
      scopeCoordinatesCache.clear()
      infoQueries?.reset()
    }

    const overlayController = createSessionOverlayController({
      conn,
      db,
      basePointCount,
      ensureOptionalBundleTables,
      initialPointCounts,
      resetOverlayDependentCaches,
    })

    const getCachedScopeCoordinates = (args: {
      layer: Parameters<typeof queryScopeCoordinates>[1]['layer']
      scope: Parameters<typeof queryScopeCoordinates>[1]['scope']
      currentPointScopeSql: string | null
    }) => {
      const cacheKey = JSON.stringify({
        layer: args.layer,
        scope: args.scope,
        currentPointScopeSql: args.currentPointScopeSql,
      })
      const cached = scopeCoordinatesCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const next = queryScopeCoordinates(conn, args)
      scopeCoordinatesCache.set(cacheKey, next)
      return next
    }

    const getCachedDatasetScopeCoordinates = (
      layer: Parameters<typeof queryScopeCoordinates>[1]['layer']
    ) =>
      getCachedScopeCoordinates({
        layer,
        scope: 'current',
        currentPointScopeSql: null,
      })

    const getCachedCurrentScopeCoordinates = (
      layer: Parameters<typeof queryScopeCoordinates>[1]['layer'],
      currentPointScopeSql: string
    ) =>
      getCachedScopeCoordinates({
        layer,
        scope: 'current',
        currentPointScopeSql,
      })

    const getCachedClusterDetail = (clusterId: number) => {
      const cached = clusterCache.get(clusterId)
      if (cached) {
        return cached
      }

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
    }

    infoQueries = createSessionInfoQueries({
      conn,
      getDatasetTotalCount: (layer) => overlayController.getCanvas().pointCounts[layer] ?? 0,
      getOverlayRevision: () => overlayController.getCanvas().overlayRevision,
    })

    return {
      availableLayers,
      get canvas() {
        return overlayController.getCanvas()
      },
      async dispose() {
        if (disposed) {
          return
        }
        disposed = true
        await closeConnection(conn, db, worker)
      },
      subscribeCanvas: overlayController.subscribeCanvas,
      setSelectedPointIndices: overlayController.setSelectedPointIndices,
      setSelectedPointScopeSql: overlayController.setSelectedPointScopeSql,
      getOverlayPointIds: overlayController.getOverlayPointIds,
      reconcileOverlayPointIds: overlayController.reconcileOverlayPointIds,
      setOverlayProducerPointIds: overlayController.setOverlayProducerPointIds,
      clearOverlayProducer: overlayController.clearOverlayProducer,
      setOverlayPointIds: overlayController.setOverlayPointIds,
      clearOverlay: overlayController.clearOverlay,
      activateOverlay: overlayController.activateOverlay,
      runReadOnlyQuery(sql: string) {
        return executeReadOnlyQuery(conn, sql)
      },
      getPaperDocument(paperId: string) {
        const cached = paperDocumentCache.get(paperId)
        if (cached) {
          return cached
        }

        const next = (async () => {
          await ensureOptionalBundleTables(['paper_documents'])
          return queryPaperDocument(conn, paperId)
        })()
        paperDocumentCache.set(paperId, next)
        return next
      },
      getSelectionScopeGraphPaperRefs(args) {
        return querySelectionScopeGraphPaperRefs(conn, args)
      },
      getPaperNodesByGraphPaperRefs(graphPaperRefs: string[]) {
        return queryPaperNodesByGraphPaperRefs(conn, graphPaperRefs)
      },
      async ensureGraphPaperRefsAvailable(graphPaperRefs: string[]) {
        const requestedGraphPaperRefs = normalizeGraphPaperRefs(graphPaperRefs)
        if (requestedGraphPaperRefs.length === 0) {
          return {
            activeGraphPaperRefs: [],
            universePointIdsByGraphPaperRef: {},
            unresolvedGraphPaperRefs: [],
          }
        }

        const activePaperNodes = await queryPaperNodesByGraphPaperRefs(
          conn,
          requestedGraphPaperRefs
        )
        const activeGraphPaperRefSet = new Set(Object.keys(activePaperNodes))
        const unresolvedGraphPaperRefs = requestedGraphPaperRefs.filter(
          (graphPaperRef) => !activeGraphPaperRefSet.has(graphPaperRef)
        )

        if (unresolvedGraphPaperRefs.length === 0) {
          return {
            activeGraphPaperRefs: requestedGraphPaperRefs,
            universePointIdsByGraphPaperRef: {},
            unresolvedGraphPaperRefs: [],
          }
        }

        await ensureOptionalBundleTables(['universe_points'])
        let universePointIdsByGraphPaperRef = await queryUniversePointIdsByGraphPaperRefs(
          conn,
          unresolvedGraphPaperRefs
        )
        let stillUnresolvedGraphPaperRefs = unresolvedGraphPaperRefs.filter(
          (graphPaperRef) => !(graphPaperRef in universePointIdsByGraphPaperRef)
        )

        if (stillUnresolvedGraphPaperRefs.length > 0) {
          const attached = await maybeAttachGraphPaperRefs({
            bundle,
            conn,
            graphPaperRefs: stillUnresolvedGraphPaperRefs,
            ensureOptionalBundleTables,
          })

          if (attached) {
            await ensureOptionalBundleTables(['universe_points'])
            const attachedUniversePointIdsByGraphPaperRef =
              await queryUniversePointIdsByGraphPaperRefs(conn, stillUnresolvedGraphPaperRefs)
            universePointIdsByGraphPaperRef = {
              ...universePointIdsByGraphPaperRef,
              ...attachedUniversePointIdsByGraphPaperRef,
            }
            stillUnresolvedGraphPaperRefs = stillUnresolvedGraphPaperRefs.filter(
              (graphPaperRef) => !(graphPaperRef in attachedUniversePointIdsByGraphPaperRef)
            )
          }
        }

        return {
          activeGraphPaperRefs: Object.keys(activePaperNodes),
          universePointIdsByGraphPaperRef,
          unresolvedGraphPaperRefs: stillUnresolvedGraphPaperRefs,
        }
      },
      async getUniversePointIdsByGraphPaperRefs(graphPaperRefs: string[]) {
        await ensureOptionalBundleTables(['universe_points'])
        return queryUniversePointIdsByGraphPaperRefs(conn, graphPaperRefs)
      },
      resolvePointSelection(layer, selector) {
        const cacheKey = JSON.stringify({
          layer,
          id: selector.id ?? null,
          index: selector.index ?? null,
        })
        const cached = pointSelectionCache.get(cacheKey)
        if (cached) {
          return cached
        }
        const next = queryCorpusPointSelection(conn, selector)
        pointSelectionCache.set(cacheKey, next)
        return next
      },
      getTablePage(args) {
        return queryCorpusTablePage(conn, args)
      },
      exportTableCsv(args) {
        return exportCorpusTableCsv(conn, args)
      },
      getInfoSummary: infoQueries.getInfoSummary,
      getCategoricalValues: infoQueries.getCategoricalValues,
      getNumericValues: infoQueries.getNumericValues,
      getInfoBars: infoQueries.getInfoBars,
      getInfoBarsBatch: infoQueries.getInfoBarsBatch,
      getInfoHistogram: infoQueries.getInfoHistogram,
      getInfoHistogramsBatch: infoQueries.getInfoHistogramsBatch,
      getNumericStatsBatch: infoQueries.getNumericStatsBatch,
      getFacetSummary: infoQueries.getFacetSummary,
      getFacetSummaries: infoQueries.getFacetSummaries,
      searchPoints(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          column: args.column,
          query: args.query.trim().toLowerCase(),
          limit: args.limit ?? 12,
        })
        const cached = searchCache.get(cacheKey)
        if (cached) {
          return cached
        }
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
        if (cached) {
          return cached
        }

        const next = (async () => {
          const normalizedScopeSql =
            typeof args.scopeSql === 'string' && args.scopeSql.trim().length > 0
              ? args.scopeSql.trim()
              : null
          const scopeCoordinates =
            normalizedScopeSql != null
              ? getCachedCurrentScopeCoordinates(args.layer, normalizedScopeSql)
              : getCachedDatasetScopeCoordinates(args.layer)
          const resolvedScopeCoordinates = await scopeCoordinates

          return queryVisibilityBudget(conn, {
            ...args,
            scopeCoordinates:
              resolvedScopeCoordinates == null ||
              resolvedScopeCoordinates.length !== 4
                ? null
                : [
                    resolvedScopeCoordinates[0],
                    resolvedScopeCoordinates[1],
                    resolvedScopeCoordinates[2],
                    resolvedScopeCoordinates[3],
                  ],
          })
        })()

        visibilityBudgetCache.set(cacheKey, next)
        return next
      },
      getScopeCoordinates(args) {
        return getCachedScopeCoordinates(args)
      },
      getClusterDetail(clusterId: number) {
        return getCachedClusterDetail(clusterId)
      },
      getSelectionDetail(point: GraphPointRecord) {
        const cached = selectionCache.get(point.id)
        if (cached) {
          return cached
        }

        const next = (async (): Promise<GraphSelectionDetail> => {
          const [clusterDetail, paperRows] = await Promise.all([
            getCachedClusterDetail(point.clusterId),
            queryPaperDetail(conn, point.paperId ?? point.id),
          ])

          return {
            cluster: clusterDetail.cluster,
            exemplars: clusterDetail.exemplars,
            paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
            paperDocument: null,
          }
        })()

        selectionCache.set(point.id, next)
        return next
      },
    }
  } catch (error) {
    disposed = true
    await closeConnection(conn, db, worker)
    throw error
  }
}
