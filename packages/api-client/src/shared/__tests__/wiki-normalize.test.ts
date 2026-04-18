import { normalizeWikiPageResponse } from "../wiki-normalize"

describe('normalizeWikiPageResponse', () => {
  it('fills missing wiki page collections and uses conservative defaults for invalid legacy payloads', () => {
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
      semantic_group: null,
      page_kind: 'topic',
      section_slug: null,
      graph_focus: 'none',
      summary: null,
      tags: ['psychosis'],
      outgoing_links: ['entities/clozapine'],
      paper_pmids: [3616518],
      featured_pmids: [],
      paper_graph_refs: { 3616518: 'paper-3616518' },
      featured_graph_refs: {},
      resolved_links: { clozapine: 'entities/clozapine' },
      linked_entities: {},
      body_entity_matches: [],
    })
  })

  it('does not re-derive featured graph refs when the backend omits the dedicated map', () => {
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

    expect(page?.featured_graph_refs).toEqual({})
  })

  it('preserves entity link metadata even when the concept id is missing', () => {
    const page = normalizeWikiPageResponse({
      slug: 'entities/amygdala',
      title: 'Amygdala',
      content_md: '[[serotonin]]',
      linked_entities: {
        'entities/serotonin': {
          entity_type: 'Chemical',
          concept_id: null,
        },
      },
    })

    expect(page?.linked_entities).toEqual({
      'entities/serotonin': {
        entity_type: 'Chemical',
        concept_id: null,
      },
    })
  })
})
