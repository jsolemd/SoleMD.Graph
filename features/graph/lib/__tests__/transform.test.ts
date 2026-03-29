import { buildGraphData, buildPaperNodes, buildPaperStats } from '../transform'
import type { GraphPointRow } from '../transform'
import type { ClusterInfo } from '@/features/graph/types'

/** Build a minimal GraphPointRow with sensible defaults. */
function graphRow(overrides: Partial<GraphPointRow> & Pick<GraphPointRow, 'id' | 'node_id' | 'paper_id' | 'x' | 'y'>): GraphPointRow {
  return {
    alias_count: null, alias_quality_score: null, alias_source: null, alias_text: null,
    alias_type: null, assertion_status: null, canonical_name: null, category: null,
    definition: null, semantic_types_csv: null, aliases_csv: null, char_count: null,
    chunk_count: null, chunk_index: null, chunk_kind: null, chunk_preview: null,
    display_label: null, display_preview: null, citekey: null, cluster_id: null,
    cluster_label: null, cluster_probability: null, doi: null, evidence_status: null,
    has_open_access_pdf: null, has_figure_context: null, has_table_context: null,
    is_in_base: null, base_rank: null,
    is_open_access: null, journal: null, mention_count: null, node_kind: 'chunk',
    node_role: 'primary', organ_systems_csv: null, paper_asset_count: null,
    paper_author_count: null, paper_chunk_count: null, paper_cluster_index: null,
    paper_entity_count: null, paper_figure_count: null, paper_page_count: null,
    paper_count: null, paper_reference_count: null, paper_relation_count: null,
    paper_sentence_count: null, paper_table_count: null, page_number: null,
    payload_json: null, point_index: null, pmcid: null, pmid: null,
    relation_category: null, relation_certainty: null, relation_count: null,
    relation_direction: null, relation_categories_csv: null, relation_type: null,
    search_text: null, semantic_groups_csv: null, section_canonical: null,
    stable_chunk_id: null, text_availability: null, title: null, top_entities_csv: null,
    token_count: null, year: null,
    ...overrides,
  }
}

const CLUSTERS = [
  {
    cluster_id: 0,
    label: 'Noise',
    label_mode: null,
    label_source: null,
    member_count: 1,
    centroid_x: 0,
    centroid_y: 0,
    representative_rag_chunk_id: null,
    candidate_count: null,
    entity_candidate_count: null,
    lexical_candidate_count: null,
    mean_cluster_probability: null,
    mean_outlier_score: null,
    paper_count: 1,
    is_noise: true,
  },
  {
    cluster_id: 3,
    label: 'Neuroinflammation',
    label_mode: 'lexical',
    label_source: 'keywords',
    member_count: 12,
    centroid_x: 10,
    centroid_y: 20,
    representative_rag_chunk_id: 'chunk-1',
    candidate_count: 4,
    entity_candidate_count: 1,
    lexical_candidate_count: 3,
    mean_cluster_probability: 0.92,
    mean_outlier_score: 0.1,
    paper_count: 1,
    is_noise: false,
  },
]

