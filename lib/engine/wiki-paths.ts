const WIKI_ENGINE_PREFIX = "/api/v1/wiki"

export function encodeWikiSlug(slug: string): string {
  return slug
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function buildWikiEngineQuery({
  graphReleaseId,
}: {
  graphReleaseId?: string
}): string {
  const params = new URLSearchParams()
  if (graphReleaseId) {
    params.set("graph_release_id", graphReleaseId)
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function buildWikiPageEnginePath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `${WIKI_ENGINE_PREFIX}/pages/${slug}${buildWikiEngineQuery(options)}`
}

export function buildWikiPageBundleEnginePath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `${WIKI_ENGINE_PREFIX}/page-bundle/${slug}${buildWikiEngineQuery(options)}`
}

export function buildWikiPageContextEnginePath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `${WIKI_ENGINE_PREFIX}/page-context/${slug}${buildWikiEngineQuery(options)}`
}

export function buildWikiPagesEnginePath(): string {
  return `${WIKI_ENGINE_PREFIX}/pages`
}

export function buildWikiSearchEnginePath(query: string, limit: number): string {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  })
  return `${WIKI_ENGINE_PREFIX}/search?${params.toString()}`
}

export function buildWikiBacklinksEnginePath(slug: string): string {
  return `${WIKI_ENGINE_PREFIX}/backlinks/${slug}`
}

export function buildWikiGraphEnginePath(graphReleaseId: string): string {
  return `${WIKI_ENGINE_PREFIX}/graph${buildWikiEngineQuery({ graphReleaseId })}`
}

export function buildWikiPageClientPath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `/api/wiki/pages/${encodeWikiSlug(slug)}${buildWikiEngineQuery(options)}`
}

export function buildWikiPageBundleClientPath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `/api/wiki/page-bundle/${encodeWikiSlug(slug)}${buildWikiEngineQuery(options)}`
}

export function buildWikiPageContextClientPath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `/api/wiki/context/${encodeWikiSlug(slug)}${buildWikiEngineQuery(options)}`
}
