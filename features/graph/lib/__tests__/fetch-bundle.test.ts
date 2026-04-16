jest.mock('server-only', () => ({}))

const limitMock = jest.fn()

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

function createRow() {
  return {
    id: 'run-id',
    graphName: 'cosmograph',
    nodeKind: 'corpus',
    bundleUri: '/mnt/solemd-graph/bundles/by-checksum/bundle-checksum',
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

describe('fetch graph bundle', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.GRAPH_BUNDLE_QUERY_TIMEOUT_MS
    limitMock.mockResolvedValue([createRow()])
  })

  it('builds checksum-addressed bundle asset URLs for the frontend runtime', async () => {
    const { fetchActiveGraphBundle } = await import('../fetch')

    const bundle = await fetchActiveGraphBundle()

    expect(bundle.assetBaseUrl).toBe('/graph-bundles/bundle-checksum')
    expect(bundle.manifestUrl).toBe('/graph-bundles/bundle-checksum/manifest.json')
    expect(bundle.tableUrls.base_points).toBe(
      '/graph-bundles/bundle-checksum/base_points.parquet'
    )
    expect(bundle.tableUrls.base_clusters).toBe(
      '/graph-bundles/bundle-checksum/base_clusters.parquet'
    )
  })

  it('fails fast when the graph bundle lookup hangs', async () => {
    jest.useFakeTimers()
    process.env.GRAPH_BUNDLE_QUERY_TIMEOUT_MS = '25'
    limitMock.mockImplementation(() => new Promise(() => {}))

    try {
      const { fetchActiveGraphBundle } = await import('../fetch')
      const bundlePromise = fetchActiveGraphBundle()
      const rejection = expect(bundlePromise).rejects.toThrow(
        'Timed out resolving active graph bundle metadata after 25ms'
      )

      await jest.advanceTimersByTimeAsync(25)

      await rejection
    } finally {
      jest.useRealTimers()
    }
  })
})
