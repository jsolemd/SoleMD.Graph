import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from "@solemd/graph"

import type { GraphBundleSession, GraphCanvasSource } from '../types'

export type EnsureOptionalBundleTables = (tableNames: string[]) => Promise<void>

export interface SessionOverlayController
  extends Pick<
    GraphBundleSession,
    | 'subscribeCanvas'
    | 'setSelectedPointIndices'
    | 'setSelectedPointScopeSql'
    | 'getOverlayPointIds'
    | 'reconcileOverlayPointIds'
    | 'setOverlayProducerPointIds'
    | 'clearOverlayProducer'
    | 'setOverlayPointIds'
    | 'clearOverlay'
    | 'activateOverlay'
  > {
  getCanvas: () => GraphCanvasSource
}

export interface SessionInfoController
  extends Pick<
    GraphBundleSession,
    | 'getInfoSummary'
    | 'getInfoBars'
    | 'getInfoBarsBatch'
    | 'getInfoHistogram'
    | 'getInfoHistogramsBatch'
    | 'getNumericStatsBatch'
    | 'getFacetSummary'
    | 'getFacetSummaries'
  > {
  reset: () => void
}

export interface SessionQueryController
  extends Pick<
    GraphBundleSession,
    | 'runReadOnlyQuery'
    | 'getPaperDocument'
    | 'getSelectionScopeGraphPaperRefs'
    | 'getPaperNodesByGraphPaperRefs'
    | 'ensureGraphPaperRefsAvailable'
    | 'getUniversePointIdsByGraphPaperRefs'
    | 'resolvePointSelection'
    | 'getTablePage'
    | 'exportTableCsv'
    | 'searchPoints'
    | 'getVisibilityBudget'
    | 'getScopeCoordinates'
    | 'getClusterDetail'
    | 'getSelectionDetail'
  > {
  resetOverlayDependentCaches: () => void
}

export interface CreateSessionOverlayControllerArgs {
  basePointCount: number
  conn: AsyncDuckDBConnection
  db: AsyncDuckDB
  ensureOptionalBundleTables: EnsureOptionalBundleTables
  initialPointCounts: GraphCanvasSource['pointCounts']
  resetOverlayDependentCaches: () => void
}

export interface CreateSessionQueryControllerArgs {
  bundle: GraphBundle
  conn: AsyncDuckDBConnection
  ensureOptionalBundleTables: EnsureOptionalBundleTables
}
