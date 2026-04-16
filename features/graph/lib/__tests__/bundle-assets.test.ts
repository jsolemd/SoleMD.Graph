jest.mock('server-only', () => ({}))

let aliasExists = true
const realpathMock = jest.fn()
const statMock = jest.fn()
const symlinkMock = jest.fn()
const lstatMock = jest.fn()
const unlinkMock = jest.fn()
const limitMock = jest.fn()
const orderByMock = jest.fn(() => ({ limit: limitMock }))
const whereMock = jest.fn(() => ({ orderBy: orderByMock }))
const fromMock = jest.fn(() => ({ where: whereMock }))
const selectMock = jest.fn(() => ({ from: fromMock }))

jest.mock('node:fs/promises', () => ({
  lstat: (...args: unknown[]) => lstatMock(...args),
  realpath: (...args: unknown[]) => realpathMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
  symlink: (...args: unknown[]) => symlinkMock(...args),
  unlink: (...args: unknown[]) => unlinkMock(...args),
}))

jest.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (value: unknown) => value,
  eq: (...args: unknown[]) => args,
}))

jest.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}))

jest.mock('@/lib/db/schema', () => ({
  graphRuns: {
    bundleChecksum: 'bundle_checksum',
    bundleUri: 'bundle_uri',
    createdAt: 'created_at',
    graphName: 'graph_name',
    id: 'id',
    nodeKind: 'node_kind',
    status: 'status',
  },
}))

