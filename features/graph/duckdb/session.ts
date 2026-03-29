import type {
  GraphBundle,
  GraphClusterDetail,
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoSummary,
  GraphPointRecord,
  GraphSearchResult,
  GraphSelectionDetail,
  GraphVisibilityBudget,
  OverlayProducerId,
  PaperDocument,
} from '@/features/graph/types'
import {
  LEGACY_OVERLAY_PRODUCER,
  MANUAL_CLUSTER_NEIGHBORHOOD_OVERLAY_PRODUCER,
} from '@/features/graph/lib/overlay-producers'

import {
  buildCanvasSource,
  queryCanvasPointCounts,
  registerActiveCanvasAliasViews,
} from './canvas'
import { createConnection, closeConnection } from './connection'
import { mapCluster, mapExemplar, mapPaper } from './mappers'
import { activateOverlayByClusterNeighborhood } from './overlay'
import {
  executeReadOnlyQuery,
  exportCorpusTableCsv,
  queryCorpusPointSelection,
  queryCorpusTablePage,
  queryClusterRows,
  queryExemplarRows,
  queryFacetSummaries,
  queryInfoBars,
  queryInfoBarsBatch,
  queryInfoHistogram,
  queryInfoHistogramsBatch,
  queryInfoSummary,
  queryOverlayPointIds,
  queryPaperDetail,
  queryPaperDocument,
  queryPaperNodesByPaperIds,
  queryScopeCoordinates,
  queryPointSearch,
  queryRows,
  queryUniversePointIdsByPaperIds,
  queryVisibilityBudget,
} from './queries'
import type { GraphBundleSession, GraphCanvasListener, ProgressCallback } from './types'
import { createBoundedCache, getAutoloadBundleTables } from './utils'
import {
  clearAllOverlayPointIds,
  clearOverlayProducerPointIds,
  initializeSelectedPointTable,
  materializeOverlayPointIds,
  createEnsureOptionalBundleTables,
  registerInitialSessionViews,
  replaceSelectedPointIndices,
  replaceSelectedPointIndicesFromScopeSql,
  replaceOverlayProducerPointIds,
} from './views'

function normalizeOverlayPointIds(pointIds: string[]): string[] {
  return [...new Set(pointIds.filter((pointId) => pointId.trim().length > 0))]
}

function haveSamePointIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const rightPointIdSet = new Set(right)
  return left.every((pointId) => rightPointIdSet.has(pointId))
}

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
    await initializeSelectedPointTable(conn)
    await registerActiveCanvasAliasViews(conn, {
      overlayRevision,
      overlayCount: 0,
    })

    const initialPointCounts = await queryCanvasPointCounts(conn)

    onProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Canvas tables are ready. Graph rendering can begin immediately.',
      percent: 12,
      loadedRows: 0,
      totalRows: initialPointCounts.corpus,
    })

    const selectionCache = createBoundedCache<string, Promise<GraphSelectionDetail>>()
    const clusterCache = createBoundedCache<number, Promise<GraphClusterDetail>>()
    const paperDocumentCache = createBoundedCache<string, Promise<PaperDocument | null>>()
    const searchCache = createBoundedCache<string, Promise<GraphSearchResult[]>>()
    const visibilityBudgetCache = createBoundedCache<string, Promise<GraphVisibilityBudget | null>>()
    const scopeCoordinatesCache = createBoundedCache<string, Promise<number[] | null>>()
    const facetDatasetCache = createBoundedCache<
      string,
      Promise<Record<string, GraphInfoFacetRow[]>>
    >()
    const histogramDatasetCache = createBoundedCache<
      string,
      Promise<Record<string, GraphInfoHistogramResult>>
    >()
    const summaryDatasetCache = createBoundedCache<string, Promise<GraphInfoSummary>>()

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
      scopeCoordinatesCache.clear()
      facetDatasetCache.clear()
      histogramDatasetCache.clear()
      summaryDatasetCache.clear()
    }

    const getCachedDatasetFacetSummaries = (args: {
      layer: Parameters<typeof queryFacetSummaries>[1]['layer']
      columns: string[]
      maxItems: number
    }) => {
      const cacheKey = JSON.stringify({
        layer: args.layer,
        columns: [...new Set(args.columns)].sort(),
        maxItems: args.maxItems,
        overlayRevision,
      })
      const cached = facetDatasetCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const next = queryFacetSummaries(conn, {
        layer: args.layer,
        scope: 'dataset',
        columns: args.columns,
        maxItems: args.maxItems,
        currentPointScopeSql: null,
      })
      facetDatasetCache.set(cacheKey, next)
      return next
    }

    const getCachedDatasetInfoSummary = (layer: Parameters<typeof queryInfoSummary>[1]['layer']) => {
      const cacheKey = JSON.stringify({
        layer,
        overlayRevision,
      })
      const cached = summaryDatasetCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const next = queryInfoSummary(conn, {
        layer,
        scope: 'dataset',
        currentPointScopeSql: null,
      })
      summaryDatasetCache.set(cacheKey, next)
      return next
    }

    const getCachedDatasetInfoHistograms = (args: {
      layer: Parameters<typeof queryInfoHistogramsBatch>[1]['layer']
      columns: string[]
      bins: number
    }) => {
      const cacheKey = JSON.stringify({
        layer: args.layer,
        columns: [...new Set(args.columns)].sort(),
        bins: args.bins,
        overlayRevision,
      })
      const cached = histogramDatasetCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const next = queryInfoHistogramsBatch(conn, {
        layer: args.layer,
        scope: 'dataset',
        columns: args.columns,
        bins: args.bins,
        currentPointScopeSql: null,
      })
      histogramDatasetCache.set(cacheKey, next)
      return next
    }

    const mergeFacetSummaryRows = (args: {
      datasetRows: GraphInfoFacetRow[]
      scopedRows: Array<{ value: string; count: number }>
      maxItems: number
    }): GraphInfoFacetRow[] => {
      const { datasetRows, scopedRows, maxItems } = args
      const rows: GraphInfoFacetRow[] = []
      const seen = new Set<string>()
      const totalCountByValue = new Map(
        datasetRows.map((row) => [row.value, row.totalCount] as const)
      )

      for (const row of scopedRows) {
        if (seen.has(row.value)) {
          continue
        }
        seen.add(row.value)
        rows.push({
          value: row.value,
          scopedCount: row.count,
          totalCount: totalCountByValue.get(row.value) ?? 0,
        })
        if (rows.length >= maxItems) {
          return rows
        }
      }

      for (const row of datasetRows) {
        if (seen.has(row.value)) {
          continue
        }
        seen.add(row.value)
        rows.push({
          value: row.value,
          scopedCount: 0,
          totalCount: row.totalCount,
        })
        if (rows.length >= maxItems) {
          break
        }
      }

      return rows
    }

    const refreshCanvas = async (incrementRevision = true) => {
      const pointCounts = await queryCanvasPointCounts(conn)
      const overlayRows = await queryRows<{ count: number }>(
        conn, `SELECT count(*)::INTEGER AS count FROM overlay_points_web`
      )
      if (incrementRevision) overlayRevision += 1
      await registerActiveCanvasAliasViews(conn, {
        overlayRevision,
        overlayCount: overlayRows[0]?.count ?? 0,
      })
      canvas = buildCanvasSource({
        conn, db, pointCounts,
        overlayCount: overlayRows[0]?.count ?? 0, overlayRevision,
      })
      emitCanvas()
      return { overlayCount: canvas.overlayCount }
    }

    let overlayMutationChain: Promise<void> = Promise.resolve()

    const runOverlayMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
      const previousMutation = overlayMutationChain
      let releaseMutation!: () => void
      overlayMutationChain = new Promise<void>((resolve) => {
        releaseMutation = resolve
      })

      await previousMutation
      try {
        return await operation()
      } finally {
        releaseMutation()
      }
    }

    const queryOverlayProducerPointIds = async (producerId: OverlayProducerId) => {
      const rows = await queryRows<{ id: string }>(
        conn,
        `SELECT id
         FROM overlay_point_ids_by_producer
         WHERE producer_id = ?
         ORDER BY id`,
        [producerId]
      )

      return rows
        .map((row) => row.id)
        .filter((pointId): pointId is string => typeof pointId === 'string' && pointId.length > 0)
    }

    const queryOverlayPointIdsExcludingProducer = async (producerId: OverlayProducerId) => {
      const rows = await queryRows<{ id: string }>(
        conn,
        `SELECT DISTINCT id
         FROM overlay_point_ids_by_producer
         WHERE producer_id <> ?
         ORDER BY id`,
        [producerId]
      )

      return rows
        .map((row) => row.id)
        .filter((pointId): pointId is string => typeof pointId === 'string' && pointId.length > 0)
    }

    const refreshOverlayCanvas = async () => {
      await materializeOverlayPointIds(conn)
      await replaceSelectedPointIndices(conn, [])
      return refreshCanvas()
    }

    const setOverlayProducerPointIdsInternal = async ({
      producerId,
      pointIds,
    }: {
      producerId: OverlayProducerId
      pointIds: string[]
    }) => {
      const nextProducerPointIds = normalizeOverlayPointIds(pointIds)
      const currentProducerPointIds = await queryOverlayProducerPointIds(producerId)

      if (haveSamePointIds(currentProducerPointIds, nextProducerPointIds)) {
        return { overlayCount: canvas.overlayCount }
      }

      resetOverlayDependentCaches()
      if (nextProducerPointIds.length === 0) {
        await clearOverlayProducerPointIds(conn, producerId)
      } else {
        await ensureOptionalBundleTables(['universe_points', 'universe_links'])
        await replaceOverlayProducerPointIds(conn, {
          producerId,
          pointIds: nextProducerPointIds,
        })
      }

      return refreshOverlayCanvas()
    }

    const clearOverlayProducerInternal = async (producerId: OverlayProducerId) => {
      const currentProducerPointIds = await queryOverlayProducerPointIds(producerId)
      if (currentProducerPointIds.length === 0) {
        return { overlayCount: canvas.overlayCount }
      }

      resetOverlayDependentCaches()
      await clearOverlayProducerPointIds(conn, producerId)
      return refreshOverlayCanvas()
    }

    const reconcileOverlayPointIdsInternal = async ({
      previousPointIds,
      nextPointIds,
    }: {
      previousPointIds: string[]
      nextPointIds: string[]
    }) => {
      const currentOverlayPointIds = await queryOverlayPointIds(conn)
      const previousPointIdSet = new Set(normalizeOverlayPointIds(previousPointIds))
      const preservedPointIds = currentOverlayPointIds.filter(
        (pointId) => !previousPointIdSet.has(pointId)
      )
      const desiredOverlayPointIds = normalizeOverlayPointIds([
        ...preservedPointIds,
        ...nextPointIds,
      ])
      const otherProducerPointIds = await queryOverlayPointIdsExcludingProducer(
        LEGACY_OVERLAY_PRODUCER
      )
      const otherProducerPointIdSet = new Set(otherProducerPointIds)
      const nextLegacyPointIds = desiredOverlayPointIds.filter(
        (pointId) => !otherProducerPointIdSet.has(pointId)
      )

      return setOverlayProducerPointIdsInternal({
        producerId: LEGACY_OVERLAY_PRODUCER,
        pointIds: nextLegacyPointIds,
      })
    }

    return {
      availableLayers,
      canvas,
      subscribeCanvas,
      async setSelectedPointIndices(pointIndices: number[]) {
        const normalized = [...new Set(
          pointIndices
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0)
        )]
        await replaceSelectedPointIndices(conn, normalized)
      },
      async setSelectedPointScopeSql(scopeSql: string | null) {
        await replaceSelectedPointIndicesFromScopeSql(conn, scopeSql)
      },
      getOverlayPointIds() {
        return queryOverlayPointIds(conn)
      },
      async reconcileOverlayPointIds(args: {
        previousPointIds: string[]
        nextPointIds: string[]
      }) {
        return runOverlayMutation(async () =>
          reconcileOverlayPointIdsInternal(args)
        )
      },
      async setOverlayProducerPointIds(args) {
        return runOverlayMutation(async () =>
          setOverlayProducerPointIdsInternal(args)
        )
      },
      async clearOverlayProducer(producerId) {
        return runOverlayMutation(async () =>
          clearOverlayProducerInternal(producerId)
        )
      },
      async setOverlayPointIds(pointIds: string[]) {
        return runOverlayMutation(async () =>
          setOverlayProducerPointIdsInternal({
            producerId: MANUAL_CLUSTER_NEIGHBORHOOD_OVERLAY_PRODUCER,
            pointIds,
          })
        )
      },
      async clearOverlay() {
        return runOverlayMutation(async () => {
          if (canvas.overlayCount === 0) {
            return { overlayCount: 0 }
          }

          resetOverlayDependentCaches()
          await clearAllOverlayPointIds(conn)
          return refreshCanvas()
        })
      },
      async activateOverlay(args) {
        return runOverlayMutation(async () => {
          await ensureOptionalBundleTables(['universe_points', 'universe_links'])
          resetOverlayDependentCaches()
          const result =
            args.kind === 'cluster-neighborhood'
              ? await activateOverlayByClusterNeighborhood(
                  conn,
                  args,
                  MANUAL_CLUSTER_NEIGHBORHOOD_OVERLAY_PRODUCER
                )
              : (() => {
                  throw new Error(`Unsupported overlay activation kind: ${args.kind}`)
                })()
          if (!result.applied) {
            return {
              kind: args.kind,
              layer: args.layer,
              scope: args.scope,
              overlayCount: canvas.overlayCount,
              addedCount: 0,
              seedCount: 0,
              clusterCount: 0,
            }
          }
          const overlayState = await refreshOverlayCanvas()
          return {
            kind: result.kind,
            layer: result.layer,
            scope: result.scope,
            overlayCount: overlayState.overlayCount,
            addedCount: result.addedCount,
            seedCount: result.seedCount,
            clusterCount: result.clusterCount,
          }
        })
      },
      runReadOnlyQuery(sql: string) {
        return executeReadOnlyQuery(conn, sql)
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
      resolvePointSelection(layer, selector) {
        void layer
        return queryCorpusPointSelection(conn, selector)
      },
      getTablePage(args) {
        return queryCorpusTablePage(conn, args)
      },
      exportTableCsv(args) {
        return exportCorpusTableCsv(conn, args)
      },
      getInfoSummary(args) {
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedDatasetInfoSummary(args.layer)
        }

        return queryInfoSummary(conn, {
          ...args,
          datasetTotalCount: canvas.pointCounts[args.layer] ?? 0,
        })
      },
      getInfoBars(args) {
        const safeMaxItems = args.maxItems ?? 8
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedDatasetFacetSummaries({
            layer: args.layer,
            columns: [args.column],
            maxItems: safeMaxItems,
          }).then((result) =>
            (result[args.column] ?? []).map((row) => ({
              value: row.value,
              count: row.totalCount,
            }))
          )
        }

        return queryInfoBars(conn, { ...args, maxItems: safeMaxItems })
      },
      getInfoBarsBatch(args) {
        const safeMaxItems = args.maxItems ?? 8
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedDatasetFacetSummaries({
            layer: args.layer,
            columns: args.columns,
            maxItems: safeMaxItems,
          }).then((result) =>
            Object.fromEntries(
              args.columns.map((column) => [
                column,
                (result[column] ?? []).map((row) => ({
                  value: row.value,
                  count: row.totalCount,
                })),
              ])
            )
          )
        }

        return queryInfoBarsBatch(conn, { ...args, maxItems: safeMaxItems })
      },
      getInfoHistogram(args) {
        const safeBins = args.bins ?? 16
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedDatasetInfoHistograms({
            layer: args.layer,
            columns: [args.column],
            bins: safeBins,
          }).then((result) => result[args.column] ?? { bins: [], totalCount: 0 })
        }

        return queryInfoHistogram(conn, { ...args, bins: safeBins })
      },
      getInfoHistogramsBatch(args) {
        const safeBins = args.bins ?? 16
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedDatasetInfoHistograms({
            layer: args.layer,
            columns: args.columns,
            bins: safeBins,
          })
        }

        return queryInfoHistogramsBatch(conn, { ...args, bins: safeBins })
      },
      getFacetSummary(args) {
        const safeMaxItems = args.maxItems ?? 6
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedDatasetFacetSummaries({
            layer: args.layer,
            columns: [args.column],
            maxItems: safeMaxItems,
          }).then((result) => result[args.column] ?? [])
        }

        const mergeDepth = Math.max(safeMaxItems, 24)
        return Promise.all([
          getCachedDatasetFacetSummaries({
            layer: args.layer,
            columns: [args.column],
            maxItems: mergeDepth,
          }),
          queryInfoBarsBatch(conn, {
            layer: args.layer,
            scope: args.scope,
            columns: [args.column],
            maxItems: mergeDepth,
            currentPointScopeSql: args.currentPointScopeSql,
          }),
        ]).then(([datasetSummaries, scopedBars]) =>
          mergeFacetSummaryRows({
            datasetRows: datasetSummaries[args.column] ?? [],
            scopedRows: scopedBars[args.column] ?? [],
            maxItems: safeMaxItems,
          })
        )
      },
      getFacetSummaries(args) {
        const safeMaxItems = args.maxItems ?? 6
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedDatasetFacetSummaries({
            layer: args.layer,
            columns: args.columns,
            maxItems: safeMaxItems,
          })
        }

        const mergeDepth = Math.max(safeMaxItems, 24)
        return Promise.all([
          getCachedDatasetFacetSummaries({
            layer: args.layer,
            columns: args.columns,
            maxItems: mergeDepth,
          }),
          queryInfoBarsBatch(conn, {
            layer: args.layer,
            scope: args.scope,
            columns: args.columns,
            maxItems: mergeDepth,
            currentPointScopeSql: args.currentPointScopeSql,
          }),
        ]).then(([datasetSummaries, scopedBars]) =>
          Object.fromEntries(
            args.columns.map((column) => [
              column,
              mergeFacetSummaryRows({
                datasetRows: datasetSummaries[column] ?? [],
                scopedRows: scopedBars[column] ?? [],
                maxItems: safeMaxItems,
              }),
            ])
          )
        )
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
      getScopeCoordinates(args) {
        const cacheKey = JSON.stringify(args)
        const cached = scopeCoordinatesCache.get(cacheKey)
        if (cached) return cached
        const next = queryScopeCoordinates(conn, args)
        scopeCoordinatesCache.set(cacheKey, next)
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
      getSelectionDetail(point: GraphPointRecord) {
        const cached = selectionCache.get(point.id)
        if (cached) return cached

        const next = (async (): Promise<GraphSelectionDetail> => {
          await ensureOptionalBundleTables(['cluster_exemplars'])
          const [clusterRows_, exemplarRows, paperRows] = await Promise.all([
            queryClusterRows(conn, point.clusterId),
            queryExemplarRows(conn, point.clusterId),
            queryPaperDetail(conn, point.paperId ?? point.id),
          ])

          return {
            cluster: clusterRows_[0] ? mapCluster(clusterRows_[0]) : null,
            exemplars: exemplarRows.map(mapExemplar),
            paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
            paperDocument: null,
          }
        })()

        selectionCache.set(point.id, next)
        return next
      },
    }
  } catch (error) {
    await closeConnection(conn, db, worker)
    throw error
  }
}
