import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type {
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoSummary,
} from '@/features/graph/types'

import type { GraphBundleSession } from '../types'
import { createBoundedCache } from '../utils'
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
  hasCurrentScopeSql,
  hasFiniteExtent,
  mapBarsToFacetRows,
  mergeFacetSummaryRows,
  partitionFacetColumns,
} from './info-query-helpers'

interface SessionInfoQueriesArgs {
  conn: AsyncDuckDBConnection
  getDatasetTotalCount: (layer: Parameters<typeof queryInfoSummary>[1]['layer']) => number
  getOverlayRevision: () => number
}

export interface SessionInfoQueries {
  reset: () => void
  getCategoricalValues: GraphBundleSession['getCategoricalValues']
  getFacetSummaries: GraphBundleSession['getFacetSummaries']
  getFacetSummary: GraphBundleSession['getFacetSummary']
  getInfoBars: GraphBundleSession['getInfoBars']
  getInfoBarsBatch: GraphBundleSession['getInfoBarsBatch']
  getInfoHistogram: GraphBundleSession['getInfoHistogram']
  getInfoHistogramsBatch: GraphBundleSession['getInfoHistogramsBatch']
  getInfoSummary: GraphBundleSession['getInfoSummary']
  getNumericStatsBatch: GraphBundleSession['getNumericStatsBatch']
  getNumericValues: GraphBundleSession['getNumericValues']
}

export function createSessionInfoQueries({
  conn,
  getDatasetTotalCount,
  getOverlayRevision,
}: SessionInfoQueriesArgs): SessionInfoQueries {
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
  }) => {
    const cacheKey = JSON.stringify({
      layer: args.layer,
      columns: [...new Set(args.columns)].sort(),
      maxItems: args.maxItems,
      overlayRevision: getOverlayRevision(),
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

  const getCachedDatasetInfoSummary = (
    layer: Parameters<typeof queryInfoSummary>[1]['layer']
  ) => {
    const cacheKey = JSON.stringify({
      layer,
      overlayRevision: getOverlayRevision(),
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
      overlayRevision: getOverlayRevision(),
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

  const getCachedDatasetNumericStats = (args: {
    layer: Parameters<typeof queryNumericStatsBatch>[1]['layer']
    columns: string[]
  }) => {
    const sortedColumns = [...new Set(args.columns)].sort()
    const cacheKey = JSON.stringify({
      layer: args.layer,
      columns: sortedColumns,
      overlayRevision: getOverlayRevision(),
    })
    const cached = numericStatsDatasetCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const next = queryNumericStatsBatch(conn, {
      layer: args.layer,
      scope: 'dataset',
      columns: args.columns,
      currentPointScopeSql: null,
    }).then((result) => {
      if (Object.keys(result).length === 0) {
        numericStatsDatasetCache.delete(cacheKey)
      }
      return result
    }).catch((error) => {
      numericStatsDatasetCache.delete(cacheKey)
      throw error
    })
    numericStatsDatasetCache.set(cacheKey, next)
    return next
  }

  const getCachedCategoricalValues = (args: {
    layer: Parameters<typeof queryCategoricalValues>[1]['layer']
    column: string
  }) => {
    const cacheKey = JSON.stringify({
      layer: args.layer,
      column: args.column,
      overlayRevision: getOverlayRevision(),
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
      overlayRevision: getOverlayRevision(),
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
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
        return getCachedDatasetInfoSummary(args.layer)
      }

      return queryInfoSummary(conn, {
        ...args,
        datasetTotalCount: getDatasetTotalCount(args.layer),
      })
    },
    getCategoricalValues(args) {
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
        return getCachedCategoricalValues({
          layer: args.layer,
          column: args.column,
        })
      }

      return queryCategoricalValues(conn, args)
    },
    getNumericValues(args) {
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
        return getCachedNumericValues({
          layer: args.layer,
          column: args.column,
        })
      }

      return queryNumericValues(conn, args)
    },
    getInfoBars(args) {
      const safeMaxItems = args.maxItems ?? 8
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
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
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
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
      const useQuantiles = args.useQuantiles === true

      if (
        !hasFiniteExtent(args.extent) &&
        (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql)))
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
      const hasCustomExtentsByColumn = Object.values(
        args.extentsByColumn ?? {}
      ).some(hasFiniteExtent)
      const useQuantiles = args.useQuantiles === true

      if (
        !hasFiniteExtent(args.extent) &&
        !hasCustomExtentsByColumn &&
        (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql)))
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
    getNumericStatsBatch(args) {
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
        return getCachedDatasetNumericStats({
          layer: args.layer,
          columns: args.columns,
        })
      }

      return queryNumericStatsBatch(conn, args)
    },
    getFacetSummary(args) {
      const safeMaxItems = args.maxItems ?? 6
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
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
      if (args.scope === 'dataset' || (args.scope === 'current' && !hasCurrentScopeSql(args.currentPointScopeSql))) {
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
  }
}
