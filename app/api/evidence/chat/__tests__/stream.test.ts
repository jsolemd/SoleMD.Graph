import { parseGraphAskChatRequest } from '../stream'

// server-only is handled by next/jest; ai and feature imports are mocked below
jest.mock('ai', () => ({
  createUIMessageStream: jest.fn(() => new ReadableStream()),
}))

jest.mock('@/features/graph/lib/rag-chat', () => ({
  extractLatestUserText: jest.fn(() => null),
}))

jest.mock('@/lib/engine/graph-rag', () => ({
  searchGraphEvidence: jest.fn(),
  toGraphRagErrorResponse: jest.fn(),
}))

const BASE = {
  messages: [],
  graph_release_id: 'release-1',
  client_request_id: 0,
}

describe('parseGraphAskChatRequest', () => {
  it('accepts a minimal valid request', () => {
    expect(() => parseGraphAskChatRequest(BASE)).not.toThrow()
  })

  it('rejects a missing graph_release_id', () => {
    const { graph_release_id: _, ...rest } = BASE
    expect(() => parseGraphAskChatRequest(rest)).toThrow()
  })

  it('rejects an empty graph_release_id', () => {
    expect(() => parseGraphAskChatRequest({ ...BASE, graph_release_id: '' })).toThrow()
  })

  it('rejects an invalid selected_layer_key', () => {
    expect(() =>
      parseGraphAskChatRequest({ ...BASE, selected_layer_key: 'page' }),
    ).toThrow()
  })

  it('accepts valid layer keys', () => {
    expect(() =>
      parseGraphAskChatRequest({ ...BASE, selected_layer_key: 'paper' }),
    ).not.toThrow()
    expect(() =>
      parseGraphAskChatRequest({ ...BASE, selected_layer_key: 'chunk' }),
    ).not.toThrow()
    expect(() =>
      parseGraphAskChatRequest({ ...BASE, selected_layer_key: null }),
    ).not.toThrow()
  })

  it('rejects k below minimum (1)', () => {
    expect(() => parseGraphAskChatRequest({ ...BASE, k: 0 })).toThrow()
  })

  it('rejects k above maximum (50)', () => {
    expect(() => parseGraphAskChatRequest({ ...BASE, k: 51 })).toThrow()
  })

  it('rejects rerank_topn above maximum (200)', () => {
    expect(() => parseGraphAskChatRequest({ ...BASE, rerank_topn: 201 })).toThrow()
  })

  it('rejects a negative client_request_id', () => {
    expect(() =>
      parseGraphAskChatRequest({ ...BASE, client_request_id: -1 }),
    ).toThrow()
  })

  it('accepts a full request with all optional fields', () => {
    expect(() =>
      parseGraphAskChatRequest({
        ...BASE,
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'What are the mechanisms of delirium?' }],
          },
        ],
        selected_layer_key: 'paper',
        selected_node_id: 'node-1',
        selected_graph_paper_ref: 'paper:123',
        selected_paper_id: 'abc123',
        selection_graph_paper_refs: ['paper:1', 'paper:2'],
        selected_cluster_id: 7,
        scope_mode: 'selection_only',
        evidence_intent: 'support',
        k: 6,
        rerank_topn: 20,
        use_lexical: true,
        generate_answer: true,
        client_request_id: 42,
      }),
    ).not.toThrow()
  })

  it('parses 100 typical requests in under 50ms (no per-call overhead)', () => {
    const request = {
      ...BASE,
      messages: [
        { role: 'user' as const, parts: [{ type: 'text', text: 'melatonin and delirium' }] },
      ],
      selected_layer_key: 'paper' as const,
      k: 6,
      rerank_topn: 20,
      generate_answer: true,
      client_request_id: 1,
    }

    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      parseGraphAskChatRequest(request)
    }
    const elapsed = performance.now() - start

    // 100 Zod parses of a moderately complex schema should complete well under 50ms.
    // If this fails, Zod schema construction is happening per-call (regression).
    expect(elapsed).toBeLessThan(50)
  })
})
