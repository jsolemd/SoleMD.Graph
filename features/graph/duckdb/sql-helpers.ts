import { getColumnMetaForLayer, getColumnsForLayer } from '@/features/graph/lib/columns'
import { getLayerConfig } from '@/features/graph/lib/layers'
import type { GraphInfoScope, MapLayer } from '@/features/graph/types'

import { validateTableName } from './utils'

export function sliceScopeIndices(args: {
  view: 'current' | 'selected'
  page: number
  pageSize: number
  currentPointIndices: number[] | null
  selectedPointIndices: number[]
}) {
  const { view, page, pageSize, currentPointIndices, selectedPointIndices } = args
  const sourceIndices =
    view === 'selected'
      ? selectedPointIndices
      : currentPointIndices

  if (sourceIndices == null) {
    return {
      totalRows: null as number | null,
      pageIndices: null as number[] | null,
    }
  }

  const totalRows = sourceIndices.length
  const start = Math.max(0, (Math.max(page, 1) - 1) * Math.max(pageSize, 1))
  const end = Math.min(totalRows, start + Math.max(pageSize, 1))

  return {
    totalRows,
    pageIndices: sourceIndices.slice(start, end),
  }
}

export function buildIndexWhereClause(indices: number[]): string {
  if (indices.length === 0) {
    return '1 = 0'
  }

  return `index IN (${indices.map((value) => Number(value) || 0).join(', ')})`
}

export function buildCurrentViewPredicate(args: {
  currentPointIndices: number[] | null
  currentPointScopeSql: string | null
}): string {
  const { currentPointIndices, currentPointScopeSql } = args
  if (currentPointScopeSql && currentPointScopeSql.trim().length > 0) {
    return currentPointScopeSql
  }

  if (currentPointIndices !== null) {
    return buildIndexWhereClause(currentPointIndices)
  }

  return 'TRUE'
}

export function getLayerTableName(layer: MapLayer): string {
  if (layer === 'paper') {
    return 'active_paper_points_web'
  }
  if (layer === 'geo') {
    return 'geo_points_web'
  }
  return 'active_points_web'
}

export function resolveInfoColumn(layer: MapLayer, column: string): string {
  if (!getColumnsForLayer(layer).some((meta) => meta.key === column)) {
    throw new Error(`Unsupported info column "${column}" for ${layer} layer`)
  }

  const safe = validateTableName(column)
  return safe
}

export function resolveSearchColumn(layer: MapLayer, column: string): string {
  if (!(column in getLayerConfig(layer).searchableFields)) {
    throw new Error(`Unsupported search column "${column}" for ${layer} layer`)
  }

  return validateTableName(column)
}

export function getSearchLabelExpression(layer: MapLayer): string {
  if (layer === 'paper') {
    return "COALESCE(NULLIF(paperTitle, ''), NULLIF(citekey, ''), NULLIF(clusterLabel, ''), id)"
  }
  if (layer === 'geo') {
    return "COALESCE(NULLIF(institution, ''), NULLIF(country, ''), NULLIF(city, ''), id)"
  }
  return "COALESCE(NULLIF(clusterLabel, ''), NULLIF(paperTitle, ''), NULLIF(citekey, ''), id)"
}

export function buildScopedLayerPredicate(
  layer: MapLayer,
  scope: GraphInfoScope,
  currentPointIndices: number[] | null,
  currentPointScopeSql: string | null,
  selectedPointIndices: number[]
): string {
  void layer
  if (scope === 'selected') {
    return buildIndexWhereClause(selectedPointIndices)
  }

  if (scope === 'current') {
    if (currentPointScopeSql && currentPointScopeSql.trim().length > 0) {
      return currentPointScopeSql
    }

    if (currentPointIndices !== null) {
      return buildIndexWhereClause(currentPointIndices)
    }
  }

  return 'TRUE'
}

export { getColumnMetaForLayer }
