jest.mock('server-only', () => ({}))

const limitMock = jest.fn()
const realpathMock = jest.fn()
const statMock = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: limitMock,
          }),
        }),
      }),
    }),
  },
}))

jest.mock('@/lib/db/schema', () => ({
  graphRuns: {
    bundleChecksum: 'bundleChecksum',
    createdAt: 'createdAt',
    graphName: 'graphName',
    isCurrent: 'isCurrent',
    nodeKind: 'nodeKind',
    status: 'status',
  },
}))

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args) => args),
  desc: jest.fn((value) => value),
  eq: jest.fn((left, right) => [left, right]),
}))

jest.mock('node:fs/promises', () => ({
  realpath: (...args: unknown[]) => realpathMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}))

function createRow() {
  return {
    id: 'run-id',
    graphName: 'cosmograph',
    nodeKind: 'corpus',
    bundleUri: '/graph-bundles/current',
    bundleFormat: 'parquet-manifest',
    bundleVersion: '4',
    bundleChecksum: 'bundle-checksum',
    bundleBytes: 2048,
    bundleManifest: {
      bundle_format: 'parquet-manifest',
      bundle_profile: 'base',
      bundle_version: '4',
      contract: {
        artifact_sets: {
          base: ['base_points', 'base_clusters'],
          universe: [],
          evidence: [],
        },
        files: {},
      },
      created_at: null,
      duckdb_file: null,
      graph_name: 'cosmograph',
      graph_run_id: 'run-id',
      node_kind: 'corpus',
      tables: {
        base_clusters: {
          bytes: 128,
          columns: [],
          parquet_file: 'base_clusters.parquet',
          row_count: 831,
          schema: [],
          sha256: 'sha-clusters',
        },
        base_points: {
          bytes: 256,
          columns: [],
          parquet_file: 'base_points.parquet',
          row_count: 1000000,
          schema: [],
          sha256: 'sha-points',
        },
      },
    },
    qaSummary: null,
    createdAt: new Date('2026-04-09T00:00:00.000Z'),
  }
}

describe('graph bundle asset catalog caching', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    limitMock.mockResolvedValue([createRow()])
    realpathMock.mockImplementation(async (value: string) =>
      value === '/graph-bundles/current'
        ? '/mnt/solemd-graph/bundles/current'
        : '/mnt/solemd-graph/bundles'
    )
    statMock.mockImplementation(async (assetPath: string) => ({
      isFile: () => true,
      size: assetPath.endsWith('manifest.json') ? 64 : 512,
    }))
  })

  it('reuses one checksum-scoped asset catalog across repeated lookups', async () => {
    const { resolveGraphBundleAsset } = await import('../fetch')

    const first = await resolveGraphBundleAsset('bundle-checksum', 'base_points.parquet')
    const second = await resolveGraphBundleAsset('bundle-checksum', 'manifest.json')

    expect(limitMock).toHaveBeenCalledTimes(1)
    expect(statMock).toHaveBeenCalledTimes(3)
    expect(first).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/current/base_points.parquet',
      etag: '"bundle-checksum:base_points.parquet:sha-points"',
      size: 512,
    })
    expect(second).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/current/manifest.json',
      etag: '"bundle-checksum:manifest.json:64"',
      size: 64,
    })
  })
})
