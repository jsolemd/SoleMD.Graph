import 'server-only'

import { getEngineJson, postEngineJson } from './client'
import type {
  WikiPageResponse,
  WikiPageSummary,
  WikiSearchResponse,
  WikiBacklinksResponse,
} from './wiki-types'

export type {
  WikiPageResponse,
  WikiPageSummary,
  WikiSearchResponse,
  WikiBacklinksResponse,
}

const WIKI_API_PREFIX = '/api/v1/wiki'

export async function fetchWikiPage(
  slug: string,
  graphReleaseId?: string,
): Promise<WikiPageResponse | null> {
  const params = new URLSearchParams()
  if (graphReleaseId) {
    params.set('graph_release_id', graphReleaseId)
  }
  const qs = params.toString()
  const path = `${WIKI_API_PREFIX}/pages/${slug}${qs ? `?${qs}` : ''}`

  try {
    return await getEngineJson<WikiPageResponse>(path)
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
      return null
    }
    throw error
  }
}

export async function fetchWikiPages(): Promise<WikiPageSummary[]> {
  return getEngineJson<WikiPageSummary[]>(`${WIKI_API_PREFIX}/pages`)
}

export async function searchWiki(
  query: string,
  limit = 20,
): Promise<WikiSearchResponse> {
  return postEngineJson<{ query: string; limit: number }, WikiSearchResponse>(
    `${WIKI_API_PREFIX}/search`,
    { query, limit },
  )
}

export async function fetchWikiBacklinks(
  slug: string,
): Promise<WikiBacklinksResponse> {
  return getEngineJson<WikiBacklinksResponse>(
    `${WIKI_API_PREFIX}/backlinks/${slug}`,
  )
}
