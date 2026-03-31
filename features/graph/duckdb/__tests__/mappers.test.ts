import {
  mapCluster,
  mapExemplar,
  parseAuthors,
  mapPaper,
  mapPaperDocument,
} from '../mappers'
import type {
  GraphClusterDetailRow,
  GraphClusterExemplarRow,
  GraphPaperDetailRow,
  PaperDocumentRow,
} from '../mappers'

// ── Helpers ─────────────────────────────────────────────────────────

function clusterRow(overrides: Partial<GraphClusterDetailRow> = {}): GraphClusterDetailRow {
  return {
    candidate_count: null,
    centroid_x: 1.5,
    centroid_y: 2.5,
    cluster_id: 1,
    entity_candidate_count: null,
    is_noise: null,
    label: 'Test Cluster',
    label_mode: 'llm',
    label_source: 'gpt-4',
    lexical_candidate_count: null,
    mean_cluster_probability: 0.85,
    mean_outlier_score: 0.1,
    member_count: 42,
    paper_count: 30,
    representative_point_id: 'pt_001',
    ...overrides,
  }
}

function exemplarRow(overrides: Partial<GraphClusterExemplarRow> = {}): GraphClusterExemplarRow {
  return {
    citekey: 'smith2024',
    cluster_id: 1,
    exemplar_score: 0.95,
    is_representative: true,
    paper_id: 'paper_001',
    point_id: 'pt_001',
    preview: 'A study of...',
    rank: 1,
    title: 'Test Paper',
    ...overrides,
  }
}

function paperRow(overrides: Partial<GraphPaperDetailRow> = {}): GraphPaperDetailRow {
  return {
    abstract: 'Test abstract',
    asset_count: 3,
    author_count: 2,
    authors_json: JSON.stringify([{ name: 'Alice', surname: 'Smith' }]),
    chunk_count: 5,
    citekey: 'smith2024',
    doi: '10.1234/test',
    entity_count: 10,
    figure_count: 2,
    graph_cluster_count: 1,
    graph_point_count: 1,
    is_open_access: true,
    journal: 'Nature',
    open_access_pdf_license: 'CC-BY',
    open_access_pdf_status: 'green',
    open_access_pdf_url: 'https://example.com/pdf',
    page_count: 12,
    paper_id: 'paper_001',
    pmcid: 'PMC123',
    pmid: 12345,
    reference_count: 30,
    relation_count: 5,
    sentence_count: 100,
    table_count: 3,
    text_availability: 'full',
    title: 'Test Paper',
    year: 2024,
    ...overrides,
  }
}

function docRow(overrides: Partial<PaperDocumentRow> = {}): PaperDocumentRow {
  return {
    paper_id: 'paper_001',
    source_embedding_id: 'emb_001',
    citekey: 'smith2024',
    title: 'Test Paper',
    source_payload_policy: 'abstract',
    source_text_hash: 'abc123',
    context_label: 'abstract',
    display_preview: 'This is a preview...',
    was_truncated: false,
    context_char_count: 500,
    body_char_count: 1000,
    text_char_count: 1500,
    context_token_count: 100,
    body_token_count: 200,
    ...overrides,
  }
}

// ── mapCluster ──────────────────────────────────────────────────────

describe('mapCluster', () => {
  it('maps all fields from a fully populated row', () => {
    const result = mapCluster(clusterRow())
    expect(result.clusterId).toBe(1)
    expect(result.label).toBe('Test Cluster')
    expect(result.memberCount).toBe(42)
    expect(result.centroidX).toBe(1.5)
    expect(result.centroidY).toBe(2.5)
    expect(result.meanClusterProbability).toBe(0.85)
    expect(result.isNoise).toBe(false)
  })

  it('falls back to "Noise" label for cluster_id 0 with null label', () => {
    const result = mapCluster(clusterRow({ cluster_id: 0, label: null }))
    expect(result.label).toBe('Noise')
  })

  it('falls back to "Cluster N" label for non-zero cluster with null label', () => {
    const result = mapCluster(clusterRow({ cluster_id: 5, label: null }))
    expect(result.label).toBe('Cluster 5')
  })

  it('infers isNoise from cluster_id 0 when is_noise is null', () => {
    const result = mapCluster(clusterRow({ cluster_id: 0, is_noise: null }))
    expect(result.isNoise).toBe(true)
  })

  it('uses is_noise when explicitly set', () => {
    const result = mapCluster(clusterRow({ cluster_id: 5, is_noise: true }))
    expect(result.isNoise).toBe(true)
  })

  it('handles all-null optional fields', () => {
    const result = mapCluster(clusterRow({
      candidate_count: null,
      entity_candidate_count: null,
      lexical_candidate_count: null,
      mean_cluster_probability: null,
      mean_outlier_score: null,
      paper_count: null,
      representative_point_id: null,
    }))
    expect(result.candidateCount).toBeNull()
    expect(result.entityCandidateCount).toBeNull()
    expect(result.representativePointId).toBeNull()
  })
})

// ── mapExemplar ─────────────────────────────────────────────────────

