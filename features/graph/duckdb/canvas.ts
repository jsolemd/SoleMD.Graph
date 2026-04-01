import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { MapLayer } from '@/features/graph/types'

import type { GraphCanvasSource } from './types'

const ACTIVE_CANVAS_VIEW_SLOTS = ['a', 'b'] as const

export function getActiveCanvasViewNames(overlayRevision: number) {
  const slot = ACTIVE_CANVAS_VIEW_SLOTS[overlayRevision % ACTIVE_CANVAS_VIEW_SLOTS.length]
  return {
    corpusPoints: `active_points_${slot}_web`,
    corpusLinks: `active_links_${slot}_web`,
  }
}

export function getCanvasPointCounts(
  basePointCount: number,
  overlayCount: number
): Record<MapLayer, number> {
  return {
    corpus: Math.max(0, basePointCount + overlayCount),
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
  return {
    duckDBConnection: {
      duckdb: db,
      connection: conn,
    },
    pointCounts,
    overlayCount,
    overlayRevision,
  }
}
