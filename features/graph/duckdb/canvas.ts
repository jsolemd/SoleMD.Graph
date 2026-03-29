import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { MapLayer } from '@/features/graph/types'

import { queryRows } from './queries'
import type { GraphCanvasSource } from './types'

const ACTIVE_CANVAS_VIEW_SLOTS = ['a', 'b'] as const

export function getActiveCanvasViewNames(overlayRevision: number) {
  const slot = ACTIVE_CANVAS_VIEW_SLOTS[overlayRevision % ACTIVE_CANVAS_VIEW_SLOTS.length]
  return {
    corpusPoints: `active_points_${slot}_web`,
    corpusLinks: `active_links_${slot}_web`,
  }
}

export async function registerActiveCanvasAliasViews(
  conn: AsyncDuckDBConnection,
  args: {
    overlayRevision: number
    overlayCount: number
  }
) {
  const { overlayRevision, overlayCount } = args
  const viewNames = getActiveCanvasViewNames(overlayRevision)
  const hasOverlay = overlayCount > 0
  await conn.query(
    `CREATE OR REPLACE VIEW ${viewNames.corpusPoints} AS
     SELECT * FROM ${hasOverlay ? 'active_points_canvas_web' : 'base_points_canvas_web'}`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW ${viewNames.corpusLinks} AS
     SELECT * FROM ${hasOverlay ? 'active_links_web' : 'base_links_web'}`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW current_points_canvas_web AS
     SELECT * FROM ${viewNames.corpusPoints}`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW current_points_web AS
     SELECT * FROM ${hasOverlay ? 'active_points_web' : 'base_points_web'}`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW current_paper_points_web AS
     SELECT
       index,
       current_points_web.* EXCLUDE (index),
       index AS paperIndex
     FROM current_points_web`
  )
  await conn.query(
    `CREATE OR REPLACE VIEW current_links_web AS
     SELECT * FROM ${viewNames.corpusLinks}`
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
      corpus: {
        points: viewNames.corpusPoints,
        links: viewNames.corpusLinks,
      },
    },
    pointCounts,
    overlayCount,
    overlayRevision,
  }
}

export async function queryCanvasPointCounts(
  conn: AsyncDuckDBConnection
): Promise<Record<MapLayer, number>> {
  const rows = await queryRows<{
    corpusCount: number
  }>(
    conn,
    `SELECT
       (
         (SELECT count(*)::INTEGER FROM base_points_canvas_web) +
         (SELECT count(*)::INTEGER FROM overlay_points_canvas_web)
       ) AS corpusCount`
  )

  return {
    corpus: rows[0]?.corpusCount ?? 0,
  }
}
