'use client'

import { useEffect, useRef, useState } from 'react'
import {
  invalidateGraphBundleSessionCache,
  loadGraphBundle,
  registerGraphPaperAttachmentProvider,
  subscribeToGraphBundleProgress,
} from '@/features/graph/duckdb'
import { remoteGraphPaperAttachmentProvider } from '@/features/graph/duckdb/remote-attachment'
import type { GraphCanvasSource } from '@/features/graph/duckdb'
import { useDashboardStore } from '@/features/graph/stores'
import type {
  GraphBundle,
  GraphBundleLoadProgress,
  GraphBundleQueries,
} from '@/features/graph/types'

interface ResolvedGraphBundleState {
  bundleChecksum: string | null
  canvas: GraphCanvasSource | null
  error: Error | null
  progress: GraphBundleLoadProgress | null
  queries: GraphBundleQueries | null
}

interface GraphBundleState {
  canvas: GraphCanvasSource | null
  error: Error | null
  loading: boolean
  progress: GraphBundleLoadProgress | null
  queries: GraphBundleQueries | null
}

export function useGraphBundle(bundle: GraphBundle): GraphBundleState {
  const activeBundleChecksumRef = useRef<string | null>(null)
  const sessionBundleRef = useRef(bundle)
  if (sessionBundleRef.current.bundleChecksum !== bundle.bundleChecksum) {
    sessionBundleRef.current = bundle
  }
  const sessionBundle = sessionBundleRef.current
  const [state, setState] = useState<ResolvedGraphBundleState>({
      bundleChecksum: null,
      canvas: null,
      error: null,
      progress: null,
      queries: null,
    })

  useEffect(() => {
    registerGraphPaperAttachmentProvider(remoteGraphPaperAttachmentProvider)
    return () => {
      registerGraphPaperAttachmentProvider(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsubscribeCanvas = () => {}
    const previousBundleChecksum = activeBundleChecksumRef.current

    if (
      process.env.NODE_ENV !== 'production' &&
      previousBundleChecksum &&
      previousBundleChecksum !== sessionBundle.bundleChecksum
    ) {
      // Clear canvas/queries BEFORE disposing the old session so Cosmograph
      // unmounts (via the `canvas && queries` guard) before the worker is
      // terminated.  Without this, Cosmograph sends queries to a dead worker
      // and logs "cannot send a message since the worker is not set!".
      setState({
        bundleChecksum: sessionBundle.bundleChecksum,
        canvas: null,
        error: null,
        progress: null,
        queries: null,
      })
      invalidateGraphBundleSessionCache(previousBundleChecksum)
    }
    activeBundleChecksumRef.current = sessionBundle.bundleChecksum
    const unsubscribeProgress = subscribeToGraphBundleProgress(
      sessionBundle.bundleChecksum,
      (progress) => {
        if (cancelled) {
          return
        }

        setState((current) => ({
          ...current,
          bundleChecksum: sessionBundle.bundleChecksum,
          progress,
        }))
      }
    )

    loadGraphBundle(sessionBundle)
      .then((session) => {
        if (cancelled) {
          return
        }

        unsubscribeCanvas = session.subscribeCanvas((nextCanvas) => {
          if (cancelled) {
            return
          }

          setState((current) => ({
            ...current,
            bundleChecksum: sessionBundle.bundleChecksum,
            canvas: nextCanvas,
          }))
        })

        useDashboardStore.getState().setAvailableLayers(session.availableLayers)

        const queries: GraphBundleQueries = {
          setSelectedPointIndices: session.setSelectedPointIndices,
          setSelectedPointScopeSql: session.setSelectedPointScopeSql,
          getOverlayPointIds: session.getOverlayPointIds,
          setOverlayProducerPointIds: session.setOverlayProducerPointIds,
          clearOverlayProducer: session.clearOverlayProducer,
          setOverlayPointIds: session.setOverlayPointIds,
          clearOverlay: session.clearOverlay,
          activateOverlay: session.activateOverlay,
          getClusterDetail: session.getClusterDetail,
          getInfoSummary: session.getInfoSummary,
          getCategoricalValues: session.getCategoricalValues,
          getNumericValues: session.getNumericValues,
          getInfoBars: session.getInfoBars,
          getInfoBarsBatch: session.getInfoBarsBatch,
          getInfoHistogram: session.getInfoHistogram,
          getInfoHistogramsBatch: session.getInfoHistogramsBatch,
          getNumericStatsBatch: session.getNumericStatsBatch,
          getFacetSummary: session.getFacetSummary,
          getFacetSummaries: session.getFacetSummaries,
          searchPoints: session.searchPoints,
          getVisibilityBudget: session.getVisibilityBudget,
          getScopeCoordinates: session.getScopeCoordinates,
          getSelectionDetail: session.getSelectionDetail,
          getPaperDocument: session.getPaperDocument,
          getSelectionScopeGraphPaperRefs: session.getSelectionScopeGraphPaperRefs,
          getPaperNodesByGraphPaperRefs: session.getPaperNodesByGraphPaperRefs,
          ensureGraphPaperRefsAvailable:
            session.ensureGraphPaperRefsAvailable,
          getUniversePointIdsByGraphPaperRefs:
            session.getUniversePointIdsByGraphPaperRefs,
          resolvePointSelection: session.resolvePointSelection,
          getTablePage: session.getTablePage,
          runReadOnlyQuery: session.runReadOnlyQuery,
          exportTableCsv: session.exportTableCsv,
        }

        setState((current) => ({
          ...current,
          bundleChecksum: sessionBundle.bundleChecksum,
          canvas: session.canvas,
          queries,
          error: null,
        }))
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setState({
          bundleChecksum: sessionBundle.bundleChecksum,
          canvas: null,
          error: error instanceof Error ? error : new Error('Failed to load graph bundle'),
          progress: null,
          queries: null,
        })
      })

    return () => {
      cancelled = true
      unsubscribeCanvas()
      unsubscribeProgress()
    }
  }, [sessionBundle])

  const isResolvedBundle = state.bundleChecksum === sessionBundle.bundleChecksum
  const isCanvasReady =
    isResolvedBundle && Boolean(state.canvas) && Boolean(state.queries)

  return {
    canvas: isCanvasReady ? state.canvas : null,
    error: isResolvedBundle ? state.error : null,
    loading: !isCanvasReady && !state.error,
    progress: isResolvedBundle ? state.progress : null,
    queries: isCanvasReady ? state.queries : null,
  }
}
