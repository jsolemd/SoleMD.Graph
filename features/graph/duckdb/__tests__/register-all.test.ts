import { createEnsurePrimaryQueryTables } from '../views/register-all'
import { refreshActivePointRuntimeTables } from '../views/active-points'
import { registerBasePointsView, BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE } from '../views/base-points'
import { registerClusterViews, BASE_CLUSTER_RUNTIME_SOURCE_TABLE } from '../views/clusters'
import { materializeBundleParquetTables } from '../views/relations'

jest.mock('../views/active-points', () => ({
  refreshActivePointRuntimeTables: jest.fn(async () => ({ overlayCount: 0 })),
  registerActivePointViews: jest.fn(async () => undefined),
}))

jest.mock('../views/base-points', () => {
  const actual = jest.requireActual('../views/base-points')
  return {
    ...actual,
    registerBasePointsView: jest.fn(async () => undefined),
  }
})

jest.mock('../views/clusters', () => {
  const actual = jest.requireActual('../views/clusters')
  return {
    ...actual,
    registerClusterViews: jest.fn(async () => undefined),
  }
})

jest.mock('../views/relations', () => ({
  materializeBundleParquetTables: jest.fn(async () => undefined),
  resolveBundleRelations: jest.fn(async () => undefined),
}))

describe('createEnsurePrimaryQueryTables', () => {
  it('promotes the interactive runtime once and repoints both base and active views to the local runtime', async () => {
    const conn = {} as never
    const ensurePrimaryQueryTables = createEnsurePrimaryQueryTables(
      conn,
      {
        bundleManifest: {
          tables: {
            base_points: { rowCount: 1 },
            base_clusters: { rowCount: 1 },
          },
        },
        tableUrls: {
          base_points: '/base_points.parquet',
          base_clusters: '/base_clusters.parquet',
        },
      } as never,
      {
        attachedTableSet: new Set<string>(),
        availableLayers: ['corpus'],
        basePointCount: 12,
        buildPointCanvasProjectionSql: jest.fn(),
        buildPointQueryProjectionSql: jest.fn(),
      }
    )

    await ensurePrimaryQueryTables()
    await ensurePrimaryQueryTables()

    expect(materializeBundleParquetTables).toHaveBeenCalledTimes(1)
    expect(registerBasePointsView).toHaveBeenCalledWith(
      conn,
      expect.objectContaining({
        sourceTable: BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
      })
    )
    expect(registerClusterViews).toHaveBeenCalledWith(conn, BASE_CLUSTER_RUNTIME_SOURCE_TABLE)
    expect(refreshActivePointRuntimeTables).toHaveBeenCalledWith(conn, 12)
  })
})
