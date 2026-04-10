import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type {
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoSummary,
} from '@/features/graph/types'

import { cachedQuery, createBoundedCache } from '../utils'
import {
  queryCategoricalValues,
  queryFacetSummaries,
  queryFacetSummary,
  queryInfoBars,
  queryInfoBarsBatch,
  queryInfoHistogram,
  queryInfoHistogramsBatch,
  queryInfoSummary,
  queryNumericStatsBatch,
  queryNumericValues,
} from '../queries'
import type { NumericStatsRow } from '../queries'
import { getColumnMetaForLayer } from '../sql-helpers'
import {
  getScopedFacetBarCounts,
  hasFiniteExtent,
  isEffectivelyDatasetScope,
  mapBarsToFacetRows,
  mergeFacetSummaryRows,
  partitionFacetColumns,
} from './session-helpers'
import type {
  EnsurePrimaryQueryTables,
  SessionInfoController,
} from './session-types'

interface SessionInfoQueriesArgs {
  conn: AsyncDuckDBConnection
  getDatasetTotalCount: (layer: Parameters<typeof queryInfoSummary>[1]['layer']) => number
  getOverlayRevision: () => number
  ensurePrimaryQueryTables: EnsurePrimaryQueryTables
}

export type SessionInfoQueries = SessionInfoController

