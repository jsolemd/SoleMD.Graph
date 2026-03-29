import {
  clearDetailCache,
  fetchGraphNodeDetail,
  fetchGraphRagQuery,
  GraphRagRequestError,
  refreshGraphAssetUrl,
} from '../detail-service'
import {
  getGraphNodeDetail,
  getGraphAssetUrl,
  getGraphRagQuery,
} from '../../../../app/actions/graph'
import type { GraphBundle, GraphNode } from '../../types'

jest.mock('../../../../app/actions/graph', () => ({
  getGraphNodeDetail: jest.fn(),
  getGraphAssetUrl: jest.fn(),
  getGraphNeighborhood: jest.fn(),
  getGraphRagQuery: jest.fn(),
}))

const mockedGetGraphNodeDetail = getGraphNodeDetail as jest.MockedFunction<typeof getGraphNodeDetail>
const mockedGetGraphAssetUrl = getGraphAssetUrl as jest.MockedFunction<typeof getGraphAssetUrl>
const mockedGetGraphRagQuery = getGraphRagQuery as jest.MockedFunction<typeof getGraphRagQuery>

describe('detail-service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearDetailCache()
  })

  it('disables remote graph node detail for the corpus runtime', async () => {
    const bundle = {
      bundleChecksum: 'bundle-checksum',
      runId: 'run-id',
    } as GraphBundle

    const node = {
      nodeKind: 'paper',
      id: 'paper-node',
    } as GraphNode

    await expect(
      fetchGraphNodeDetail({ bundle, node })
    ).rejects.toThrow('Remote graph detail is not enabled for the corpus runtime')
    expect(mockedGetGraphNodeDetail).not.toHaveBeenCalled()
  })

  it('disables signed asset refresh for the corpus runtime', async () => {
    const bundle = {
      bundleChecksum: 'bundle-checksum',
      runId: 'run-id',
    } as GraphBundle

    const node = {
      nodeKind: 'paper',
      id: 'paper-node',
    } as GraphNode

    const asset = {
      asset_id: 'asset-1',
      asset_type: 'pdf',
      storage_path: 'papers/hash/file.pdf',
    } as never

    await expect(
      refreshGraphAssetUrl({ bundle, node, asset })
    ).rejects.toThrow('Remote graph asset URLs are not enabled for the corpus runtime')
    expect(mockedGetGraphAssetUrl).not.toHaveBeenCalled()
  })

  it('calls getGraphRagQuery with selected node context', async () => {
    mockedGetGraphRagQuery.mockResolvedValue({
      ok: true,
      data: {
        meta: {
          request_id: 'req-2',
          generated_at: '2026-03-14T00:00:00Z',
          duration_ms: 18,
          cache_control: 'no-store',
        },
        release: {
          graph_release_id: 'bundle-checksum',
          graph_run_id: 'run-id',
          bundle_checksum: 'bundle-checksum',
          graph_name: 'cosmograph',
          layer_key: 'paper',
          node_kind: 'paper',
          is_current: true,
        },
        query: 'What is the role of melatonin in delirium?',
        selected_layer_key: 'paper',
        selected_node_id: 'paper-node',
        selected_cluster_id: null,
        answer: 'Melatonin may reduce delirium risk in selected studies.',
        answer_model: 'gemini-test',
        results: [],
      },
    } as never)

    const bundle = {
      bundleChecksum: 'bundle-checksum',
      runId: 'run-id',
    } as GraphBundle

    const selectedNode = {
      nodeKind: 'paper',
      id: 'paper-node',
    } as GraphNode

    const result = await fetchGraphRagQuery({
      bundle,
      query: 'What is the role of melatonin in delirium?',
      selectedNode,
      k: 6,
      rerankTopn: 18,
      useLexical: true,
      generateAnswer: true,
    })

    expect(mockedGetGraphRagQuery).toHaveBeenCalledWith({
      graph_release_id: 'bundle-checksum',
      query: 'What is the role of melatonin in delirium?',
      selected_layer_key: 'paper',
      selected_node_id: 'paper-node',
      selected_paper_id: 'paper-node',
      selected_cluster_id: null,
      evidence_intent: null,
      k: 6,
      rerank_topn: 18,
      use_lexical: true,
      generate_answer: true,
    })
    expect(result.answer).toContain('Melatonin')
  })

  it('throws a typed graph rag request error when the server action returns an error envelope', async () => {
    mockedGetGraphRagQuery.mockResolvedValue({
      ok: false,
      error: {
        error_code: 'rate_limited',
        error_message: 'Rate limit exceeded',
        request_id: 'req-429',
        retry_after: 30,
        status: 429,
      },
    } as never)

    const bundle = {
      bundleChecksum: 'bundle-checksum',
      runId: 'run-id',
    } as GraphBundle

    await expect(
      fetchGraphRagQuery({
        bundle,
        query: 'What supports this claim?',
      }),
    ).rejects.toMatchObject<Partial<GraphRagRequestError>>({
      name: 'GraphRagRequestError',
      message: 'Rate limit exceeded',
      payload: {
        error_code: 'rate_limited',
        request_id: 'req-429',
        retry_after: 30,
        status: 429,
      },
    })
  })
})
