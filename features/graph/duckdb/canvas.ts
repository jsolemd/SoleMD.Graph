import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { MapLayer } from '@/features/graph/types'

import { queryRows } from './queries'
import type { GraphCanvasSource } from './types'

const ACTIVE_CANVAS_VIEW_SLOTS = ['a', 'b'] as const

export function getActiveCanvasViewNames(overlayRevision: number) {
  const slot = ACTIVE_CANVAS_VIEW_SLOTS[overlayRevision % ACTIVE_CANVAS_VIEW_SLOTS.length]
  return {
    chunkPoints: `active_points_${slot}_web`,
    chunkLinks: `active_links_${slot}_web`,
    paperPoints: `active_paper_points_${slot}_web`,
    paperLinks: `active_paper_links_${slot}_web`,
  }
}

export async function registerActiveCanvasAliasViews(
  conn: AsyncDuckDBConnection,
  overlayRevision: number
) {
  const viewNames = getActiveCanvasViewNames(overlayRevision)
  await conn.query(
    `CREATE OR REPLACE VIEW ${viewNames.chunkPoints} AS
     SELECT * FROM active_points_web`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW ${viewNames.chunkLinks} AS
     SELECT * FROM active_links_web`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW ${viewNames.paperPoints} AS
     SELECT * FROM active_paper_points_web`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW ${viewNames.paperLinks} AS
     SELECT * FROM active_paper_links_web`
  )
}

export function buildCanvasSource(args: {
  conn: AsyncDuckDBConnection
  db: import('@duckdb/duckdb-wasm').AsyncDuckDB
  pointCounts: Record<MapLayer, number>
  overlayCount: number
  overlayRevision: number
}): GraphCanvasSource {
  const { conn, db, pointCounts, overlayCount, overlayRevision } = args
  const viewNames = getActiveCanvasViewNames(overlayRevision)
  return {
    duckDBConnection: {
      duckdb: db,
      connection: conn,
    },
    layerTables: {
      chunk: {
        points: viewNames.chunkPoints,
        links: viewNames.chunkLinks,
      },
      paper: {
        points: viewNames.paperPoints,
        links: viewNames.paperLinks,
      },
      geo: {
        points: 'geo_points_web',
        links: 'geo_links_web',
      },
    },
    pointCounts,
    overlayCount,
    overlayRevision,
  }
}

export async function queryCanvasPointCounts(
  conn: AsyncDuckDBConnection,
  geoPointCount: number
): Promise<Record<MapLayer, number>> {
  const rows = await queryRows<{
    chunkCount: number
    paperCount: number
  }>(
    conn,
    `SELECT
       (SELECT count(*)::INTEGER FROM active_points_web) AS chunkCount,
       (SELECT count(*)::INTEGER FROM active_paper_points_web) AS paperCount`
  )

  return {
    chunk: rows[0]?.chunkCount ?? 0,
    paper: rows[0]?.paperCount ?? 0,
    geo: geoPointCount,
  }
}
