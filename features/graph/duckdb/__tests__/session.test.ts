import { createGraphBundleSession } from '../session'
import {
  buildCanvasSource,
  getCanvasPointCounts,
  registerActiveCanvasAliasViews,
} from '../canvas'
import { createConnection } from '../connection'
import { queryRows } from '../queries'
import {
  clearAllOverlayPointIds,
  createEnsureOptionalBundleTables,
  initializeSelectedPointTable,
  materializeOverlayPointIds,
  registerInitialSessionViews,
  replaceOverlayProducerPointIds,
  replaceSelectedPointIndices,
  replaceSelectedPointIndicesFromScopeSql,
} from '../views'

jest.mock('../connection', () => ({
  closeConnection: jest.fn(async () => undefined),
  createConnection: jest.fn(),
}))

jest.mock('../canvas', () => ({
  buildCanvasSource: jest.fn(({ conn, db, pointCounts, overlayCount, overlayRevision }) => ({
    duckDBConnection: {
      connection: conn,
      duckdb: db,
    },
    overlayCount,
    overlayRevision,
    pointCounts,
  })),
  getCanvasPointCounts: jest.fn((basePointCount, overlayCount) => ({
    corpus: Math.max(0, basePointCount + overlayCount),
  })),
  registerActiveCanvasAliasViews: jest.fn(async () => undefined),
}))

jest.mock('../queries', () => {
  const actual = jest.requireActual('../queries')
  return {
    ...actual,
    queryRows: jest.fn(),
  }
})

jest.mock('../views', () => {
  const actual = jest.requireActual('../views')
  return {
    ...actual,
    clearAllOverlayPointIds: jest.fn(async () => undefined),
    createEnsureOptionalBundleTables: jest.fn(() => jest.fn(async () => undefined)),
    initializeSelectedPointTable: jest.fn(async () => undefined),
    materializeOverlayPointIds: jest.fn(async () => ({ overlayCount: 0 })),
    registerInitialSessionViews: jest.fn(async () => ({
      attachedTableSet: new Set<string>(),
      availableLayers: ['corpus'],
      basePointCount: 12,
      buildPointCanvasProjectionSql: jest.fn(),
      buildPointQueryProjectionSql: jest.fn(),
    })),
    replaceOverlayProducerPointIds: jest.fn(async () => ({ producerCount: 0 })),
    replaceSelectedPointIndices: jest.fn(async () => undefined),
    replaceSelectedPointIndicesFromScopeSql: jest.fn(async () => undefined),
  }
})

const createConnectionMock = jest.mocked(createConnection)
const buildCanvasSourceMock = jest.mocked(buildCanvasSource)
const getCanvasPointCountsMock = jest.mocked(getCanvasPointCounts)
const registerActiveCanvasAliasViewsMock = jest.mocked(registerActiveCanvasAliasViews)
const queryRowsMock = jest.mocked(queryRows)
const clearAllOverlayPointIdsMock = jest.mocked(clearAllOverlayPointIds)
const createEnsureOptionalBundleTablesMock = jest.mocked(createEnsureOptionalBundleTables)
const initializeSelectedPointTableMock = jest.mocked(initializeSelectedPointTable)
const materializeOverlayPointIdsMock = jest.mocked(materializeOverlayPointIds)
const registerInitialSessionViewsMock = jest.mocked(registerInitialSessionViews)
const replaceOverlayProducerPointIdsMock = jest.mocked(replaceOverlayProducerPointIds)
const replaceSelectedPointIndicesMock = jest.mocked(replaceSelectedPointIndices)
const replaceSelectedPointScopeSqlMock = jest.mocked(replaceSelectedPointIndicesFromScopeSql)

function createBundle() {
  return {
    bundleChecksum: 'bundle-checksum',
    bundleManifest: {
      contract: {
        artifactSets: {
          base: [],
        },
      },
      tables: {
        base_clusters: { rowCount: 1 },
        base_points: { rowCount: 1 },
      },
    },
  }
}

