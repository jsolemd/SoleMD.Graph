jest.mock('server-only', () => ({}))

type GraphRunDbRow = {
  bundleBytes: number | string | null
  bundleChecksum: string
  bundleFormat: string
  bundleManifest: Record<string, unknown> | null
  bundleUri: string
  bundleVersion: string
  createdAt: Date
  graphName: string
  id: string
  nodeKind: string
  qaSummary: Record<string, unknown> | null
}

function createGraphRunRow(): GraphRunDbRow {
  return {
    id: 'run-123',
    graphName: 'cosmograph',
    nodeKind: 'corpus',
    bundleUri: '/mnt/solemd-graph/bundles/run-123',
    bundleFormat: 'parquet',
    bundleVersion: '4',
    bundleChecksum: 'checksum-123',
    bundleBytes: 100,
    bundleManifest: {
      bundle_version: '4',
      graph_name: 'cosmograph',
      node_kind: 'corpus',
      graph_run_id: 'run-123',
      tables: {
        base_points: {
          parquet_file: 'base_points.parquet',
          sha256: 'points-sha',
          bytes: 130633442,
          row_count: 1000,
          columns: ['point_index', 'id'],
          schema: [],
        },
        base_clusters: {
          parquet_file: 'base_clusters.parquet',
          sha256: 'clusters-sha',
          bytes: 2048,
          row_count: 20,
          columns: ['cluster_id'],
          schema: [],
        },
      },
    },
    qaSummary: null,
    createdAt: new Date('2026-04-09T00:00:00.000Z'),
  }
}

describe('resolveGraphBundleAsset', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('reuses one immutable asset catalog per checksum', async () => {
    const row = createGraphRunRow()
    const limit = jest.fn(async () => [row])
    const select = jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit,
          })),
        })),
      })),
    }))
    const realpath = jest.fn(async (value: string) => value)
    const stat = jest.fn(async (assetPath: string) => ({
      isFile: () => true,
      size: assetPath.endsWith('manifest.json') ? 88 : assetPath.endsWith('base_clusters.parquet') ? 2048 : 130633442,
    }))

    jest.doMock('@/lib/db', () => ({
      db: { select },
    }))
    jest.doMock('@/lib/db/schema', () => ({
      graphRuns: {
        graphName: 'graphName',
        nodeKind: 'nodeKind',
        status: 'status',
        isCurrent: 'isCurrent',
        createdAt: 'createdAt',
        bundleChecksum: 'bundleChecksum',
      },
    }))
    jest.doMock('drizzle-orm', () => ({
      and: (...args: unknown[]) => args,
      desc: (value: unknown) => value,
      eq: (left: unknown, right: unknown) => [left, right],
    }))
    jest.doMock('node:fs/promises', () => ({
      realpath,
      stat,
    }))

    const { resolveGraphBundleAsset } = await import('../fetch')

    const first = await resolveGraphBundleAsset(row.bundleChecksum, 'base_points.parquet')
    const second = await resolveGraphBundleAsset(row.bundleChecksum, 'base_points.parquet')

    expect(first).toEqual({
      assetPath: '/mnt/solemd-graph/bundles/run-123/base_points.parquet',
      etag: '"checksum-123:base_points.parquet:points-sha"',
      size: 130633442,
    })
    expect(second).toEqual(first)
    expect(select).toHaveBeenCalledTimes(1)
    expect(realpath).toHaveBeenCalledTimes(2)
    expect(stat).toHaveBeenCalledTimes(3)
  })

  it('returns null for assets outside the canonical manifest', async () => {
    const row = createGraphRunRow()
    const limit = jest.fn(async () => [row])
    const select = jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit,
          })),
        })),
      })),
    }))

    jest.doMock('@/lib/db', () => ({
      db: { select },
    }))
    jest.doMock('@/lib/db/schema', () => ({
      graphRuns: {
        graphName: 'graphName',
        nodeKind: 'nodeKind',
        status: 'status',
        isCurrent: 'isCurrent',
        createdAt: 'createdAt',
        bundleChecksum: 'bundleChecksum',
      },
    }))
    jest.doMock('drizzle-orm', () => ({
      and: (...args: unknown[]) => args,
      desc: (value: unknown) => value,
      eq: (left: unknown, right: unknown) => [left, right],
    }))
    jest.doMock('node:fs/promises', () => ({
      realpath: jest.fn(async (value: string) => value),
      stat: jest.fn(async () => ({
        isFile: () => true,
        size: 1,
      })),
    }))

    const { resolveGraphBundleAsset } = await import('../fetch')

    await expect(
      resolveGraphBundleAsset(row.bundleChecksum, 'not-in-contract.parquet')
    ).resolves.toBeNull()
    expect(select).toHaveBeenCalledTimes(1)
  })
})
