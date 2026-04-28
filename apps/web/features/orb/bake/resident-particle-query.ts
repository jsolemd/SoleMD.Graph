"use client";

import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { queryRows } from "@/features/graph/duckdb/queries/core";

/**
 * Uncapped query path for resident-orb visual pipelines.
 *
 * `GraphBundleQueries.runReadOnlyQuery()` intentionally limits SELECTs
 * for the SQL explorer / user-authored read-only surface. Resident
 * texture writers need one row per rendered paper particle, so they
 * must query the active DuckDB connection directly while still using
 * the graph runtime's serialized `queryRows` helper.
 */
export function queryResidentParticleRows<T>(
  connection: AsyncDuckDBConnection,
  sql: string,
): Promise<T[]> {
  return queryRows<T>(connection, sql);
}
