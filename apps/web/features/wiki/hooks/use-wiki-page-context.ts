'use client'

import { useCallback, useEffect, useState } from 'react'
import { isEntityWikiSlug } from '@/features/wiki/lib/entity-wiki-route'
import { fetchWikiPageContextClient } from '@/features/wiki/lib/wiki-client'
import type { WikiPageContextResponse, WikiPageResponse } from '@/lib/engine/wiki-types'

interface WikiPageContextState {
  context: WikiPageContextResponse | null
  loading: boolean
  error: string | null
}

const IDLE: WikiPageContextState = {
  context: null,
  loading: false,
  error: null,
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function useWikiPageContext(
  slug: string | null,
  pageKind: WikiPageResponse['page_kind'] | null,
  graphReleaseId?: string,
) {
  const [state, setState] = useState<WikiPageContextState>(IDLE)
  const shouldFetchContext =
    !!slug && (pageKind === 'entity' || (pageKind == null && isEntityWikiSlug(slug)))

  const fetchContext = useCallback(async (signal?: AbortSignal) => {
    if (!slug || !shouldFetchContext) {
      setState(IDLE)
      return
    }

    setState({ context: null, loading: true, error: null })
    try {
      const result = await fetchWikiPageContextClient(slug, graphReleaseId, { signal })
      setState({ context: result, loading: false, error: null })
    } catch (error) {
      if (isAbortError(error)) {
        return
      }
      setState({
        context: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load wiki page context',
      })
    }
  }, [graphReleaseId, shouldFetchContext, slug])

  useEffect(() => {
    const controller = new AbortController()
    void fetchContext(controller.signal)
    return () => controller.abort()
  }, [fetchContext])

  return {
    ...state,
    refetch: () => fetchContext(),
  }
}
