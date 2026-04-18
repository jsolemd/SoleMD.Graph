import { remoteGraphPaperAttachmentProvider } from '../remote-attachment'

describe('remote graph paper attachment provider', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fetches narrow point rows and merges them into the local attached universe table', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apache.arrow.stream',
        },
      }),
    )

    const query = jest.fn(async () => {})
    const insertArrowFromIPCStream = jest.fn(async () => {})

    await remoteGraphPaperAttachmentProvider.attachGraphPaperRefs({
      bundle: {
        bundleChecksum: 'bundle-1',
        runId: 'run-1',
        bundleManifest: {
          graphRunId: 'run-1',
        },
      } as never,
      conn: {
        query,
        insertArrowFromIPCStream,
      } as never,
      graphPaperRefs: ['paper:101', 'paper:101', 'corpus:303'],
      ensureOptionalBundleTables: jest.fn(),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/graph/attach-points',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          graph_release_id: 'bundle-1',
          graph_paper_refs: ['paper:101', 'corpus:303'],
        }),
      }),
    )
    expect(insertArrowFromIPCStream).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      {
        name: 'attached_universe_points_stage',
        create: true,
      },
    )
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS attached_universe_points_stage')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM attached_universe_points'),
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO attached_universe_points'),
    )
  })

  it('surfaces JSON attachment errors without hydrating point rows in JS', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Unknown graph release',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    await expect(
      remoteGraphPaperAttachmentProvider.attachGraphPaperRefs({
        bundle: {
          bundleChecksum: 'bundle-1',
          runId: 'run-1',
          bundleManifest: {
            graphRunId: 'run-1',
          },
        } as never,
        conn: {} as never,
        graphPaperRefs: ['paper:404'],
        ensureOptionalBundleTables: jest.fn(),
      }),
    ).rejects.toThrow('Unknown graph release')
  })
})
