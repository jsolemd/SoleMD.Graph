import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

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
import { maybeAttachGraphPaperRefs } from './attachment'
import { createConnection, closeConnection } from './connection'
import { mapCluster, mapExemplar, mapPaper } from './mappers'
import { activateOverlayByClusterNeighborhood } from './overlay'
import { getColumnMetaForLayer } from './sql-helpers'
import {
  executeReadOnlyQuery,
  exportCorpusTableCsv,
  queryCorpusPointSelection,
  queryCorpusTablePage,
  queryClusterRows,
  queryExemplarRows,
  queryFacetSummary,
  queryFacetSummaries,
  queryInfoBars,
  queryInfoBarsBatch,
  queryInfoHistogram,
  queryInfoHistogramsBatch,
  queryInfoSummary,
  queryOverlayPointIds,
  queryPaperDetail,
  queryPaperDocument,
  queryPointSearch,
  queryPaperNodesByGraphPaperRefs,
  querySelectedGraphPaperRefs,
  queryScopeCoordinates,
  queryRows,
  queryUniversePointIdsByGraphPaperRefs,
  queryCategoricalValues,
  queryNumericValues,
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

function partitionFacetColumns(
  layer: Parameters<typeof queryFacetSummaries>[1]['layer'],
  columns: string[]
) {
  const simpleColumns: string[] = []
  const multiValueColumns: string[] = []

  for (const column of columns) {
    if (getColumnMetaForLayer(column, layer)?.isMultiValue) {
      multiValueColumns.push(column)
    } else {
      simpleColumns.push(column)
    }
  }

  return { simpleColumns, multiValueColumns }
}

function mapBarsToFacetRows(
  rows: Array<{ value: string; count: number }>
): GraphInfoFacetRow[] {
  return rows.map((row) => ({
    value: row.value,
    scopedCount: row.count,
    totalCount: row.count,
  }))
}

async function getScopedFacetBarCounts(
  conn: AsyncDuckDBConnection,
  args: {
    layer: Parameters<typeof queryFacetSummaries>[1]['layer']
    columns: string[]
    maxItems: number
    scope: 'current' | 'selected'
    currentPointScopeSql: string | null
  }
): Promise<Record<string, Array<{ value: string; count: number }>>> {
  const { simpleColumns, multiValueColumns } = partitionFacetColumns(
    args.layer,
    args.columns
  )

  const [simpleResults, multiValueResults] = await Promise.all([
    simpleColumns.length > 0
      ? queryInfoBarsBatch(conn, {
          layer: args.layer,
          scope: args.scope,
          columns: simpleColumns,
          maxItems: args.maxItems,
          currentPointScopeSql: args.currentPointScopeSql,
        })
      : Promise.resolve({} as Record<string, Array<{ value: string; count: number }>>),
    multiValueColumns.length > 0
      ? Promise.all(
          multiValueColumns.map(async (column) => {
            const rows = await queryFacetSummary(conn, {
              layer: args.layer,
              scope: args.scope,
              column,
              maxItems: args.maxItems,
              currentPointScopeSql: args.currentPointScopeSql,
            })

            return [
              column,
              rows
                .filter((row: GraphInfoFacetRow) => row.scopedCount > 0)
                .map((row: GraphInfoFacetRow) => ({
                  value: row.value,
                  count: row.scopedCount,
                })),
            ] as const
          })
        ).then((entries) => Object.fromEntries(entries))
      : Promise.resolve({} as Record<string, Array<{ value: string; count: number }>>),
  ])

  return {
    ...simpleResults,
    ...multiValueResults,
  }
}

function haveSamePointIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const rightPointIdSet = new Set(right)
  return left.every((pointId) => rightPointIdSet.has(pointId))
}

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

    const pointSelectionCache = createBoundedCache<string, Promise<GraphPointRecord | null>>()
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
    const categoricalValueDatasetCache = createBoundedCache<string, Promise<string[]>>()
    const numericValueDatasetCache = createBoundedCache<string, Promise<number[]>>()

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
      pointSelectionCache.clear()
      searchCache.clear()
      visibilityBudgetCache.clear()
      scopeCoordinatesCache.clear()
      facetDatasetCache.clear()
      histogramDatasetCache.clear()
      summaryDatasetCache.clear()
      categoricalValueDatasetCache.clear()
      numericValueDatasetCache.clear()
    }

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

      const next = (async () => {
        const { simpleColumns, multiValueColumns } = partitionFacetColumns(
          args.layer,
          args.columns
        )

        const [simpleResults, multiValueResults] = await Promise.all([
          simpleColumns.length > 0
            ? queryInfoBarsBatch(conn, {
                layer: args.layer,
                scope: 'dataset',
                columns: simpleColumns,
                maxItems: args.maxItems,
                currentPointScopeSql: null,
              })
            : Promise.resolve({} as Record<string, Array<{ value: string; count: number }>>),
          multiValueColumns.length > 0
            ? queryFacetSummaries(conn, {
                layer: args.layer,
                scope: 'dataset',
                columns: multiValueColumns,
                maxItems: args.maxItems,
                currentPointScopeSql: null,
              })
            : Promise.resolve({} as Record<string, GraphInfoFacetRow[]>),
        ])

        const result: Record<string, GraphInfoFacetRow[]> = {}

        for (const column of simpleColumns) {
          result[column] = mapBarsToFacetRows(simpleResults[column] ?? [])
        }

        for (const column of multiValueColumns) {
          result[column] = multiValueResults[column] ?? []
        }

        return result
      })()
        .then((result) => {
          const hasAnyRows = Object.values(result).some((rows) => rows.length > 0)
          if (!hasAnyRows) {
            facetDatasetCache.delete(cacheKey)
          }
          return result
        })
        .catch((error) => {
          facetDatasetCache.delete(cacheKey)
          throw error
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
      }).catch((error) => {
        summaryDatasetCache.delete(cacheKey)
        throw error
      })
      summaryDatasetCache.set(cacheKey, next)
      return next
    }

    const getCachedDatasetInfoHistograms = (args: {
      layer: Parameters<typeof queryInfoHistogramsBatch>[1]['layer']
      columns: string[]
      bins: number
      useQuantiles?: boolean
    }) => {
      const cacheKey = JSON.stringify({
        layer: args.layer,
        columns: [...new Set(args.columns)].sort(),
        bins: args.bins,
        useQuantiles: args.useQuantiles === true,
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
        useQuantiles: args.useQuantiles === true,
        currentPointScopeSql: null,
      }).then((result) => {
        const hasAnyBins = Object.values(result).some(
          (entry) => entry.totalCount > 0 || entry.bins.length > 0
        )
        if (!hasAnyBins) {
          histogramDatasetCache.delete(cacheKey)
        }
        return result
      }).catch((error) => {
        histogramDatasetCache.delete(cacheKey)
        throw error
      })
      histogramDatasetCache.set(cacheKey, next)
      return next
    }

    const getCachedCategoricalValues = (args: {
      layer: Parameters<typeof queryCategoricalValues>[1]['layer']
      column: string
    }) => {
      const cacheKey = JSON.stringify({
        layer: args.layer,
        column: args.column,
        overlayRevision,
      })
      const cached = categoricalValueDatasetCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const next = queryCategoricalValues(conn, {
        layer: args.layer,
        scope: 'dataset',
        column: args.column,
        currentPointScopeSql: null,
      }).then((values) => {
        if (values.length === 0) {
          categoricalValueDatasetCache.delete(cacheKey)
        }
        return values
      }).catch((error) => {
        categoricalValueDatasetCache.delete(cacheKey)
        throw error
      })
      categoricalValueDatasetCache.set(cacheKey, next)
      return next
    }

    const getCachedNumericValues = (args: {
      layer: Parameters<typeof queryNumericValues>[1]['layer']
      column: string
    }) => {
      const cacheKey = JSON.stringify({
        layer: args.layer,
        column: args.column,
        overlayRevision,
      })
      const cached = numericValueDatasetCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const next = queryNumericValues(conn, {
        layer: args.layer,
        scope: 'dataset',
        column: args.column,
        currentPointScopeSql: null,
      }).then((values) => {
        if (values.length === 0) {
          numericValueDatasetCache.delete(cacheKey)
        }
        return values
      }).catch((error) => {
        numericValueDatasetCache.delete(cacheKey)
        throw error
      })
      numericValueDatasetCache.set(cacheKey, next)
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
      async dispose() {
        if (disposed) {
          return
        }
        disposed = true
        await closeConnection(conn, db, worker)
      },
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
      getSelectedGraphPaperRefs() {
        return querySelectedGraphPaperRefs(conn)
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
        if (cached) return cached
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
      getCategoricalValues(args) {
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedCategoricalValues({
            layer: args.layer,
            column: args.column,
          })
        }

        return queryCategoricalValues(conn, args)
      },
      getNumericValues(args) {
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope)) {
          return getCachedNumericValues({
            layer: args.layer,
            column: args.column,
          })
        }

        return queryNumericValues(conn, args)
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

        if (getColumnMetaForLayer(args.column, args.layer)?.isMultiValue) {
          return getScopedFacetBarCounts(conn, {
            layer: args.layer,
            scope: args.scope,
            columns: [args.column],
            maxItems: safeMaxItems,
            currentPointScopeSql: args.currentPointScopeSql,
          }).then((result) => result[args.column] ?? [])
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

        return getScopedFacetBarCounts(conn, {
          layer: args.layer,
          scope: args.scope,
          columns: args.columns,
          maxItems: safeMaxItems,
          currentPointScopeSql: args.currentPointScopeSql,
        })
      },
      getInfoHistogram(args) {
        const safeBins = args.bins ?? 16
        const hasCustomExtent =
          Array.isArray(args.extent) &&
          args.extent.length === 2 &&
          Number.isFinite(args.extent[0]) &&
          Number.isFinite(args.extent[1])
        const useQuantiles = args.useQuantiles === true
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (
          !hasCustomExtent &&
          (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope))
        ) {
          return getCachedDatasetInfoHistograms({
            layer: args.layer,
            columns: [args.column],
            bins: safeBins,
            useQuantiles,
          }).then((result) => result[args.column] ?? { bins: [], totalCount: 0 })
        }

        return queryInfoHistogram(conn, { ...args, bins: safeBins })
      },
      getInfoHistogramsBatch(args) {
        const safeBins = args.bins ?? 16
        const hasCustomExtent =
          Array.isArray(args.extent) &&
          args.extent.length === 2 &&
          Number.isFinite(args.extent[0]) &&
          Number.isFinite(args.extent[1])
        const useQuantiles = args.useQuantiles === true
        const hasCurrentScope =
          typeof args.currentPointScopeSql === 'string' &&
          args.currentPointScopeSql.trim().length > 0

        if (
          !hasCustomExtent &&
          (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScope))
        ) {
          return getCachedDatasetInfoHistograms({
            layer: args.layer,
            columns: args.columns,
            bins: safeBins,
            useQuantiles,
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

        if (getColumnMetaForLayer(args.column, args.layer)?.isMultiValue) {
          return queryFacetSummary(conn, {
            ...args,
            maxItems: safeMaxItems,
          })
        }

        const mergeDepth = Math.max(safeMaxItems, 24)
        return Promise.all([
          getCachedDatasetFacetSummaries({
            layer: args.layer,
            columns: [args.column],
            maxItems: mergeDepth,
          }),
          getScopedFacetBarCounts(conn, {
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
          getScopedFacetBarCounts(conn, {
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
        if (cached) return cached

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
