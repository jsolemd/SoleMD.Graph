import {
  getGraphPaperAttachmentProvider,
  maybeAttachGraphPaperRefs,
  registerGraphPaperAttachmentProvider,
} from '../attachment'

describe('graph paper attachment provider', () => {
  afterEach(() => {
    registerGraphPaperAttachmentProvider(null)
  })

  it('is a no-op when no provider is registered', async () => {
    await expect(
      maybeAttachGraphPaperRefs({
        bundle: { bundleChecksum: 'bundle-1' } as never,
        conn: {} as never,
        graphPaperRefs: ['paper-1'],
        ensureOptionalBundleTables: jest.fn(),
      }),
    ).resolves.toBe(false)
  })

  it('calls the registered provider for unresolved graph paper refs', async () => {
    const attachGraphPaperRefs = jest.fn(async () => {})
    registerGraphPaperAttachmentProvider({
      attachGraphPaperRefs,
    })

    const ensureOptionalBundleTables = jest.fn(async () => {})

    await expect(
      maybeAttachGraphPaperRefs({
        bundle: { bundleChecksum: 'bundle-1' } as never,
        conn: {} as never,
        graphPaperRefs: ['paper-1', 'paper-2'],
        ensureOptionalBundleTables,
      }),
    ).resolves.toBe(true)

    expect(getGraphPaperAttachmentProvider()).not.toBeNull()
    expect(attachGraphPaperRefs).toHaveBeenCalledWith({
      bundle: { bundleChecksum: 'bundle-1' },
      conn: {},
      graphPaperRefs: ['paper-1', 'paper-2'],
      ensureOptionalBundleTables,
    })
  })
})