describe('bundle assets', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    aliasExists = true
    symlinkMock.mockImplementation(async () => {
      aliasExists = true
    })
    lstatMock.mockResolvedValue(null)
    unlinkMock.mockResolvedValue(undefined)
    limitMock.mockResolvedValue([])
    realpathMock.mockImplementation(async (value: string) => {
      if (value === '/mnt/solemd-graph/bundles') {
        return '/mnt/solemd-graph/bundles'
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum') {
        return '/mnt/solemd-graph/bundles/by-checksum'
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum') {
        if (!aliasExists) {
          throw new Error('missing')
        }
        return '/mnt/solemd-graph/bundles/run-id'
      }
      if (value === '/mnt/solemd-graph/bundles/run-id') {
        return '/mnt/solemd-graph/bundles/run-id'
      }
      return value
    })
    statMock.mockImplementation(async (assetPath: string) => ({
      isFile: () => assetPath.endsWith('.parquet') || assetPath.endsWith('.json'),
      mtimeMs: 1234,
      size: assetPath.endsWith('manifest.json') ? 64 : 512,
    }))
  })

  it('falls back to the logical published root when the checksum tree cannot be resolved on disk', async () => {
    aliasExists = false
    realpathMock.mockImplementation(async (value: string) => {
      if (value === '/mnt/solemd-graph/bundles') {
        return '/mnt/solemd-graph/bundles'
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum') {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum') {
        throw new Error('missing')
      }
      if (value === '/mnt/solemd-graph/bundles/run-id') {
        return '/mnt/solemd-graph/bundles/run-id'
      }
      return value
    })
    symlinkMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))
    limitMock.mockResolvedValue([
      {
        bundleUri: '/mnt/solemd-graph/bundles/run-id',
        graphRunId: 'run-id',
      },
    ])

    const { resolvePublishedGraphBundleAsset } = await import('../bundle-assets')

    const asset = await resolvePublishedGraphBundleAsset(
      'bundle-checksum',
      'base_points.parquet'
    )

    expect(asset).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-id/base_points.parquet',
      etag: '"bundle-checksum:base_points.parquet:512:1234"',
      size: 512,
    })
  })

  it('serves from the run directory when alias creation fails because the checksum tree is missing', async () => {
    aliasExists = false
    realpathMock.mockImplementation(async (value: string) => {
      if (value === '/mnt/solemd-graph/bundles') {
        return '/mnt/solemd-graph/bundles'
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum') {
        throw new Error('missing')
      }
      if (value === '/mnt/solemd-graph/bundles/run-id') {
        return '/mnt/solemd-graph/bundles/run-id'
      }
      return value
    })
    symlinkMock.mockRejectedValue(Object.assign(new Error('missing parent'), { code: 'ENOENT' }))
    limitMock.mockResolvedValue([
      {
        bundleUri: '/mnt/solemd-graph/bundles/run-id',
        graphRunId: 'run-id',
      },
    ])

    const { resolvePublishedGraphBundleAsset } = await import('../bundle-assets')

    const asset = await resolvePublishedGraphBundleAsset(
      'bundle-checksum',
      'base_points.parquet'
    )

    expect(asset).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-id/base_points.parquet',
      etag: '"bundle-checksum:base_points.parquet:512:1234"',
      size: 512,
    })
  })

  it('caches recovered bundle-directory resolution per checksum', async () => {
    aliasExists = false
    realpathMock.mockImplementation(async (value: string) => {
      if (value === '/mnt/solemd-graph/bundles') {
        return '/mnt/solemd-graph/bundles'
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }
      if (value === '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum') {
        throw new Error('missing')
      }
      if (value === '/mnt/solemd-graph/bundles/run-id') {
        return '/mnt/solemd-graph/bundles/run-id'
      }
      return value
    })
    symlinkMock.mockRejectedValue(Object.assign(new Error('missing parent'), { code: 'ENOENT' }))
    limitMock.mockResolvedValue([
      {
        bundleUri: '/mnt/solemd-graph/bundles/run-id',
        graphRunId: 'run-id',
      },
    ])

    const { resolvePublishedGraphBundleAsset } = await import('../bundle-assets')

    const [pointsAsset, manifestAsset] = await Promise.all([
      resolvePublishedGraphBundleAsset('bundle-checksum', 'base_points.parquet'),
      resolvePublishedGraphBundleAsset('bundle-checksum', 'manifest.json'),
    ])

    expect(pointsAsset).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-id/base_points.parquet',
      etag: '"bundle-checksum:base_points.parquet:512:1234"',
      size: 512,
    })
    expect(manifestAsset).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-id/manifest.json',
      etag: '"bundle-checksum:manifest.json:64:1234"',
      size: 64,
    })
    expect(selectMock).toHaveBeenCalledTimes(1)
  })

  it('resolves checksum-addressed published assets without querying graph-run state', async () => {
    const { resolvePublishedGraphBundleAsset } = await import('../bundle-assets')

    const asset = await resolvePublishedGraphBundleAsset(
      'bundle-checksum',
      'base_points.parquet'
    )

    expect(asset).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-id/base_points.parquet',
      etag: '"bundle-checksum:base_points.parquet:512:1234"',
      size: 512,
    })
    expect(selectMock).not.toHaveBeenCalled()
  })

  it('repairs a missing checksum alias from graph-run state before resolving the asset', async () => {
    aliasExists = false
    limitMock.mockResolvedValue([
      {
        bundleUri: '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum',
        graphRunId: 'run-id',
      },
    ])

    const { resolvePublishedGraphBundleAsset } = await import('../bundle-assets')
    const asset = await resolvePublishedGraphBundleAsset(
      'bundle-checksum',
      'base_points.parquet'
    )

    expect(asset).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-id/base_points.parquet',
      etag: '"bundle-checksum:base_points.parquet:512:1234"',
      size: 512,
    })
    expect(symlinkMock).toHaveBeenCalledWith(
      '../run-id',
      '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum',
      'dir'
    )
  })

  it('serves the asset from the graph-run bundle directory when alias repair is not writable', async () => {
    aliasExists = false
    symlinkMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))
    limitMock.mockResolvedValue([
      {
        bundleUri: '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum',
        graphRunId: 'run-id',
      },
    ])

    const { resolvePublishedGraphBundleAsset } = await import('../bundle-assets')
    const asset = await resolvePublishedGraphBundleAsset(
      'bundle-checksum',
      'base_points.parquet'
    )

    expect(asset).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-id/base_points.parquet',
      etag: '"bundle-checksum:base_points.parquet:512:1234"',
      size: 512,
    })
    expect(symlinkMock).toHaveBeenCalled()
  })

  it('returns null when the checksum alias does not exist and graph-run state cannot repair it', async () => {
    aliasExists = false

    const { resolvePublishedGraphBundleAsset } = await import('../bundle-assets')
    const asset = await resolvePublishedGraphBundleAsset(
      'bundle-checksum',
      'base_points.parquet'
    )

    expect(asset).toBeNull()
    expect(symlinkMock).not.toHaveBeenCalled()
  })
})
