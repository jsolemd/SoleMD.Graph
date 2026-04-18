'use client'

import { useCallback, useEffect, useState } from 'react'
import type { WikiPageResponse } from '@/lib/engine/wiki-types'
import { fetchWikiPageClient } from '@/features/wiki/lib/wiki-client'

interface WikiPageState {
  page: WikiPageResponse | null
  loading: boolean
  error: string | null
}

const IDLE: WikiPageState = { page: null, loading: false, error: null }

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function useWikiPage(
  slug: string | null,
  graphReleaseId?: string,
) {
  const [state, setState] = useState<WikiPageState>(IDLE)

  const fetchPage = useCallback(async (signal?: AbortSignal) => {
    if (!slug) {
      setState(IDLE)
      return
    }

    setState((s) => (s.loading ? s : { ...s, loading: true, error: null }))
    try {
      const result = await fetchWikiPageClient(slug, graphReleaseId, { signal })
      setState({ page: result, loading: false, error: null })
    } catch (err) {
      if (isAbortError(err)) {
        return
      }
      setState({
        page: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load wiki page',
      })
    }
  }, [slug, graphReleaseId])

  useEffect(() => {
    const controller = new AbortController()
    void fetchPage(controller.signal)
    return () => controller.abort()
  }, [fetchPage])

  return {
    ...state,
    refetch: () => fetchPage(),
  }
}
