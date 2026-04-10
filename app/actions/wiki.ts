'use server'

import {
  fetchWikiPage,
  fetchWikiPages,
  searchWiki,
  fetchWikiBacklinks,
} from '@/lib/engine/wiki'
import type {
  WikiPageResponse,
  WikiPageSummary,
  WikiSearchResponse,
  WikiBacklinksResponse,
} from '@/lib/engine/wiki-types'

export async function getWikiPage(
  slug: string,
  graphReleaseId?: string,
): Promise<WikiPageResponse | null> {
  try {
    return await fetchWikiPage(slug, graphReleaseId)
  } catch {
    return null
  }
}

export async function getWikiPages(): Promise<WikiPageSummary[]> {
  try {
    return await fetchWikiPages()
  } catch {
    return []
  }
}

export async function searchWikiPages(
  query: string,
  limit = 20,
): Promise<WikiSearchResponse> {
  try {
    return await searchWiki(query, limit)
  } catch {
    return { hits: [], total: 0 }
  }
}

export async function getWikiBacklinks(
  slug: string,
): Promise<WikiBacklinksResponse> {
  try {
    return await fetchWikiBacklinks(slug)
  } catch {
    return { slug, backlinks: [] }
  }
}
