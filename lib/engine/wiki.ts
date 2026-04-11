import 'server-only'

import { EngineApiError, getEngineJson, postEngineJson } from './client'
import { normalizeWikiPageContextResponse, normalizeWikiPageResponse } from './wiki-normalize'
import type {
  WikiPageResponse,
  WikiPageSummary,
  WikiSearchResponse,
  WikiBacklinksResponse,
  WikiGraphResponse,
  WikiPageContextResponse,
} from './wiki-types'

export type {
  WikiPageResponse,
  WikiPageSummary,
  WikiSearchResponse,
  WikiBacklinksResponse,
  WikiGraphResponse,
  WikiPageContextResponse,
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
    return normalizeWikiPageResponse(
      await getEngineJson<WikiPageResponse>(path),
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
      return null
    }
    throw error
  }
}

export async function fetchWikiPageContext(
  slug: string,
  graphReleaseId?: string,
): Promise<WikiPageContextResponse | null> {
  const params = new URLSearchParams()
  if (graphReleaseId) {
    params.set('graph_release_id', graphReleaseId)
  }
  const qs = params.toString()
  const path = `${WIKI_API_PREFIX}/page-context/${slug}${qs ? `?${qs}` : ''}`

  try {
    return normalizeWikiPageContextResponse(
      await getEngineJson<WikiPageContextResponse | null>(path),
    )
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

export async function fetchWikiGraph(
  graphReleaseId: string,
): Promise<WikiGraphResponse> {
  const params = new URLSearchParams({ graph_release_id: graphReleaseId })
  try {
    return await getEngineJson<WikiGraphResponse>(
      `${WIKI_API_PREFIX}/graph?${params.toString()}`,
    )
  } catch (error) {
    if (error instanceof EngineApiError && error.status === 404) {
      throw new Error(
        "Wiki graph endpoint is unavailable on the configured evidence engine. Restart the engine or verify ENGINE_URL points to a backend serving /api/v1/wiki/graph.",
      )
    }
    throw error
  }
}
