import type { GraphBundle } from '@/features/graph/types'

import { registerBundleTableFiles } from '../bundle-files'
import { getCanvasPointCounts, registerActiveCanvasAliasViews } from '../canvas'
import { createConnection, closeConnection } from '../connection'
import type { GraphBundleSession, ProgressCallback } from '../types'
import { getAutoloadBundleTables } from '../utils'
import {
  createEnsurePrimaryQueryTables,
  createEnsureOptionalBundleTables,
  initializeSelectedPointTable,
  registerInitialSessionViews,
} from '../views'
import { createSessionInfoQueries } from './info-queries'
import { createSessionOverlayController } from './overlay-controller'
import { createSessionQueryController } from './query-controller'
import type { SessionInfoController, SessionQueryController } from './session-types'

export async function createGraphBundleSession(
  bundle: GraphBundle,
  onProgress: ProgressCallback
): Promise<GraphBundleSession> {
  const { conn, db, worker } = await createConnection()
  const autoloadTables = getAutoloadBundleTables(bundle)
  let disposed = false

  try {
    onProgress(bundle.bundleChecksum, {
      stage: 'resolving',
      message: 'Opening DuckDB-Wasm and resolving the active graph bundle.',
      percent: 2,
    })

    onProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Registering canonical bundle tables and active views.',
      percent: 10,
    })

    await registerBundleTableFiles(db, bundle)
    const viewState = await registerInitialSessionViews(conn, bundle, autoloadTables)
    const { availableLayers, basePointCount } = viewState
    const ensureOptionalBundleTables = createEnsureOptionalBundleTables(conn, bundle, viewState)
    const ensurePrimaryQueryTables = createEnsurePrimaryQueryTables(
      conn,
      bundle,
      viewState
    )

    await initializeSelectedPointTable(conn)
    await registerActiveCanvasAliasViews(conn, {
      overlayRevision: 0,
      overlayCount: 0,
    })

    const initialPointCounts = getCanvasPointCounts(basePointCount, 0)

    onProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Canvas tables are ready. Graph rendering can begin immediately.',
      percent: 12,
      loadedRows: 0,
      totalRows: initialPointCounts.corpus,
    })

    let infoQueries: SessionInfoController | null = null
    let queryController: SessionQueryController | null = null

    const resetOverlayDependentCaches = () => {
      queryController?.resetOverlayDependentCaches()
      infoQueries?.reset()
    }

    const overlayController = createSessionOverlayController({
      conn,
      db,
      basePointCount,
      ensureOptionalBundleTables,
      initialPointCounts,
      resetOverlayDependentCaches,
    })

    queryController = createSessionQueryController({
      bundle,
      conn,
      ensureOptionalBundleTables,
    })
    infoQueries = createSessionInfoQueries({
      conn,
      getDatasetTotalCount: (layer) => overlayController.getCanvas().pointCounts[layer] ?? 0,
      getOverlayRevision: () => overlayController.getCanvas().overlayRevision,
      ensurePrimaryQueryTables,
    })

    return {
      availableLayers,
      get canvas() {
        return overlayController.getCanvas()
      },
      async dispose() {
        if (disposed) {
          return
        }
        disposed = true
        await closeConnection(conn, db, worker)
      },
      subscribeCanvas: overlayController.subscribeCanvas,
      setSelectedPointIndices: overlayController.setSelectedPointIndices,
      setSelectedPointScopeSql: overlayController.setSelectedPointScopeSql,
      getOverlayPointIds: overlayController.getOverlayPointIds,
      reconcileOverlayPointIds: overlayController.reconcileOverlayPointIds,
      setOverlayProducerPointIds: overlayController.setOverlayProducerPointIds,
      clearOverlayProducer: overlayController.clearOverlayProducer,
      setOverlayPointIds: overlayController.setOverlayPointIds,
      clearOverlay: overlayController.clearOverlay,
      activateOverlay: overlayController.activateOverlay,
      runReadOnlyQuery: queryController.runReadOnlyQuery,
      getPaperDocument: queryController.getPaperDocument,
      getSelectionScopeGraphPaperRefs: queryController.getSelectionScopeGraphPaperRefs,
      getPaperNodesByGraphPaperRefs: queryController.getPaperNodesByGraphPaperRefs,
      ensureGraphPaperRefsAvailable: queryController.ensureGraphPaperRefsAvailable,
      getUniversePointIdsByGraphPaperRefs: queryController.getUniversePointIdsByGraphPaperRefs,
      resolvePointSelection: queryController.resolvePointSelection,
      getTablePage: queryController.getTablePage,
      exportTableCsv: queryController.exportTableCsv,
      getInfoSummary: infoQueries.getInfoSummary,
      getCategoricalValues: infoQueries.getCategoricalValues,
      getNumericValues: infoQueries.getNumericValues,
      getInfoBars: infoQueries.getInfoBars,
      getInfoBarsBatch: infoQueries.getInfoBarsBatch,
      getInfoHistogram: infoQueries.getInfoHistogram,
      getInfoHistogramsBatch: infoQueries.getInfoHistogramsBatch,
      getNumericStatsBatch: infoQueries.getNumericStatsBatch,
      getFacetSummary: infoQueries.getFacetSummary,
      getFacetSummaries: infoQueries.getFacetSummaries,
      searchPoints: queryController.searchPoints,
      getVisibilityBudget: queryController.getVisibilityBudget,
      getScopeCoordinates: queryController.getScopeCoordinates,
      getClusterDetail: queryController.getClusterDetail,
      getSelectionDetail: queryController.getSelectionDetail,
    }
  } catch (error) {
    disposed = true
    await closeConnection(conn, db, worker)
    throw error
  }
}
