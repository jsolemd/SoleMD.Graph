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
  return `/api/v1/wiki/pages/${slug}${buildWikiEngineQuery(options)}`
}

export function buildWikiPageContextEnginePath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `/api/v1/wiki/page-context/${slug}${buildWikiEngineQuery(options)}`
}

export function buildWikiPageClientPath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `/api/wiki/pages/${encodeWikiSlug(slug)}${buildWikiEngineQuery(options)}`
}

export function buildWikiPageContextClientPath(
  slug: string,
  options: {
    graphReleaseId?: string
  } = {},
): string {
  return `/api/wiki/context/${encodeWikiSlug(slug)}${buildWikiEngineQuery(options)}`
}
