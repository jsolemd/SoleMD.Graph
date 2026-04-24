import { getColumnMetaForLayer, getColumnsForLayer } from '@/features/graph/lib/columns'
import { getLayerConfig } from '@/features/graph/lib/layers'
import {
  hasCurrentPointScopeSql,
  normalizeCurrentPointScopeSql,
} from '@/features/graph/lib/selection-query-state'
import type { GraphInfoScope, GraphLayer } from "@solemd/graph"

import { validateTableName } from './utils'

export function buildSelectedViewPredicate(): string {
  return 'index IN (SELECT index FROM selected_point_indices)'
}

export function buildCurrentViewPredicate(args: {
  currentPointScopeSql: string | null
}): string {
  // INVARIANT: currentPointScopeSql must be produced by
  // buildCurrentPointScopeSql (Mosaic duckDBCodeGenerator output over
  // configured columns + literal()-wrapped values), never raw user input.
  const { currentPointScopeSql } = args
  if (hasCurrentPointScopeSql(currentPointScopeSql)) {
    return normalizeCurrentPointScopeSql(currentPointScopeSql) ?? 'TRUE'
  }

  return 'TRUE'
}

export function getLayerTableName(layer: GraphLayer): string {
  void layer
  return 'current_points_web'
}

export function getLayerCanvasTableName(layer: GraphLayer): string {
  void layer
  return 'current_points_canvas_web'
}

export function resolveInfoColumn(layer: GraphLayer, column: string): string {
  if (!getColumnsForLayer(layer).some((meta) => meta.key === column)) {
    throw new Error(`Unsupported info column "${column}" for ${layer} layer`)
  }

  const safe = validateTableName(column)
  return safe
}

export function resolveSearchColumn(layer: GraphLayer, column: string): string {
  if (!(column in getLayerConfig(layer).searchableFields)) {
    throw new Error(`Unsupported search column "${column}" for ${layer} layer`)
  }

  return validateTableName(column)
}

export function getSearchLabelExpression(layer: GraphLayer): string {
  void layer
  return "COALESCE(NULLIF(clusterLabel, ''), NULLIF(paperTitle, ''), NULLIF(citekey, ''), id)"
}

export function buildScopedLayerPredicate(
  layer: GraphLayer,
  scope: GraphInfoScope,
  currentPointScopeSql: string | null
): string {
  // INVARIANT: currentPointScopeSql must be a Mosaic-rendered SQL fragment
  // (see buildCurrentPointScopeSql). Never pass raw user input.
  void layer
  if (scope === 'selected') {
    return buildSelectedViewPredicate()
  }

  if (scope === 'current') {
    if (hasCurrentPointScopeSql(currentPointScopeSql)) {
      return normalizeCurrentPointScopeSql(currentPointScopeSql) ?? 'TRUE'
    }
  }

  return 'TRUE'
}

export function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''")
}

export function getSafeScopedContext(args: {
  layer: GraphLayer
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
