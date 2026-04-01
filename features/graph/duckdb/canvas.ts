import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { MapLayer } from '@/features/graph/types'

import type { GraphCanvasSource } from './types'

const ACTIVE_CANVAS_VIEW_SLOTS = ['a', 'b'] as const
const canvasAliasStateByConnection = new WeakMap<AsyncDuckDBConnection, CanvasAliasState>()

interface CanvasAliasState {
  linkTargetsByViewName: Partial<Record<string, string>>
  pointTargetsByViewName: Partial<Record<string, string>>
  currentPointsTarget: string | null
  hasCurrentPaperPointsView: boolean
}

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

function getCanvasAliasState(conn: AsyncDuckDBConnection): CanvasAliasState {
  let state = canvasAliasStateByConnection.get(conn)
  if (!state) {
    state = {
      linkTargetsByViewName: {},
      pointTargetsByViewName: {},
      currentPointsTarget: null,
      hasCurrentPaperPointsView: false,
    }
    canvasAliasStateByConnection.set(conn, state)
  }
  return state
}

async function ensureAliasView(
  conn: AsyncDuckDBConnection,
  targetsByViewName: Partial<Record<string, string>>,
  viewName: string,
  targetViewName: string
) {
  if (targetsByViewName[viewName] === targetViewName) {
    return
  }

  await conn.query(
    `CREATE OR REPLACE VIEW ${viewName} AS
     SELECT * FROM ${targetViewName}`
  )
  targetsByViewName[viewName] = targetViewName
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
  const state = getCanvasAliasState(conn)
  const currentPointsTarget = hasOverlay ? 'active_points_web' : 'base_points_web'

  await ensureAliasView(
    conn,
    state.pointTargetsByViewName,
    viewNames.corpusPoints,
    hasOverlay ? 'active_points_canvas_web' : 'base_points_canvas_web'
  )
  await ensureAliasView(
    conn,
    state.linkTargetsByViewName,
    viewNames.corpusLinks,
    hasOverlay ? 'active_links_web' : 'base_links_web'
  )
  await conn.query(
    `CREATE OR REPLACE VIEW current_points_canvas_web AS
     SELECT * FROM ${viewNames.corpusPoints}`
  )
  if (state.currentPointsTarget !== currentPointsTarget) {
    await conn.query(
      `CREATE OR REPLACE VIEW current_points_web AS
       SELECT * FROM ${currentPointsTarget}`
    )
    state.currentPointsTarget = currentPointsTarget
  }
  if (!state.hasCurrentPaperPointsView) {
    await conn.query(
      `CREATE OR REPLACE VIEW current_paper_points_web AS
       SELECT
         index,
         current_points_web.* EXCLUDE (index),
         index AS paperIndex
       FROM current_points_web`
    )
    state.hasCurrentPaperPointsView = true
  }
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