describe('createGraphBundleSession', () => {
  const conn = {
    close: jest.fn(async () => undefined),
    query: jest.fn(async () => undefined),
  }
  const db = {}
  const worker = { terminate: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()

    createConnectionMock.mockResolvedValue({
      conn: conn as never,
      db: db as never,
      worker: worker as never,
    })
    getCanvasPointCountsMock.mockImplementation((basePointCount, overlayCount) => ({
      corpus: Math.max(0, basePointCount + overlayCount),
    }))
    registerInitialSessionViewsMock.mockResolvedValue({
      attachedTableSet: new Set<string>(),
      availableLayers: ['corpus'],
      basePointCount: 12,
      buildPointCanvasProjectionSql: jest.fn(),
      buildPointQueryProjectionSql: jest.fn(),
    })
    createEnsureOptionalBundleTablesMock.mockReturnValue(jest.fn(async () => undefined))
    initializeSelectedPointTableMock.mockResolvedValue(undefined)
    materializeOverlayPointIdsMock.mockResolvedValue({ overlayCount: 7 })
    replaceOverlayProducerPointIdsMock.mockResolvedValue({ producerCount: 1 })
    replaceSelectedPointIndicesMock.mockResolvedValue(undefined)
    replaceSelectedPointScopeSqlMock.mockResolvedValue(undefined)
    clearAllOverlayPointIdsMock.mockResolvedValue(undefined)
    buildCanvasSourceMock.mockImplementation(
      ({ conn: connection, db: duckdb, pointCounts, overlayCount, overlayRevision }) => ({
        duckDBConnection: {
          connection,
          duckdb,
        },
        overlayCount,
        overlayRevision,
        pointCounts,
      })
    )
    queryRowsMock.mockImplementation(async (_connection, sql) => {
      if (sql.includes('FROM overlay_point_ids_by_producer')) {
        return []
      }

      if (sql.includes('FROM overlay_points_web')) {
        return [{ count: 99 }]
      }

      return []
    })
  })

  it('skips no-op selected-point table rewrites', async () => {
    const session = await createGraphBundleSession(createBundle() as never, jest.fn())

    await session.setSelectedPointIndices([3, 1, 3])
    await session.setSelectedPointIndices([1, 3])
    await session.setSelectedPointIndices([])
    await session.setSelectedPointIndices([])
    await session.setSelectedPointScopeSql('  clusterId > 0  ')
    await session.setSelectedPointScopeSql('clusterId > 0')
    await session.setSelectedPointScopeSql(null)
    await session.setSelectedPointScopeSql(null)

    expect(replaceSelectedPointIndicesMock).toHaveBeenCalledTimes(2)
    expect(replaceSelectedPointIndicesMock).toHaveBeenNthCalledWith(1, conn, [3, 1])
    expect(replaceSelectedPointIndicesMock).toHaveBeenNthCalledWith(2, conn, [])
    expect(replaceSelectedPointScopeSqlMock).toHaveBeenCalledTimes(2)
    expect(replaceSelectedPointScopeSqlMock).toHaveBeenNthCalledWith(1, conn, 'clusterId > 0')
    expect(replaceSelectedPointScopeSqlMock).toHaveBeenNthCalledWith(2, conn, null)
  })

  it('reuses materialized overlay counts when refreshing the canvas', async () => {
    const session = await createGraphBundleSession(createBundle() as never, jest.fn())

    await session.setOverlayPointIds(['point-1'])

    expect(materializeOverlayPointIdsMock).toHaveBeenCalledTimes(1)
    expect(replaceSelectedPointIndicesMock).not.toHaveBeenCalled()
    expect(
      queryRowsMock.mock.calls.filter(([, sql]) => sql.includes('FROM overlay_points_web'))
    ).toHaveLength(0)
    expect(registerActiveCanvasAliasViewsMock).toHaveBeenLastCalledWith(conn, {
      overlayCount: 7,
      overlayRevision: 1,
    })

    await session.clearOverlay()

    expect(clearAllOverlayPointIdsMock).toHaveBeenCalledTimes(1)
    expect(
      queryRowsMock.mock.calls.filter(([, sql]) => sql.includes('FROM overlay_points_web'))
    ).toHaveLength(0)
    expect(registerActiveCanvasAliasViewsMock).toHaveBeenLastCalledWith(conn, {
      overlayCount: 0,
      overlayRevision: 2,
    })
  })
})