describe('buildGraphData', () => {
  it('shapes bundle-first graph rows into graph data and computes stats', () => {
    const data = buildGraphData({
      points: [
        graphRow({
          id: 'chunk-1', node_id: 'chunk-1', paper_id: 'paper-1',
          point_index: 11, x: 1, y: 2,
          cluster_id: 3, cluster_label: 'Neuroinflammation', cluster_probability: 0.92,
          citekey: 'Paper2026', title: 'A paper', year: 2026, journal: 'Journal A',
          doi: '10.1000/a', pmid: 123456,
          is_in_base: true, base_rank: 3001,
          stable_chunk_id: 'stable-1', chunk_index: 1, section_canonical: 'Methods',
          page_number: 3, token_count: 120, char_count: 640,
          chunk_kind: 'paragraph', chunk_preview: 'Representative chunk',
          paper_author_count: 4, paper_reference_count: 23, paper_asset_count: 2,
          paper_chunk_count: 12, paper_entity_count: '8', paper_relation_count: '5',
          paper_sentence_count: 78, paper_page_count: 6, paper_table_count: 1,
          paper_figure_count: 0, has_table_context: false, has_figure_context: true,
        }),
        graphRow({
          id: 'chunk-2', node_id: 'chunk-2', paper_id: 'paper-2',
          point_index: 19, x: 3, y: 4,
          cluster_id: 0, cluster_probability: 0.21,
          title: 'Another paper', citekey: 'PaperTwo2026', year: 2025,
          is_in_base: false, base_rank: 0,
          chunk_index: 2,
        }),
      ],
      clusters: CLUSTERS,
      facets: [
        {
          facet_name: 'year',
          facet_value: '2026',
          facet_label: '2026',
          point_count: 1,
          paper_count: 1,
          cluster_count: 1,
          sort_key: '2026',
        },
      ],
    })

    expect(data.nodes).toHaveLength(2)
    expect(data.nodes[0]).toMatchObject({
      nodeKind: 'chunk',
      index: 11,
      id: 'chunk-1',
      paperTitle: 'A paper',
      citekey: 'Paper2026',
      clusterId: 3,
      isInBase: true,
      baseRank: 3001,
    })
    expect(data.nodes[1]).toMatchObject({
      nodeKind: 'chunk',
      index: 19,
      id: 'chunk-2',
      paperTitle: 'Another paper',
      citekey: 'PaperTwo2026',
      clusterId: 0,
      isInBase: false,
      baseRank: 0,
    })
    expect(data.stats).toEqual({
      points: 2,
      pointLabel: 'nodes',
      papers: 2,
      clusters: 1,
      noise: 1,
    })
    expect(data.facets).toHaveLength(1)
    expect(data.nodes[0].color).toMatch(/^(#[0-9a-f]{6}|rgba?\()/i)
    expect(data.paperNodes).toEqual([])
    expect(data.paperStats).toEqual({
      points: 0,
      pointLabel: 'papers',
      papers: 0,
      clusters: 0,
      noise: 0,
    })
  })
})

describe('buildPaperNodes', () => {
  it('builds PaperNode[] from GraphPointRow[] with nodeKind paper', () => {
    const rows: GraphPointRow[] = [
      graphRow({
        id: 'pn-1', node_id: 'pn-1', paper_id: 'paper-1',
        point_index: 7, x: 10, y: 20,
        cluster_id: 1, cluster_label: 'Cluster A', cluster_probability: 0.85,
        citekey: 'Auth2026', title: 'Great Paper', journal: 'Nature',
        year: 2026, doi: '10.1000/x',
        display_preview: 'Display preview text',
        is_in_base: true, base_rank: 3001,
        paper_author_count: 3, paper_reference_count: 10, paper_asset_count: 1,
      }),
      graphRow({
        id: 'pn-2', node_id: 'pn-2', paper_id: 'paper-2',
        point_index: 8, x: 30, y: 40,
        cluster_id: 0, cluster_probability: 0.1,
        is_in_base: false, base_rank: 0,
      }),
    ]

    const nodes = buildPaperNodes(rows)

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      nodeKind: 'paper',
      index: 7,
      id: 'pn-1',
      paperId: 'paper-1',
      paperTitle: 'Great Paper',
      displayPreview: 'Display preview text',
      payloadWasTruncated: false,
      isInBase: true,
      baseRank: 3001,
    })
    expect(nodes[0].color).toMatch(/^(#[0-9a-f]{6}|rgba?\()/i)

    expect(nodes[1]).toMatchObject({
      nodeKind: 'paper',
      index: 8,
      id: 'pn-2',
      payloadWasTruncated: false,
      isInBase: false,
      baseRank: 0,
    })
  })
})

describe('buildPaperStats', () => {
  it('computes paper stats with pointLabel papers', () => {
    const paperNodes = buildPaperNodes([
      graphRow({
        id: 'pn-1', node_id: 'pn-1', paper_id: 'p1', point_index: 0, x: 0, y: 0,
        cluster_id: 1, cluster_label: 'A', cluster_probability: 0.9,
        citekey: 'a', title: 'A',
        is_in_base: true, base_rank: 3001,
      }),
      graphRow({
        id: 'pn-2', node_id: 'pn-2', paper_id: 'p2', point_index: 1, x: 0, y: 0,
        cluster_id: 0, cluster_probability: 0,
        citekey: 'b', title: 'B',
        is_in_base: false, base_rank: 0,
      }),
    ])

    const clusters: ClusterInfo[] = [
      {
        clusterId: 0, label: 'Noise', labelMode: null, labelSource: null,
        memberCount: 1, centroidX: 0, centroidY: 0, representativeRagChunkId: null,
        candidateCount: null, entityCandidateCount: null, lexicalCandidateCount: null,
        meanClusterProbability: null, meanOutlierScore: null, paperCount: null, isNoise: true,
      },
      {
        clusterId: 1, label: 'Cluster A', labelMode: null, labelSource: null,
        memberCount: 1, centroidX: 0, centroidY: 0, representativeRagChunkId: null,
        candidateCount: null, entityCandidateCount: null, lexicalCandidateCount: null,
        meanClusterProbability: null, meanOutlierScore: null, paperCount: null, isNoise: false,
      },
    ]

    const stats = buildPaperStats(paperNodes, clusters)

    expect(stats).toEqual({
      points: 2,
      pointLabel: 'papers',
      papers: 2,
      clusters: 1,
      noise: 1,
    })
  })
})
