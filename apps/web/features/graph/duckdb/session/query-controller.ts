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
import { cachedQuery, createBoundedCache } from '../utils'
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
  const clusterCache = createBoundedCache<string, Promise<GraphClusterDetail>>()
  const paperDocumentCache = createBoundedCache<string, Promise<PaperDocument | null>>()
  const searchCache = createBoundedCache<string, Promise<GraphSearchResult[]>>()
  const visibilityBudgetCache = createBoundedCache<
    string,
    Promise<GraphVisibilityBudget | null>
  >()
  const scopeCoordinatesCache = createBoundedCache<string, Promise<number[] | null>>()
  const tablePage1Cache = createBoundedCache<string, Promise<import('@/features/graph/types').GraphTablePageResult>>()
  const tablePageInFlightCache = createBoundedCache<
    string,
    Promise<import('@/features/graph/types').GraphTablePageResult>
  >()

  const getDedupedTablePage = (
    args: Parameters<SessionQueryController['getTablePage']>[0]
  ) =>
    cachedQuery(
      tablePageInFlightCache,
      {
        layer: args.layer,
        view: args.view,
        page: args.page,
        pageSize: args.pageSize,
        currentPointScopeSql: args.currentPointScopeSql,
      },
      () => queryCorpusTablePage(conn, args),
      { evictWhen: () => true }
    )

  const getCachedScopeCoordinates = (args: {
    layer: Parameters<typeof queryScopeCoordinates>[1]['layer']
    scope: Parameters<typeof queryScopeCoordinates>[1]['scope']
    currentPointScopeSql: string | null
  }) =>
    cachedQuery(
      scopeCoordinatesCache,
      { layer: args.layer, scope: args.scope, currentPointScopeSql: args.currentPointScopeSql },
      () => queryScopeCoordinates(conn, args),
    )

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

  const getCachedClusterDetail = (clusterId: number) =>
    cachedQuery(
      clusterCache,
      { clusterId },
      async (): Promise<GraphClusterDetail> => {
        await ensureOptionalBundleTables(['cluster_exemplars'])
        const [clusterRows, exemplarRows] = await Promise.all([
          queryClusterRows(conn, clusterId),
          queryExemplarRows(conn, clusterId),
        ])
        return {
          cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
          exemplars: exemplarRows.map(mapExemplar),
        }
      },
    )

  return {
    resetOverlayDependentCaches() {
      pointSelectionCache.clear()
      searchCache.clear()
      visibilityBudgetCache.clear()
      scopeCoordinatesCache.clear()
      tablePage1Cache.clear()
      tablePageInFlightCache.clear()
    },
    runReadOnlyQuery(sql: string) {
      return executeReadOnlyQuery(conn, sql)
    },
    getPaperDocument(paperId: string) {
      return cachedQuery(
        paperDocumentCache,
        { paperId },
        async () => {
          await ensureOptionalBundleTables(['paper_documents'])
          return queryPaperDocument(conn, paperId)
        },
      )
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

      let universePointIdsByGraphPaperRef = await queryUniversePointIdsByGraphPaperRefs(
        conn,
        unresolvedGraphPaperRefs
      )
      let stillUnresolvedGraphPaperRefs = unresolvedGraphPaperRefs.filter(
        (graphPaperRef) => !(graphPaperRef in universePointIdsByGraphPaperRef)
      )

      if (stillUnresolvedGraphPaperRefs.length > 0) {
        // Reuse already-local attached universe rows before paying another network attach.
        const attached = await maybeAttachGraphPaperRefs({
          bundle,
          conn,
          graphPaperRefs: stillUnresolvedGraphPaperRefs,
          ensureOptionalBundleTables,
        })

        if (attached) {
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

      if (stillUnresolvedGraphPaperRefs.length > 0) {
        await ensureOptionalBundleTables(['universe_points'])
        const bundledUniversePointIdsByGraphPaperRef =
          await queryUniversePointIdsByGraphPaperRefs(conn, stillUnresolvedGraphPaperRefs)
        universePointIdsByGraphPaperRef = {
          ...universePointIdsByGraphPaperRef,
          ...bundledUniversePointIdsByGraphPaperRef,
        }
        stillUnresolvedGraphPaperRefs = stillUnresolvedGraphPaperRefs.filter(
          (graphPaperRef) => !(graphPaperRef in bundledUniversePointIdsByGraphPaperRef)
        )
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
      return cachedQuery(
        pointSelectionCache,
        { layer, id: selector.id ?? null, index: selector.index ?? null },
        () => queryCorpusPointSelection(conn, selector),
      )
    },
    getTablePage(args) {
      if (args.view === 'current' && args.page === 1 && args.currentPointScopeSql == null) {
        return cachedQuery(
          tablePage1Cache,
          { layer: args.layer, view: args.view, pageSize: args.pageSize },
          () => queryCorpusTablePage(conn, args),
        )
      }
      return getDedupedTablePage(args)
    },
    exportTableCsv(args) {
      return exportCorpusTableCsv(conn, args)
    },
    searchPoints(args) {
      return cachedQuery(
        searchCache,
        { layer: args.layer, column: args.column, query: args.query.trim().toLowerCase(), limit: args.limit ?? 12 },
        () => queryPointSearch(conn, args),
      )
    },
    getVisibilityBudget(args) {
      const normalizedScopeSql = normalizeSelectedPointScopeSql(args.scopeSql ?? null)
      return cachedQuery(
        visibilityBudgetCache,
        { layer: args.layer, id: args.selector.id ?? null, index: args.selector.index ?? null, scopeSql: normalizedScopeSql },
        async () => {
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
        },
      )
    },
    getScopeCoordinates(args) {
      return getCachedScopeCoordinates(args)
    },
    getClusterDetail(clusterId: number) {
      return getCachedClusterDetail(clusterId)
    },
    getSelectionDetail(point: GraphPointRecord) {
      return cachedQuery(
        selectionCache,
        { id: point.id },
        async (): Promise<GraphSelectionDetail> => {
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
        },
      )
    },
  }
}
