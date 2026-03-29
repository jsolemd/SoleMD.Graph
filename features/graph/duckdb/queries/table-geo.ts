import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { buildGeoNodes, type GeoPointRow } from '@/features/graph/lib/transform'

import {
  buildCurrentViewPredicate,
  buildIndexWhereClause,
  sliceScopeIndices,
} from '../sql-helpers'

import { queryRows } from './core'

export async function queryGeoTablePage(
  conn: AsyncDuckDBConnection,
  args: {
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
) {
  const { page, pageSize, view, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const scoped = view === 'selected'
    ? sliceScopeIndices({
        view,
        page,
        pageSize,
        currentPointIndices,
        selectedPointIndices,
      })
    : null
  const currentPredicate = buildCurrentViewPredicate({
    currentPointIndices,
    currentPointScopeSql,
  })
  const totalRows =
    view === 'selected'
      ? (scoped?.totalRows ?? 0)
      : (
          await queryRows<{ count: number }>(
            conn,
            `SELECT count(*)::INTEGER AS count
             FROM geo_points_web
             WHERE ${currentPredicate}`
          )
        )[0]?.count ??
        0

  if (totalRows === 0) {
    return { totalRows: 0, page, pageSize, rows: [] }
  }

  const rows = await queryRows<GeoPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      hexColor AS color_hex,
      sizeValue AS size_value,
      institution,
      rorId AS ror_id,
      city,
      region,
      country,
      countryCode AS country_code,
      paperCount AS paper_count,
      authorCount AS author_count,
      firstYear AS first_year,
      lastYear AS last_year
    FROM geo_points_web
    WHERE ${
      scoped?.pageIndices
        ? buildIndexWhereClause(scoped.pageIndices)
        : currentPredicate
    }
    ORDER by index${
      scoped?.pageIndices ? '' : '\n    LIMIT ? OFFSET ?'
    }`,
    scoped?.pageIndices ? [] : [pageSize, (Math.max(page, 1) - 1) * Math.max(pageSize, 1)]
  )

  return {
    totalRows,
    page,
    pageSize,
    rows: buildGeoNodes(rows),
  }
}
