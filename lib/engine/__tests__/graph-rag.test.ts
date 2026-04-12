import { buildEngineRagSearchRequest } from '../graph-rag'

describe('graph-rag request builder', () => {
  it('omits null and default noise from the stable engine request seam', () => {
    expect(
      buildEngineRagSearchRequest({
        graph_release_id: 'release-1',
        query: 'melatonin delirium',
        selected_layer_key: null,
        selected_node_id: null,
        selected_graph_paper_ref: null,
        selection_graph_paper_refs: null,
        selected_cluster_id: null,
        scope_mode: 'global',
        evidence_intent: null,
      }),
    ).toEqual({
      graph_release_id: 'release-1',
      query: 'melatonin delirium',
    })
  })

  it('normalizes graph selection inputs and preserves deliberate retrieval options', () => {
    expect(
      buildEngineRagSearchRequest({
        graph_release_id: 'release-1',
        query: 'melatonin delirium',
        selected_layer_key: 'paper',
        selected_node_id: ' paper-node-7 ',
        selected_graph_paper_ref: ' paper-7 ',
        selection_graph_paper_refs: [' paper-7 ', '', 'paper-9', 'paper-7'],
        selected_cluster_id: 42,
        scope_mode: 'selection_only',
        evidence_intent: 'support',
        k: 6,
        rerank_topn: 18,
        use_lexical: true,
        generate_answer: true,
      }),
    ).toEqual({
      graph_release_id: 'release-1',
      query: 'melatonin delirium',
      selected_layer_key: 'paper',
      selected_node_id: 'paper-node-7',
      selected_graph_paper_ref: 'paper-7',
      selection_graph_paper_refs: ['paper-7', 'paper-9'],
      selected_cluster_id: 42,
      scope_mode: 'selection_only',
      evidence_intent: 'support',
      k: 6,
      rerank_topn: 18,
      use_lexical: true,
      generate_answer: true,
    })
  })
})
