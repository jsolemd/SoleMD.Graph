import { normalizeWikiPageResponse } from '@/lib/engine/wiki-normalize'

describe('normalizeWikiPageResponse', () => {
  it('fills missing wiki page collections and inferred metadata for legacy payloads', () => {
    const page = normalizeWikiPageResponse({
      slug: 'entities/schizophrenia',
      title: 'Schizophrenia',
      content_md: '# Schizophrenia',
      frontmatter: {},
      entity_type: 'Disease',
      concept_id: 'MESH:D012559',
      family_key: 'psychosis',
      tags: ['psychosis'],
      outgoing_links: ['entities/clozapine'],
      paper_pmids: [3616518],
      paper_graph_refs: { 3616518: 'paper-3616518' },
      resolved_links: { clozapine: 'entities/clozapine' },
    })

    expect(page).toEqual({
      slug: 'entities/schizophrenia',
      title: 'Schizophrenia',
      content_md: '# Schizophrenia',
      frontmatter: {},
      entity_type: 'Disease',
      concept_id: 'MESH:D012559',
      family_key: 'psychosis',
      page_kind: 'entity',
      section_slug: null,
      graph_focus: 'cited_papers',
      summary: null,
      tags: ['psychosis'],
      outgoing_links: ['entities/clozapine'],
      paper_pmids: [3616518],
      featured_pmids: [],
      paper_graph_refs: { 3616518: 'paper-3616518' },
      featured_graph_refs: {},
      resolved_links: { clozapine: 'entities/clozapine' },
      linked_entities: {},
      context: null,
    })
  })

  it('derives featured graph refs from featured pmids when the backend omits the dedicated map', () => {
    const page = normalizeWikiPageResponse({
      slug: 'entities/schizophrenia',
      title: 'Schizophrenia',
      content_md: '# Schizophrenia',
      paper_pmids: [3616518, 9090331],
      featured_pmids: [9090331],
      paper_graph_refs: {
        3616518: 'paper-3616518',
        9090331: 'paper-9090331',
      },
    })

    expect(page?.featured_graph_refs).toEqual({ 9090331: 'paper-9090331' })
  })
})
