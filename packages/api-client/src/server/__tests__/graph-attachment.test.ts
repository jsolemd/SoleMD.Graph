import {
  fetchGraphPointAttachment,
  GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
} from '../graph-attachment'

describe('graph attachment engine helper', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.resetAllMocks()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('requests Arrow IPC point rows from the engine attachment endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'Content-Type': GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
        },
      }),
    ) as typeof fetch

    const bytes = await fetchGraphPointAttachment({
      graph_release_id: 'bundle-1',
      graph_paper_refs: ['paper:101'],
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8300/api/v1/graph/attach-points',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          graph_release_id: 'bundle-1',
          graph_paper_refs: ['paper:101'],
        }),
      }),
    )
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
  })
})
