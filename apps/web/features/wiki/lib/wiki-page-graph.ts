import type { WikiPageResponse } from "@solemd/api-client/shared/wiki-types";

const EMPTY_WIKI_PAGE_GRAPH_REFS = Object.freeze([]) as readonly string[];

export function resolveWikiPageGraphRefs(
  page: Pick<WikiPageResponse, "featured_graph_refs" | "paper_graph_refs"> | null | undefined,
): readonly string[] {
  if (!page) {
    return EMPTY_WIKI_PAGE_GRAPH_REFS;
  }

  const featuredRefs = uniqueStrings(Object.values(page.featured_graph_refs ?? {}));
  if (featuredRefs.length > 0) {
    return featuredRefs;
  }

  const paperRefs = uniqueStrings(Object.values(page.paper_graph_refs ?? {}));
  if (paperRefs.length > 0) {
    return paperRefs;
  }

  return EMPTY_WIKI_PAGE_GRAPH_REFS;
}

export function countWikiPageGraphRefs(
  page: Pick<WikiPageResponse, "featured_graph_refs" | "paper_graph_refs"> | null | undefined,
): number {
  return resolveWikiPageGraphRefs(page).length;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const next = Array.from(new Set(values.filter((value) => value.trim().length > 0)));
  return next.length > 0 ? next : EMPTY_WIKI_PAGE_GRAPH_REFS;
}
