import type {
  WikiLinkedEntity,
  WikiPageContextResponse,
  WikiPagePaperResponse,
  WikiPageResponse,
} from './wiki-types'

type WikiPagePayload = Partial<WikiPageResponse> & {
  slug: string
  title: string
  content_md: string
}

const WIKI_PAGE_KINDS = new Set<WikiPageResponse['page_kind']>([
  'index',
  'section',
  'entity',
  'topic',
])

const WIKI_GRAPH_FOCUS_VALUES = new Set<WikiPageResponse['graph_focus']>([
  'cited_papers',
  'entity_exact',
  'none',
])

function isWikiPageKind(value: unknown): value is WikiPageResponse['page_kind'] {
  return typeof value === 'string' && WIKI_PAGE_KINDS.has(value as WikiPageResponse['page_kind'])
}

function isWikiGraphFocus(value: unknown): value is WikiPageResponse['graph_focus'] {
  return (
    typeof value === 'string'
    && WIKI_GRAPH_FOCUS_VALUES.has(value as WikiPageResponse['graph_focus'])
  )
}

export function normalizeWikiPageResponse(
  page: WikiPagePayload | null,
): WikiPageResponse | null {
  if (!page) {
    return null
  }

  const paperPmids = normalizeNumberArray(page.paper_pmids)
  const featuredPmids = normalizeNumberArray(page.featured_pmids)
  const paperGraphRefs = normalizePaperGraphRefs(page.paper_graph_refs)
  const featuredGraphRefs = normalizePaperGraphRefs(page.featured_graph_refs)
  const pageKind = normalizeWikiPageKind(page.page_kind)

  return {
    slug: page.slug,
    title: page.title,
    content_md: page.content_md,
    frontmatter: isPlainObject(page.frontmatter) ? page.frontmatter : {},
    entity_type: typeof page.entity_type === 'string' ? page.entity_type : null,
    concept_id: typeof page.concept_id === 'string' ? page.concept_id : null,
    family_key: typeof page.family_key === 'string' ? page.family_key : null,
    semantic_group: typeof page.semantic_group === 'string' ? page.semantic_group : null,
    page_kind: pageKind,
    section_slug: typeof page.section_slug === 'string' ? page.section_slug : null,
    graph_focus: normalizeWikiGraphFocus(page.graph_focus),
    summary: typeof page.summary === 'string' ? page.summary : null,
    tags: normalizeStringArray(page.tags),
    outgoing_links: normalizeStringArray(page.outgoing_links),
    paper_pmids: paperPmids,
    featured_pmids: featuredPmids,
    paper_graph_refs: paperGraphRefs,
    featured_graph_refs: featuredGraphRefs,
    resolved_links: normalizeStringRecord(page.resolved_links),
    linked_entities: normalizeLinkedEntities(page.linked_entities),
  }
}

function normalizeWikiPageKind(value: unknown): WikiPageResponse['page_kind'] {
  return isWikiPageKind(value) ? value : 'topic'
}

function normalizeWikiGraphFocus(value: unknown): WikiPageResponse['graph_focus'] {
  return isWikiGraphFocus(value) ? value : 'none'
}

export function normalizeWikiPageContextResponse(value: unknown): WikiPageContextResponse | null {
  if (!isPlainObject(value)) {
    return null
  }
  return {
    total_corpus_paper_count: normalizeNullableNumber(value.total_corpus_paper_count),
    total_graph_paper_count: normalizeNullableNumber(value.total_graph_paper_count),
    top_graph_papers: normalizeTopGraphPapers(value.top_graph_papers),
  }
}

function normalizeTopGraphPapers(value: unknown): WikiPagePaperResponse[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((paper) => {
    if (!isPlainObject(paper)) {
      return []
    }
    const pmid = normalizeNullableNumber(paper.pmid)
    if (pmid == null) {
      return []
    }
    return [
      {
        pmid,
        graph_paper_ref:
          typeof paper.graph_paper_ref === 'string' ? paper.graph_paper_ref : null,
        title: typeof paper.title === 'string' ? paper.title : '',
        year: normalizeNullableNumber(paper.year),
        venue: typeof paper.venue === 'string' ? paper.venue : null,
        citation_count: normalizeNullableNumber(paper.citation_count),
      },
    ]
  })
}

function normalizeLinkedEntities(value: unknown): Record<string, WikiLinkedEntity> {
  if (!isPlainObject(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([slug, entity]) => {
      if (!isPlainObject(entity)) {
        return []
      }
      if (
        typeof entity.entity_type !== 'string'
        || typeof entity.concept_id !== 'string'
      ) {
        return []
      }
      return [[slug, { entity_type: entity.entity_type, concept_id: entity.concept_id }]]
    }),
  )
}

function normalizePaperGraphRefs(value: unknown): Record<number, string> {
  if (!isPlainObject(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([pmidKey, graphPaperRef]) => {
      const pmid = Number(pmidKey)
      if (!Number.isInteger(pmid) || typeof graphPaperRef !== 'string') {
        return []
      }
      return [[pmid, graphPaperRef]]
    }),
  )
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, recordValue]) => {
      if (typeof recordValue !== 'string') {
        return []
      }
      return [[key, recordValue]]
    }),
  )
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is number => Number.isInteger(entry))
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
