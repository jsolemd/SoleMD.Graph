'use client'

import { useCallback, useEffect, useState } from 'react'
import { getWikiPage } from '@/app/actions/wiki'
import type { WikiPageResponse } from '@/lib/engine/wiki-types'

interface UseWikiPageResult {
  page: WikiPageResponse | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useWikiPage(
  slug: string | null,
  graphReleaseId?: string,
): UseWikiPageResult {
  const [page, setPage] = useState<WikiPageResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async () => {
    if (!slug) {
      setPage(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await getWikiPage(slug, graphReleaseId)
      setPage(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wiki page')
      setPage(null)
    } finally {
      setLoading(false)
    }
  }, [slug, graphReleaseId])

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  return { page, loading, error, refetch: fetchPage }
}
