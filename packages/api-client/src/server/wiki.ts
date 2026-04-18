import 'server-only'

import { EngineApiError, getEngineJson } from './client'
import {
  buildWikiBacklinksEnginePath,
  buildWikiGraphEnginePath,
  buildWikiPageBundleEnginePath,
  buildWikiPageContextEnginePath,
  buildWikiPageEnginePath,
  buildWikiPagesEnginePath,
  buildWikiSearchEnginePath,
} from '../shared/wiki-paths'
import {
  normalizeWikiPageBundleResponse,
  normalizeWikiPageContextResponse,
  normalizeWikiPageResponse,
} from '../shared/wiki-normalize'
import type {
  WikiPageResponse,
  WikiPageBundleResponse,
  WikiPageSummary,
  WikiSearchResponse,
  WikiBacklinksResponse,
  WikiGraphResponse,
  WikiPageContextResponse,
} from '../shared/wiki-types'

export type {
  WikiPageResponse,
  WikiPageBundleResponse,
  WikiPageSummary,
  WikiSearchResponse,
  WikiBacklinksResponse,
  WikiGraphResponse,
  WikiPageContextResponse,
}

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

export async function fetchWikiPageBundle(
  slug: string,
  graphReleaseId?: string,
): Promise<WikiPageBundleResponse | null> {
  const path = buildWikiPageBundleEnginePath(slug, { graphReleaseId })

  try {
    return normalizeWikiPageBundleResponse(
      await getEngineJson<WikiPageBundleResponse>(path),
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
  return getEngineJson<WikiPageSummary[]>(buildWikiPagesEnginePath())
}

export async function searchWiki(
  query: string,
  limit = 20,
): Promise<WikiSearchResponse> {
  return getEngineJson<WikiSearchResponse>(buildWikiSearchEnginePath(query, limit))
}

export async function fetchWikiBacklinks(
  slug: string,
): Promise<WikiBacklinksResponse> {
  return getEngineJson<WikiBacklinksResponse>(buildWikiBacklinksEnginePath(slug))
}

export async function fetchWikiGraph(
  graphReleaseId: string,
): Promise<WikiGraphResponse> {
  try {
    return await getEngineJson<WikiGraphResponse>(buildWikiGraphEnginePath(graphReleaseId))
  } catch (error) {
    if (error instanceof EngineApiError && error.status === 404) {
      throw new Error(
        "Wiki graph endpoint is unavailable on the configured evidence engine. Restart the engine or verify ENGINE_URL points to a backend serving /api/v1/wiki/graph.",
      )
    }
    throw error
  }
}
