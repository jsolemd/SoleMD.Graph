import {
  fetchGraphNodeDetail,
  fetchGraphRagQuery,
  refreshGraphAssetUrl,
} from '../../lib/graph/detail-service'
import { createBrowserClient } from '../../lib/supabase/client'
import type { GraphBundle, GraphNode } from '../../lib/graph/types'

jest.mock('../../lib/supabase/client', () => ({
  createBrowserClient: jest.fn(),
}))

const mockedCreateBrowserClient = createBrowserClient as jest.MockedFunction<typeof createBrowserClient>

describe('fetchGraphNodeDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('invokes the graph-node-detail edge function with the current bundle checksum', async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
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
      },
      error: null,
    })

    mockedCreateBrowserClient.mockReturnValue({
      functions: {
        invoke,
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

    const result = await fetchGraphNodeDetail({ bundle, node })

    expect(invoke).toHaveBeenCalledWith('graph-node-detail', {
      body: {
        graph_release_id: 'bundle-checksum',
        layer_key: 'paper',
        node_id: 'paper-node',
      },
    })
    expect(result.node_id).toBe('paper-node')
  })

  it('invokes graph-asset-url for signed asset refresh', async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
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
      },
      error: null,
    })

    mockedCreateBrowserClient.mockReturnValue({
      functions: {
        invoke,
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

    expect(invoke).toHaveBeenCalledWith('graph-asset-url', {
      body: {
        graph_release_id: 'bundle-checksum',
        layer_key: 'paper',
        node_id: 'paper-node',
        asset_id: 'asset-1',
        asset_type: 'pdf',
        storage_path: 'papers/hash/file.pdf',
        expires_in_seconds: undefined,
      },
    })
    expect(result.access?.url).toBe('https://example.test/file.pdf')
  })

  it('invokes graph-rag-query with selected node context', async () => {
    const invoke = jest.fn().mockResolvedValue({
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
      error: null,
    })

    mockedCreateBrowserClient.mockReturnValue({
      functions: {
        invoke,
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

    expect(invoke).toHaveBeenCalledWith('graph-rag-query', {
      body: {
        graph_release_id: 'bundle-checksum',
        query: 'What is the role of melatonin in delirium?',
        selected_layer_key: 'paper',
        selected_node_id: 'paper-node',
        selected_cluster_id: null,
        k: 6,
        rerank_topn: 18,
        use_lexical: true,
        generate_answer: true,
      },
    })
    expect(result.answer).toContain('Melatonin')
  })
})
