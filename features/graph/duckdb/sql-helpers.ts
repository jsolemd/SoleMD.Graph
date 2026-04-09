import { getColumnMetaForLayer, getColumnsForLayer } from '@/features/graph/lib/columns'
import { getLayerConfig } from '@/features/graph/lib/layers'
import type { GraphInfoScope, MapLayer } from '@/features/graph/types'

import { validateTableName } from './utils'

export function buildSelectedViewPredicate(): string {
  return 'index IN (SELECT index FROM selected_point_indices)'
}

export function buildCurrentViewPredicate(args: {
  currentPointScopeSql: string | null
}): string {
  const { currentPointScopeSql } = args
  if (currentPointScopeSql && currentPointScopeSql.trim().length > 0) {
    return currentPointScopeSql
  }

  return 'TRUE'
}

export function getLayerTableName(layer: MapLayer): string {
  void layer
  return 'current_points_web'
}

export function getLayerCanvasTableName(layer: MapLayer): string {
  void layer
  return 'current_points_canvas_web'
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
  void layer
  return "COALESCE(NULLIF(clusterLabel, ''), NULLIF(paperTitle, ''), NULLIF(citekey, ''), id)"
}

export function buildScopedLayerPredicate(
  layer: MapLayer,
  scope: GraphInfoScope,
  currentPointScopeSql: string | null
): string {
  void layer
  if (scope === 'selected') {
    return buildSelectedViewPredicate()
  }

  if (scope === 'current') {
    if (currentPointScopeSql && currentPointScopeSql.trim().length > 0) {
      return currentPointScopeSql
    }
  }

  return 'TRUE'
}

export function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''")
}

export function getSafeScopedContext(args: {
  layer: MapLayer
  scope: GraphInfoScope
  currentPointScopeSql: string | null
}) {
  const { layer, scope, currentPointScopeSql } = args
  return {
    tableName: getLayerTableName(layer),
    scopedPredicate: buildScopedLayerPredicate(layer, scope, currentPointScopeSql),
  }
}

export { getColumnMetaForLayer }