describe('mapExemplar', () => {
  it('maps all fields from a fully populated row', () => {
    const result = mapExemplar(exemplarRow())
    expect(result.clusterId).toBe(1)
    expect(result.rank).toBe(1)
    expect(result.paperId).toBe('paper_001')
    expect(result.exemplarScore).toBe(0.95)
    expect(result.isRepresentative).toBe(true)
  })

  it('defaults exemplarScore to 0 when null', () => {
    const result = mapExemplar(exemplarRow({ exemplar_score: null }))
    expect(result.exemplarScore).toBe(0)
  })

  it('coerces is_representative false from null', () => {
    const result = mapExemplar(exemplarRow({ is_representative: null }))
    expect(result.isRepresentative).toBe(false)
  })
})

// ── parseAuthors ────────────────────────────────────────────────────

describe('parseAuthors', () => {
  it('returns empty array for null input', () => {
    expect(parseAuthors(null)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseAuthors('')).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseAuthors('not json')).toEqual([])
  })

  it('returns empty array for non-array JSON', () => {
    expect(parseAuthors('{"name": "Alice"}')).toEqual([])
  })

  it('parses standard author fields', () => {
    const json = JSON.stringify([
      { name: 'Alice Smith', surname: 'Smith', given_name: 'Alice', affiliation: 'MIT', orcid: '0000-0001' },
    ])
    const result = parseAuthors(json)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice Smith')
    expect(result[0].surname).toBe('Smith')
    expect(result[0].givenName).toBe('Alice')
    expect(result[0].affiliation).toBe('MIT')
    expect(result[0].orcid).toBe('0000-0001')
  })

  it('falls back to full_name when name is missing', () => {
    const json = JSON.stringify([{ full_name: 'Bob Jones' }])
    const result = parseAuthors(json)
    expect(result[0].name).toBe('Bob Jones')
  })

  it('uses "Unknown author" when no name fields exist', () => {
    const json = JSON.stringify([{ affiliation: 'Harvard' }])
    const result = parseAuthors(json)
    expect(result[0].name).toBe('Unknown author')
  })

  it('falls back givenName from camelCase field', () => {
    const json = JSON.stringify([{ name: 'Test', givenName: 'First' }])
    const result = parseAuthors(json)
    expect(result[0].givenName).toBe('First')
  })

  it('falls back surname from family_name', () => {
    const json = JSON.stringify([{ name: 'Test', family_name: 'Last' }])
    const result = parseAuthors(json)
    expect(result[0].surname).toBe('Last')
  })

  it('filters out null/falsy entries in the array', () => {
    const json = JSON.stringify([null, { name: 'Valid' }, 0, false])
    const result = parseAuthors(json)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Valid')
  })
})

// ── mapPaper ────────────────────────────────────────────────────────

describe('mapPaper', () => {
  it('maps all fields from a fully populated row', () => {
    const result = mapPaper(paperRow())
    expect(result.paperId).toBe('paper_001')
    expect(result.title).toBe('Test Paper')
    expect(result.year).toBe(2024)
    expect(result.journal).toBe('Nature')
    expect(result.isOpenAccess).toBe(true)
    expect(result.authors).toHaveLength(1)
  })

  it('coerces string numbers from DuckDB to actual numbers', () => {
    const result = mapPaper(paperRow({ asset_count: '3', reference_count: '30' }))
    expect(result.assetCount).toBe(3)
    expect(result.referenceCount).toBe(30)
  })

  it('coerces pmid from number to string', () => {
    const result = mapPaper(paperRow({ pmid: 12345 }))
    expect(result.pmid).toBe('12345')
  })

  it('handles null year', () => {
    const result = mapPaper(paperRow({ year: null }))
    expect(result.year).toBeNull()
  })

  it('handles null is_open_access', () => {
    const result = mapPaper(paperRow({ is_open_access: null }))
    expect(result.isOpenAccess).toBeNull()
  })
})

// ── mapPaperDocument ────────────────────────────────────────────────

describe('mapPaperDocument', () => {
  it('maps all fields from a fully populated row', () => {
    const result = mapPaperDocument(docRow())
    expect(result.paperId).toBe('paper_001')
    expect(result.sourceEmbeddingId).toBe('emb_001')
    expect(result.wasTruncated).toBe(false)
    expect(result.contextCharCount).toBe(500)
  })

  it('coerces was_truncated from null to false', () => {
    const result = mapPaperDocument(docRow({ was_truncated: null }))
    expect(result.wasTruncated).toBe(false)
  })

  it('coerces string counts to numbers', () => {
    const result = mapPaperDocument(docRow({
      context_char_count: '500',
      body_char_count: '1000',
    }))
    expect(result.contextCharCount).toBe(500)
    expect(result.bodyCharCount).toBe(1000)
  })

  it('handles null counts', () => {
    const result = mapPaperDocument(docRow({
      context_char_count: null,
      body_char_count: null,
      text_char_count: null,
    }))
    expect(result.contextCharCount).toBeNull()
    expect(result.bodyCharCount).toBeNull()
    expect(result.textCharCount).toBeNull()
  })
})
