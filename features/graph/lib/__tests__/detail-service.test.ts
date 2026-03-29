import {
  clearDetailCache,
  fetchGraphNodeDetail,
  fetchGraphRagQuery,
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

describe('fetchGraphNodeDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearDetailCache()
  })

  it('calls the getGraphNodeDetail server action with the current bundle checksum', async () => {
    mockedGetGraphNodeDetail.mockResolvedValue({
      release: {
        graph_release_id: 'bundle-checksum',
        graph_run_id: 'run-id',
        bundle_checksum: 'bundle-checksum',
        graph_name: 'cosmograph',
        layer_key: 'paper',
        node_kind: 'paper',
        is_current: true,
      },
      node_id: 'paper-node',
      layer_key: 'paper',
      node_kind: 'paper',
      paper: null,
      chunk: null,
    } as never)

    const bundle = {
      bundleChecksum: 'bundle-checksum',
      runId: 'run-id',
    } as GraphBundle

    const node = {
      nodeKind: 'paper',
      id: 'paper-node',
    } as GraphNode

    const result = await fetchGraphNodeDetail({ bundle, node })

    expect(mockedGetGraphNodeDetail).toHaveBeenCalledWith({
      graph_release_id: 'bundle-checksum',
      layer_key: 'paper',
      node_id: 'paper-node',
    })
    expect(result.node_id).toBe('paper-node')
  })

  it('calls getGraphAssetUrl for signed asset refresh', async () => {
    mockedGetGraphAssetUrl.mockResolvedValue({
      meta: {
        request_id: 'req-1',
        generated_at: '2026-03-14T00:00:00Z',
        duration_ms: 12,
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
      node_id: 'paper-node',
      layer_key: 'paper',
      asset_id: 'asset-1',
      asset_type: 'pdf',
      storage_path: 'papers/hash/file.pdf',
      access: {
        access_kind: 'signed',
        url: 'https://example.test/file.pdf',
        issued_at: '2026-03-14T00:00:00Z',
        expires_in_seconds: 3600,
      },
    } as never)

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

    const result = await refreshGraphAssetUrl({ bundle, node, asset })

    expect(mockedGetGraphAssetUrl).toHaveBeenCalledWith({
      graph_release_id: 'bundle-checksum',
      layer_key: 'paper',
      node_id: 'paper-node',
      asset_id: 'asset-1',
      asset_type: 'pdf',
      storage_path: 'papers/hash/file.pdf',
      expires_in_seconds: undefined,
    })
    expect(result.access?.url).toBe('https://example.test/file.pdf')
  })

  it('calls getGraphRagQuery with selected node context', async () => {
    mockedGetGraphRagQuery.mockResolvedValue({
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
})
