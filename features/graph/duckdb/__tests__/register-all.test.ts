import {
  createEnsurePrimaryQueryTables,
  registerInitialSessionViews,
} from '../views/register-all'
import { refreshActivePointRuntimeTables } from '../views/active-points'
import {
  BASE_POINT_CANVAS_RUNTIME_SOURCE_TABLE,
  BASE_POINT_CANONICAL_SOURCE_TABLE,
  BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
  LOCAL_POINT_CANVAS_RUNTIME_COLUMNS,
  LOCAL_POINT_RUNTIME_COLUMNS,
  registerBasePointCanvasView,
  registerBasePointQueryViews,
} from '../views/base-points'
import { registerClusterViews, BASE_CLUSTER_RUNTIME_SOURCE_TABLE } from '../views/clusters'
import {
  materializeBundleParquetTables,
  resolveBundleRelations,
} from '../views/relations'
import {
  initializeAttachedUniversePointTable,
  registerUniverseLinksViews,
  registerUniversePointView,
} from '../views/universe'
import { initializeOverlayMembershipTable } from '../views/overlay'

jest.mock('../views/active-points', () => ({
  refreshActivePointRuntimeTables: jest.fn(async () => ({ overlayCount: 0 })),
  registerActivePointViews: jest.fn(async () => undefined),
}))

jest.mock('../views/base-points', () => {
  const actual = jest.requireActual('../views/base-points')
  return {
    ...actual,
    registerBasePointCanvasView: jest.fn(async () => undefined),
    registerBasePointQueryViews: jest.fn(async () => undefined),
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

jest.mock('../views/universe', () => ({
  initializeAttachedUniversePointTable: jest.fn(async () => undefined),
  registerUniverseLinksViews: jest.fn(async () => undefined),
  registerUniversePointView: jest.fn(async () => undefined),
}))

jest.mock('../views/overlay', () => ({
  initializeOverlayMembershipTable: jest.fn(async () => undefined),
}))

const registerBasePointCanvasViewMock = jest.mocked(registerBasePointCanvasView)
const registerBasePointQueryViewsMock = jest.mocked(registerBasePointQueryViews)
const initializeAttachedUniversePointTableMock = jest.mocked(
  initializeAttachedUniversePointTable
)
const initializeOverlayMembershipTableMock = jest.mocked(
  initializeOverlayMembershipTable
)
const registerUniverseLinksViewsMock = jest.mocked(registerUniverseLinksViews)
const registerUniversePointViewMock = jest.mocked(registerUniversePointView)
const resolveBundleRelationsMock = jest.mocked(resolveBundleRelations)

describe('registerInitialSessionViews', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('bootstraps local canvas and cluster runtime tables before exposing startup views', async () => {
    const conn = {} as never
    const bundle = {
      bundleManifest: {
        tables: {
          base_points: {
            columns: [...LOCAL_POINT_RUNTIME_COLUMNS],
            rowCount: 12,
          },
          base_clusters: {
            columns: [],
            rowCount: 3,
          },
        },
      },
      tableUrls: {
        base_points: '/base_points.parquet',
        base_clusters: '/base_clusters.parquet',
      },
    } as never

    await registerInitialSessionViews(conn, bundle, ['base_points', 'base_clusters'])

    expect(resolveBundleRelationsMock).toHaveBeenCalledWith(conn, bundle, [
      'base_points',
      'base_clusters',
    ])
    expect(materializeBundleParquetTables).toHaveBeenCalledWith(conn, bundle, [
      {
        tableName: BASE_POINT_CANONICAL_SOURCE_TABLE,
        runtimeTableName: BASE_POINT_CANVAS_RUNTIME_SOURCE_TABLE,
        selectedColumns: LOCAL_POINT_CANVAS_RUNTIME_COLUMNS,
      },
      {
        tableName: 'base_clusters',
        runtimeTableName: BASE_CLUSTER_RUNTIME_SOURCE_TABLE,
        selectedColumns: expect.any(Array),
      },
    ])
    expect(registerBasePointCanvasViewMock).toHaveBeenCalledWith(
      conn,
      expect.objectContaining({
        sourceTable: BASE_POINT_CANVAS_RUNTIME_SOURCE_TABLE,
      })
    )
    expect(registerBasePointQueryViewsMock).toHaveBeenCalledWith(
      conn,
      expect.objectContaining({
        sourceTable: BASE_POINT_CANONICAL_SOURCE_TABLE,
      })
    )
    expect(initializeAttachedUniversePointTableMock).toHaveBeenCalledWith(
      conn,
      BASE_POINT_CANONICAL_SOURCE_TABLE
    )
    expect(initializeOverlayMembershipTableMock).toHaveBeenCalledTimes(1)
    expect(registerUniversePointViewMock).toHaveBeenCalledTimes(1)
    expect(registerUniverseLinksViewsMock).toHaveBeenCalledTimes(1)
    expect(registerClusterViews).toHaveBeenCalledWith(
      conn,
      BASE_CLUSTER_RUNTIME_SOURCE_TABLE
    )
  })
})

describe('createEnsurePrimaryQueryTables', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('promotes the interactive query runtime once without re-pointing the canvas bootstrap path', async () => {
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
    expect(registerBasePointQueryViews).toHaveBeenCalledWith(
      conn,
      expect.objectContaining({
        sourceTable: BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
      })
    )
    expect(registerBasePointCanvasView).not.toHaveBeenCalled()
    expect(registerClusterViews).toHaveBeenCalledWith(conn, BASE_CLUSTER_RUNTIME_SOURCE_TABLE)
    expect(refreshActivePointRuntimeTables).toHaveBeenCalledWith(conn, 12)
  })
})
