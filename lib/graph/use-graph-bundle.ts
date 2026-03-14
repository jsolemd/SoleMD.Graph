'use client'

import { useEffect, useState } from 'react'
import { loadGraphBundle } from './duckdb'
import type { GraphCanvasSource } from './duckdb'
import { useDashboardStore } from './stores'
import type { GraphBundle, GraphBundleQueries, GraphData } from './types'

interface ResolvedGraphBundleState {
  bundleChecksum: string | null
  canvas: GraphCanvasSource | null
  data: GraphData | null
  error: Error | null
  queries: GraphBundleQueries | null
}

interface GraphBundleState {
  canvas: GraphCanvasSource | null
  data: GraphData | null
  error: Error | null
  loading: boolean
  queries: GraphBundleQueries | null
}

export function useGraphBundle(bundle: GraphBundle): GraphBundleState {
  const [state, setState] = useState<ResolvedGraphBundleState>({
    bundleChecksum: null,
    canvas: null,
    data: null,
    error: null,
    queries: null,
  })

  useEffect(() => {
    let cancelled = false

    loadGraphBundle(bundle)
      .then((session) => {
        if (cancelled) {
          return
        }

        useDashboardStore.getState().setAvailableLayers(session.availableLayers)

        setState({
          bundleChecksum: bundle.bundleChecksum,
          canvas: session.canvas,
          data: session.data,
          error: null,
          queries: {
            getSelectionDetail: session.getSelectionDetail,
            getPaperDocument: session.getPaperDocument,
            runReadOnlyQuery: session.runReadOnlyQuery,
          },
        })
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
          queries: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [bundle])

  const isResolvedBundle = state.bundleChecksum === bundle.bundleChecksum

  return {
    canvas: isResolvedBundle ? state.canvas : null,
    data: isResolvedBundle ? state.data : null,
    error: isResolvedBundle ? state.error : null,
    loading: !isResolvedBundle,
    queries: isResolvedBundle ? state.queries : null,
  }
}
