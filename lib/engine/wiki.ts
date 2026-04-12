import 'server-only'

import { EngineApiError, getEngineJson } from './client'
import {
  buildWikiPageContextEnginePath,
  buildWikiPageEnginePath,
} from './wiki-paths'
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
  const path = buildWikiPageEnginePath(slug, { graphReleaseId })

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
  const path = buildWikiPageContextEnginePath(slug, { graphReleaseId })

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
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  })
  return getEngineJson<WikiSearchResponse>(`${WIKI_API_PREFIX}/search?${params.toString()}`)
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
