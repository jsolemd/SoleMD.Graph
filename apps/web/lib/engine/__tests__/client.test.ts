import { postEngineBinary, postEngineJson } from '../client'

describe('engine client', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.resetAllMocks()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('returns an actionable message when the engine is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as typeof fetch

    await expect(postEngineJson('/api/v1/evidence/search', { query: 'test' })).rejects.toMatchObject({
      name: 'EngineApiError',
      status: 503,
      message: expect.stringContaining('Evidence engine unavailable'),
    })
  })

  it('formats FastAPI validation errors clearly', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        detail: [
          {
            loc: ['body', 'scope_mode'],
            msg: "Input should be 'global' or 'selection_only'",
          },
          {
            loc: ['body', 'selection_graph_paper_refs'],
            msg: 'Input should be a valid list',
          },
        ],
      }),
    } as Response) as typeof fetch

    await expect(postEngineJson('/api/v1/evidence/search', { query: 'test' })).rejects.toMatchObject({
      name: 'EngineApiError',
      status: 422,
      message:
        "body.scope_mode: Input should be 'global' or 'selection_only'; body.selection_graph_paper_refs: Input should be a valid list",
    })
  })

  it('preserves abort errors without rewriting them', async () => {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    global.fetch = jest.fn().mockRejectedValue(error) as typeof fetch

    await expect(postEngineJson('/api/v1/evidence/search', { query: 'test' })).rejects.toMatchObject({
      name: 'AbortError',
      message: 'The operation was aborted.',
    })
  })

  it('returns binary payloads for non-JSON engine endpoints', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.apache.arrow.stream',
        }),
      }),
    ) as typeof fetch

    await expect(
      postEngineBinary('/api/v1/graph/attach-points', {
        graph_release_id: 'release-1',
        graph_paper_refs: ['paper:7'],
      }),
    ).resolves.toEqual(new Uint8Array([7, 8, 9]))
  })
})
