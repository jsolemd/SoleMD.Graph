import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import type { GraphInfoScope, MapLayer } from "@/features/graph/types";

import {
  buildScopedLayerPredicate,
  getColumnMetaForLayer,
  getLayerTableName,
  resolveInfoColumn,
} from "../sql-helpers";

import { queryRows } from "./core";

function getSafeScopedContext(args: {
  layer: MapLayer;
  scope: GraphInfoScope;
  currentPointScopeSql: string | null;
}) {
  const { layer, scope, currentPointScopeSql } = args;

  return {
    tableName: getLayerTableName(layer),
    scopedPredicate: buildScopedLayerPredicate(layer, scope, currentPointScopeSql),
  };
}

export async function queryCategoricalValues(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer;
    scope: GraphInfoScope;
    column: string;
    currentPointScopeSql: string | null;
  },
): Promise<string[]> {
  const { layer, scope, column, currentPointScopeSql } = args;
  const columnMeta = getColumnMetaForLayer(column, layer)
  if (columnMeta?.type !== "categorical") {
    return [];
  }

  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  });
  const safeColumn = resolveInfoColumn(layer, column);
  const valueExpr = columnMeta.isMultiValue
    ? "TRIM(CAST(split_value AS VARCHAR))"
    : `CAST(${safeColumn} AS VARCHAR)`
  const fromExpr = columnMeta.isMultiValue
    ? `${tableName}, UNNEST(string_split_regex(CAST(${safeColumn} AS VARCHAR), '\\s*,\\s*')) AS split(split_value)`
    : tableName
  const rows = await queryRows<{ value: string | null }>(
    conn,
    `SELECT ${valueExpr} AS value
     FROM ${fromExpr}
     WHERE ${scopedPredicate}
       AND ${safeColumn} IS NOT NULL
       AND CAST(${safeColumn} AS VARCHAR) <> ''
       AND ${valueExpr} <> ''`,
  );

  return rows
    .map((row) => row.value)
    .filter((value): value is string => typeof value === "string");
}

export async function queryNumericValues(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer;
    scope: GraphInfoScope;
    column: string;
    currentPointScopeSql: string | null;
  },
): Promise<number[]> {
  const { layer, scope, column, currentPointScopeSql } = args;
  if (getColumnMetaForLayer(column, layer)?.type !== "numeric") {
    return [];
  }

  const { tableName, scopedPredicate } = getSafeScopedContext({
    layer,
    scope,
    currentPointScopeSql,
  });
  const safeColumn = resolveInfoColumn(layer, column);
  const rows = await queryRows<{ value: number | null }>(
    conn,
    `SELECT CAST(${safeColumn} AS DOUBLE) AS value
     FROM ${tableName}
     WHERE ${scopedPredicate}
       AND ${safeColumn} IS NOT NULL`,
  );

  return rows
    .map((row) => row.value)
    .filter((value): value is number => Number.isFinite(value));
}
