import { createUIMessageStream } from 'ai'
import { searchGraphEvidence } from '@solemd/api-client/server/graph-rag'
import {
  createGraphAskMessageStream,
  parseGraphAskChatRequest,
} from '../../../../app/api/evidence/chat/stream'

jest.mock('ai', () => ({
  createUIMessageStream: jest.fn(),
  isTextUIPart: (part: { type?: string }) => part.type === 'text',
}))

jest.mock('@solemd/api-client/server/graph-rag', () => ({
  searchGraphEvidence: jest.fn(),
  toGraphRagErrorResponse: jest.fn(() => ({
    error_code: 'engine_request_failed',
    error_message: 'failed',
    request_id: null,
    retry_after: null,
    status: 500,
  })),
}))

const mockedCreateUIMessageStream =
  createUIMessageStream as jest.MockedFunction<typeof createUIMessageStream>
const mockedSearchGraphEvidence =
  searchGraphEvidence as jest.MockedFunction<typeof searchGraphEvidence>

function createResponse() {
  return {
    meta: {
      request_id: 'req-1',
      generated_at: '2026-03-29T00:00:00Z',
      duration_ms: 1,
      cache_control: 'no-store',
      retrieval_version: 'baseline-postgres-v1',
    },
    release: {
      graph_release_id: 'release-1',
      graph_run_id: 'run-1',
      bundle_checksum: 'checksum-1',
      graph_name: 'cosmograph',
      layer_key: 'paper',
      node_kind: 'paper',
      is_current: true,
    },
    query: 'Does this support the claim?',
    selected_layer_key: 'paper',
    selected_node_id: 'paper-7',
    selected_graph_paper_ref: 'paper-7',
    selection_graph_paper_refs: ['paper-7', 'paper-9'],
    selected_cluster_id: null,
    scope_mode: 'selection_only',
    answer: 'Baseline answer',
    answer_model: 'baseline-extractive-v1',
    answer_graph_paper_refs: ['paper-7'],
    grounded_answer: null,
    evidence_bundles: [],
    graph_signals: [],
    retrieval_channels: [],
  }
}

describe('graph ask stream', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('preserves selection scope fields when parsing the chat request', () => {
    const parsed = parseGraphAskChatRequest({
      messages: [],
      graph_release_id: 'release-1',
      selected_graph_paper_ref: 'paper-7',
      selection_graph_paper_refs: ['paper-7', 'paper-9'],
      scope_mode: 'selection_only',
      client_request_id: 3,
    })

    expect(parsed.selection_graph_paper_refs).toEqual(['paper-7', 'paper-9'])
    expect(parsed.scope_mode).toBe('selection_only')
  })

  it('passes selection scope through to the backend evidence search', async () => {
    const writes: unknown[] = []
    mockedCreateUIMessageStream.mockImplementation(({ execute }) => {
      return {
        run: async () => {
          await execute({
            writer: {
              write: (chunk: unknown) => {
                writes.push(chunk)
              },
            },
          })
        },
      } as never
    })
    mockedSearchGraphEvidence.mockResolvedValue(createResponse() as never)

    const stream = createGraphAskMessageStream({
      request: parseGraphAskChatRequest({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Does this support the claim?' }],
          },
        ],
        graph_release_id: 'release-1',
        selected_layer_key: 'paper',
        selected_node_id: 'paper-7',
        selected_graph_paper_ref: 'paper-7',
        selection_graph_paper_refs: ['paper-7', 'paper-9'],
        scope_mode: 'selection_only',
        client_request_id: 11,
      }),
    }) as unknown as { run: () => Promise<void> }

    await stream.run()

    expect(mockedSearchGraphEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        graph_release_id: 'release-1',
        query: 'Does this support the claim?',
        selected_graph_paper_ref: 'paper-7',
        selection_graph_paper_refs: ['paper-7', 'paper-9'],
        scope_mode: 'selection_only',
      }),
      expect.any(Object),
    )
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'data-evidence-response',
          data: expect.objectContaining({
            client_request_id: 11,
          }),
        }),
      ]),
    )
  })
})
