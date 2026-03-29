'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  loadGraphBundle,
  subscribeToGraphBundleProgress,
} from '@/features/graph/duckdb'
import type { GraphCanvasSource } from '@/features/graph/duckdb'
import { useDashboardStore } from '@/features/graph/stores'
import type {
  GraphBundle,
  GraphBundleLoadProgress,
  GraphBundleQueries,
  GraphData,
} from '@/features/graph/types'

interface ResolvedGraphBundleState {
  bundleChecksum: string | null
  canvas: GraphCanvasSource | null
  data: GraphData | null
  error: Error | null
  metadataError: Error | null
  progress: GraphBundleLoadProgress | null
  queries: GraphBundleQueries | null
}

interface GraphBundleState {
  canvas: GraphCanvasSource | null
  data: GraphData | null
  error: Error | null
  loading: boolean
  metadataLoading: boolean
  metadataError: Error | null
  progress: GraphBundleLoadProgress | null
  queries: GraphBundleQueries | null
  ensureData: () => Promise<void>
}

export function useGraphBundle(bundle: GraphBundle): GraphBundleState {
  const [state, setState] = useState<ResolvedGraphBundleState>({
      bundleChecksum: null,
      canvas: null,
      data: null,
      error: null,
      metadataError: null,
      progress: null,
      queries: null,
    })

  const [requestedBundleChecksum, setRequestedBundleChecksum] = useState<string | null>(null)
  const metadataRequested = requestedBundleChecksum === bundle.bundleChecksum

  useEffect(() => {
    let cancelled = false
    let unsubscribeCanvas = () => {}
    const unsubscribeProgress = subscribeToGraphBundleProgress(
      bundle.bundleChecksum,
      (progress) => {
        if (cancelled) {
          return
        }

        setState((current) => ({
          ...current,
          bundleChecksum: bundle.bundleChecksum,
          progress,
        }))
      }
    )

    loadGraphBundle(bundle)
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
            bundleChecksum: bundle.bundleChecksum,
            canvas: nextCanvas,
          }))
        })

        useDashboardStore.getState().setAvailableLayers(session.availableLayers)

        const queries: GraphBundleQueries = {
          setOverlayPointIds: session.setOverlayPointIds,
          clearOverlay: session.clearOverlay,
          activateOverlay: session.activateOverlay,
          getClusterDetail: session.getClusterDetail,
          getInstitutionAuthors: session.getInstitutionAuthors,
          getAuthorInstitutions: session.getAuthorInstitutions,
          getInfoSummary: session.getInfoSummary,
          getInfoBars: session.getInfoBars,
          getInfoHistogram: session.getInfoHistogram,
          getFacetSummary: session.getFacetSummary,
          searchPoints: session.searchPoints,
          getVisibilityBudget: session.getVisibilityBudget,
          getPointIndicesForScope: session.getPointIndicesForScope,
          getSelectionDetail: session.getSelectionDetail,
          getPaperDocument: session.getPaperDocument,
          getPaperNodesByPaperIds: session.getPaperNodesByPaperIds,
          getUniversePointIdsByPaperIds: session.getUniversePointIdsByPaperIds,
          getChunkNodesByChunkIds: session.getChunkNodesByChunkIds,
          resolvePointSelection: session.resolvePointSelection,
          getTablePage: session.getTablePage,
          runReadOnlyQuery: session.runReadOnlyQuery,
        }

        setState((current) => ({
          ...current,
          bundleChecksum: bundle.bundleChecksum,
          canvas: session.canvas,
          queries,
          error: null,
          metadataError: null,
        }))
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setState({
          bundleChecksum: bundle.bundleChecksum,
          canvas: null,
          data: null,
          error: error instanceof Error ? error : new Error('Failed to load graph bundle'),
          metadataError: null,
          progress: null,
          queries: null,
        })
      })

    return () => {
      cancelled = true
      unsubscribeCanvas()
      unsubscribeProgress()
    }
  }, [bundle])

  useEffect(() => {
    if (!metadataRequested || state.data || state.metadataError || state.error) {
      return
    }
    if (state.bundleChecksum !== bundle.bundleChecksum || !state.canvas || !state.queries) {
      return
    }

    let cancelled = false

    loadGraphBundle(bundle)
      .then((session) => session.getData())
      .then((data) => {
        if (cancelled) {
          return
        }

        setState((current) => ({
          ...current,
          bundleChecksum: bundle.bundleChecksum,
          data,
          metadataError: null,
          progress: {
            stage: 'ready',
            message: 'Graph bundle is ready.',
            percent: 100,
          },
        }))
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setState((current) => ({
          ...current,
          bundleChecksum: bundle.bundleChecksum,
          metadataError:
            error instanceof Error
              ? error
              : new Error('Failed to hydrate geographic metadata'),
        }))
      })

    return () => {
      cancelled = true
    }
  }, [
    bundle,
    metadataRequested,
    state.bundleChecksum,
    state.canvas,
    state.data,
    state.error,
    state.metadataError,
    state.queries,
  ])

  const isResolvedBundle = state.bundleChecksum === bundle.bundleChecksum
  const isCanvasReady =
    isResolvedBundle && Boolean(state.canvas) && Boolean(state.queries)

  const ensureData = useCallback(async () => {
    setRequestedBundleChecksum(bundle.bundleChecksum)
  }, [bundle.bundleChecksum])

  return {
    canvas: isCanvasReady ? state.canvas : null,
    data: isResolvedBundle ? state.data : null,
    error: isResolvedBundle ? state.error : null,
    loading: !isCanvasReady && !state.error,
    metadataLoading: metadataRequested && isCanvasReady && !state.data && !state.metadataError,
    metadataError: isResolvedBundle ? state.metadataError : null,
    progress: isResolvedBundle ? state.progress : null,
    queries: isCanvasReady ? state.queries : null,
    ensureData,
  }
}