export function createSessionInfoQueries({
  conn,
  getDatasetTotalCount,
  getOverlayRevision,
  ensurePrimaryQueryTables,
}: SessionInfoQueriesArgs): SessionInfoQueries {
  // Dataset reads can stay on canonical attached views. Scoped/selection-heavy
  // queries promote into the shared interactive runtime once needed.
  const withInteractiveQueryTables = <T>(task: () => Promise<T>) =>
    ensurePrimaryQueryTables().then(task)
  const withCanonicalQueryTables = <T>(task: () => Promise<T>) => task()

  const facetDatasetCache = createBoundedCache<
    string,
    Promise<Record<string, GraphInfoFacetRow[]>>
  >()
  const histogramDatasetCache = createBoundedCache<
    string,
    Promise<Record<string, GraphInfoHistogramResult>>
  >()
  const numericStatsDatasetCache = createBoundedCache<
    string,
    Promise<Record<string, NumericStatsRow>>
  >()
  const summaryDatasetCache = createBoundedCache<string, Promise<GraphInfoSummary>>()
  const categoricalValueDatasetCache = createBoundedCache<string, Promise<string[]>>()
  const numericValueDatasetCache = createBoundedCache<string, Promise<number[]>>()

  const getCachedDatasetFacetSummaries = (args: {
    layer: Parameters<typeof queryFacetSummaries>[1]['layer']
    columns: string[]
    maxItems: number
  }) =>
    cachedQuery(
      facetDatasetCache,
      {
        layer: args.layer,
        columns: [...new Set(args.columns)].sort(),
        maxItems: args.maxItems,
        overlayRevision: getOverlayRevision(),
      },
      () =>
        withCanonicalQueryTables(async () => {
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
        }),
      {
        evictWhen: (result) =>
          !Object.values(result).some((rows) => rows.length > 0),
      },
    )

  const getCachedDatasetInfoSummary = (
    layer: Parameters<typeof queryInfoSummary>[1]['layer']
  ) =>
    cachedQuery(
      summaryDatasetCache,
      { layer, overlayRevision: getOverlayRevision() },
      () =>
        withCanonicalQueryTables(() =>
          queryInfoSummary(conn, { layer, scope: 'dataset', currentPointScopeSql: null })
        ),
    )

  const getCachedDatasetInfoHistograms = (args: {
    layer: Parameters<typeof queryInfoHistogramsBatch>[1]['layer']
    columns: string[]
    bins: number
    useQuantiles?: boolean
  }) =>
    cachedQuery(
      histogramDatasetCache,
      {
        layer: args.layer,
        columns: [...new Set(args.columns)].sort(),
        bins: args.bins,
        useQuantiles: args.useQuantiles === true,
        overlayRevision: getOverlayRevision(),
      },
      () =>
        withCanonicalQueryTables(() =>
          queryInfoHistogramsBatch(conn, {
            layer: args.layer,
            scope: 'dataset',
            columns: args.columns,
            bins: args.bins,
            useQuantiles: args.useQuantiles === true,
            currentPointScopeSql: null,
          })
        ),
      {
        evictWhen: (result) =>
          !Object.values(result).some((entry) => entry.totalCount > 0 || entry.bins.length > 0),
      },
    )

  const getCachedDatasetNumericStats = (args: {
    layer: Parameters<typeof queryNumericStatsBatch>[1]['layer']
    columns: string[]
  }) =>
    cachedQuery(
      numericStatsDatasetCache,
      {
        layer: args.layer,
        columns: [...new Set(args.columns)].sort(),
        overlayRevision: getOverlayRevision(),
      },
      () =>
        withCanonicalQueryTables(() =>
          queryNumericStatsBatch(conn, {
            layer: args.layer,
            scope: 'dataset',
            columns: args.columns,
            currentPointScopeSql: null,
          })
        ),
      { evictWhen: (result) => Object.keys(result).length === 0 },
    )

  const getCachedCategoricalValues = (args: {
    layer: Parameters<typeof queryCategoricalValues>[1]['layer']
    column: string
  }) =>
    cachedQuery(
      categoricalValueDatasetCache,
      { layer: args.layer, column: args.column, overlayRevision: getOverlayRevision() },
      () =>
        withCanonicalQueryTables(() =>
          queryCategoricalValues(conn, {
            layer: args.layer,
            scope: 'dataset',
            column: args.column,
            currentPointScopeSql: null,
          })
        ),
      { evictWhen: (values) => values.length === 0 },
    )

  const getCachedNumericValues = (args: {
    layer: Parameters<typeof queryNumericValues>[1]['layer']
    column: string
  }) =>
    cachedQuery(
      numericValueDatasetCache,
      { layer: args.layer, column: args.column, overlayRevision: getOverlayRevision() },
      () =>
        withCanonicalQueryTables(() =>
          queryNumericValues(conn, {
            layer: args.layer,
            scope: 'dataset',
            column: args.column,
            currentPointScopeSql: null,
          })
        ),
      { evictWhen: (values) => values.length === 0 },
    )

  return {
    reset() {
      facetDatasetCache.clear()
      histogramDatasetCache.clear()
      numericStatsDatasetCache.clear()
      summaryDatasetCache.clear()
      categoricalValueDatasetCache.clear()
      numericValueDatasetCache.clear()
    },
    getInfoSummary(args) {
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
        return getCachedDatasetInfoSummary(args.layer)
      }

      return withInteractiveQueryTables(() =>
        queryInfoSummary(conn, {
          ...args,
          datasetTotalCount: getDatasetTotalCount(args.layer),
        })
      )
    },
    getCategoricalValues(args) {
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
        return getCachedCategoricalValues({
          layer: args.layer,
          column: args.column,
        })
      }

      return withInteractiveQueryTables(() => queryCategoricalValues(conn, args))
    },
    getNumericValues(args) {
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
        return getCachedNumericValues({
          layer: args.layer,
          column: args.column,
        })
      }

      return withInteractiveQueryTables(() => queryNumericValues(conn, args))
    },
    getInfoBars(args) {
      const safeMaxItems = args.maxItems ?? 8
      const scopedScope: 'current' | 'selected' =
        args.scope === 'selected' ? 'selected' : 'current'
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
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
        return withInteractiveQueryTables(() =>
          getScopedFacetBarCounts(conn, {
            layer: args.layer,
            scope: scopedScope,
            columns: [args.column],
            maxItems: safeMaxItems,
            currentPointScopeSql: args.currentPointScopeSql,
          })
        ).then(
          (result: Record<string, Array<{ value: string; count: number }>>) =>
            result[args.column] ?? []
        )
      }

      return withInteractiveQueryTables(() =>
        queryInfoBars(conn, { ...args, maxItems: safeMaxItems })
      )
    },
    getInfoBarsBatch(args) {
      const safeMaxItems = args.maxItems ?? 8
      const scopedScope: 'current' | 'selected' =
        args.scope === 'selected' ? 'selected' : 'current'
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
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

      return withInteractiveQueryTables(() =>
        getScopedFacetBarCounts(conn, {
          layer: args.layer,
          scope: scopedScope,
          columns: args.columns,
          maxItems: safeMaxItems,
          currentPointScopeSql: args.currentPointScopeSql,
        })
      )
    },
    getInfoHistogram(args) {
      const safeBins = args.bins ?? 16
      const useQuantiles = args.useQuantiles === true

      if (
        !hasFiniteExtent(args.extent) &&
        (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql))
      ) {
        return getCachedDatasetInfoHistograms({
          layer: args.layer,
          columns: [args.column],
          bins: safeBins,
          useQuantiles,
        }).then((result) => result[args.column] ?? { bins: [], totalCount: 0 })
      }

      return withInteractiveQueryTables(() =>
        queryInfoHistogram(conn, { ...args, bins: safeBins })
      )
    },
    getInfoHistogramsBatch(args) {
      const safeBins = args.bins ?? 16
      const hasCustomExtentsByColumn = Object.values(
        args.extentsByColumn ?? {}
      ).some(hasFiniteExtent)
      const useQuantiles = args.useQuantiles === true

      if (
        !hasFiniteExtent(args.extent) &&
        !hasCustomExtentsByColumn &&
        (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql))
      ) {
        return getCachedDatasetInfoHistograms({
          layer: args.layer,
          columns: args.columns,
          bins: safeBins,
          useQuantiles,
        })
      }

      return withInteractiveQueryTables(() =>
        queryInfoHistogramsBatch(conn, { ...args, bins: safeBins })
      )
    },
    getNumericStatsBatch(args) {
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
        return getCachedDatasetNumericStats({
          layer: args.layer,
          columns: args.columns,
        })
      }

      return withInteractiveQueryTables(() => queryNumericStatsBatch(conn, args))
    },
    getFacetSummary(args) {
      const safeMaxItems = args.maxItems ?? 6
      const scopedScope: 'current' | 'selected' =
        args.scope === 'selected' ? 'selected' : 'current'
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
        return getCachedDatasetFacetSummaries({
          layer: args.layer,
          columns: [args.column],
          maxItems: safeMaxItems,
        }).then((result) => result[args.column] ?? [])
      }

      if (getColumnMetaForLayer(args.column, args.layer)?.isMultiValue) {
        return withInteractiveQueryTables(() =>
          queryFacetSummary(conn, {
            ...args,
            scope: scopedScope,
            maxItems: safeMaxItems,
          })
        )
      }

      const mergeDepth = Math.max(safeMaxItems, 24)
      return Promise.all([
        getCachedDatasetFacetSummaries({
          layer: args.layer,
          columns: [args.column],
          maxItems: mergeDepth,
        }),
        withInteractiveQueryTables(() =>
          getScopedFacetBarCounts(conn, {
            layer: args.layer,
            scope: scopedScope,
            columns: [args.column],
            maxItems: mergeDepth,
            currentPointScopeSql: args.currentPointScopeSql,
          })
        ),
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
      const scopedScope: 'current' | 'selected' =
        args.scope === 'selected' ? 'selected' : 'current'
      if (isEffectivelyDatasetScope(args.scope, args.currentPointScopeSql)) {
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
        withInteractiveQueryTables(() =>
          getScopedFacetBarCounts(conn, {
            layer: args.layer,
            scope: scopedScope,
            columns: args.columns,
            maxItems: mergeDepth,
            currentPointScopeSql: args.currentPointScopeSql,
          })
        ),
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
  }
}
