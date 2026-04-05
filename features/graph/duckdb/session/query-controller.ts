import type {
  GraphClusterDetail,
  GraphPointRecord,
  GraphSearchResult,
  GraphSelectionDetail,
  GraphVisibilityBudget,
  PaperDocument,
} from '@/features/graph/types'

import { maybeAttachGraphPaperRefs } from '../attachment'
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
import { createBoundedCache } from '../utils'
import {
  normalizeGraphPaperRefs,
  normalizeSelectedPointScopeSql,
} from './session-helpers'
import type {
  CreateSessionQueryControllerArgs,
  SessionQueryController,
} from './session-types'

export function createSessionQueryController({
  bundle,
  conn,
  ensureOptionalBundleTables,
}: CreateSessionQueryControllerArgs): SessionQueryController {
  const pointSelectionCache = createBoundedCache<string, Promise<GraphPointRecord | null>>()
  const selectionCache = createBoundedCache<string, Promise<GraphSelectionDetail>>()
  const clusterCache = createBoundedCache<number, Promise<GraphClusterDetail>>()
  const paperDocumentCache = createBoundedCache<string, Promise<PaperDocument | null>>()
  const searchCache = createBoundedCache<string, Promise<GraphSearchResult[]>>()
  const visibilityBudgetCache = createBoundedCache<
    string,
    Promise<GraphVisibilityBudget | null>
  >()
  const scopeCoordinatesCache = createBoundedCache<string, Promise<number[] | null>>()
  const tablePage1Cache = createBoundedCache<string, Promise<import('@/features/graph/types').GraphTablePageResult>>()

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

    const next = queryScopeCoordinates(conn, args).catch((error) => {
      scopeCoordinatesCache.delete(cacheKey)
      throw error
    })
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
      const [clusterRows, exemplarRows] = await Promise.all([
        queryClusterRows(conn, clusterId),
        queryExemplarRows(conn, clusterId),
      ])

      return {
        cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
        exemplars: exemplarRows.map(mapExemplar),
      }
    })().catch((error) => {
      clusterCache.delete(clusterId)
      throw error
    })

    clusterCache.set(clusterId, next)
    return next
  }

  return {
    resetOverlayDependentCaches() {
      pointSelectionCache.clear()
      searchCache.clear()
      visibilityBudgetCache.clear()
      scopeCoordinatesCache.clear()
      tablePage1Cache.clear()
    },
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
      })().catch((error) => {
        paperDocumentCache.delete(paperId)
        throw error
      })
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

      const next = queryCorpusPointSelection(conn, selector).catch((error) => {
        pointSelectionCache.delete(cacheKey)
        throw error
      })
      pointSelectionCache.set(cacheKey, next)
      return next
    },
    getTablePage(args) {
      if (args.view === 'current' && args.page === 1 && args.currentPointScopeSql == null) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          view: args.view,
          pageSize: args.pageSize,
        })
        const cached = tablePage1Cache.get(cacheKey)
        if (cached) {
          return cached
        }

        const next = queryCorpusTablePage(conn, args).catch((error) => {
          tablePage1Cache.delete(cacheKey)
          throw error
        })
        tablePage1Cache.set(cacheKey, next)
        return next
      }
      return queryCorpusTablePage(conn, args)
    },
    exportTableCsv(args) {
      return exportCorpusTableCsv(conn, args)
    },
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

      const next = queryPointSearch(conn, args).catch((error) => {
        searchCache.delete(cacheKey)
        throw error
      })
      searchCache.set(cacheKey, next)
      return next
    },
    getVisibilityBudget(args) {
      const normalizedScopeSql = normalizeSelectedPointScopeSql(args.scopeSql ?? null)
      const cacheKey = JSON.stringify({
        layer: args.layer,
        id: args.selector.id ?? null,
        index: args.selector.index ?? null,
        scopeSql: normalizedScopeSql,
      })
      const cached = visibilityBudgetCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const next = (async () => {
        const resolvedScopeCoordinates =
          normalizedScopeSql != null
            ? await getCachedCurrentScopeCoordinates(args.layer, normalizedScopeSql)
            : await getCachedDatasetScopeCoordinates(args.layer)

        return queryVisibilityBudget(conn, {
          ...args,
          scopeSql: normalizedScopeSql,
          scopeCoordinates:
            resolvedScopeCoordinates == null || resolvedScopeCoordinates.length !== 4
              ? null
              : [
                  resolvedScopeCoordinates[0],
                  resolvedScopeCoordinates[1],
                  resolvedScopeCoordinates[2],
                  resolvedScopeCoordinates[3],
                ],
        })
      })().catch((error) => {
        visibilityBudgetCache.delete(cacheKey)
        throw error
      })

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
      })().catch((error) => {
        selectionCache.delete(point.id)
        throw error
      })

      selectionCache.set(point.id, next)
      return next
    },
  }
}
