'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  WikiPageContextResponse,
  WikiPageResponse,
  WikiPageSummary,
} from '@/lib/engine/wiki-types'
import {
  fetchWikiBacklinksClient,
  fetchWikiPageClient,
  fetchWikiPageContextClient,
} from '@/features/wiki/lib/wiki-client'
import { isEntityWikiSlug } from '@/features/wiki/lib/entity-wiki-route'

interface WikiPageBundleState {
  page: WikiPageResponse | null
  backlinks: WikiPageSummary[]
  context: WikiPageContextResponse | null
  loading: boolean
  contextLoading: boolean
  error: string | null
  contextError: string | null
}

const IDLE: WikiPageBundleState = {
  page: null,
  backlinks: [],
  context: null,
  loading: false,
  contextLoading: false,
  error: null,
  contextError: null,
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Concurrent page loading: fires page, backlinks, and context simultaneously.
 * Page renders as soon as it resolves; backlinks and context fill in independently.
 * Context is only fetched for entity pages (determined from slug prefix alone,
 * no need to wait for the page response).
 */
export function useWikiPageBundle(
  slug: string | null,
  graphReleaseId?: string,
) {
  const [state, setState] = useState<WikiPageBundleState>(IDLE)

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    if (!slug) {
      setState(IDLE)
      return
    }

    setState({ ...IDLE, loading: true, contextLoading: isEntityWikiSlug(slug) })

    // Fire all three concurrently from the start.
    // Context eligibility is determined by slug prefix — no need to wait for page.
    const pagePromise = fetchWikiPageClient(slug, graphReleaseId, { signal })

    const backlinksPromise = fetchWikiBacklinksClient(slug, { signal })
      .then((r) => r.backlinks)
      .catch((err) => {
        if (!isAbortError(err)) console.warn('Backlinks fetch failed:', err)
        return [] as WikiPageSummary[]
      })

    const contextPromise = isEntityWikiSlug(slug)
      ? fetchWikiPageContextClient(slug, graphReleaseId, { signal }).catch(
          (err) => {
            if (!isAbortError(err)) console.warn('Context fetch failed:', err)
            return null
          },
        )
      : Promise.resolve(null)

    // Resolve page first → render markdown immediately
    try {
      const page = await pagePromise
      setState((s) => ({ ...s, page, loading: false, error: null }))
    } catch (err) {
      if (isAbortError(err)) return
      setState({
        ...IDLE,
        error: err instanceof Error ? err.message : 'Failed to load wiki page',
      })
      return
    }

    // Backlinks + context are already in-flight — collect results
    const [backlinks, context] = await Promise.all([
      backlinksPromise,
      contextPromise,
    ])
    setState((s) => ({
      ...s,
      backlinks,
      context,
      contextLoading: false,
    }))
  }, [slug, graphReleaseId])

  useEffect(() => {
    const controller = new AbortController()
    void fetchAll(controller.signal)
    return () => controller.abort()
  }, [fetchAll])

  return { ...state, refetch: () => fetchAll() }
}
