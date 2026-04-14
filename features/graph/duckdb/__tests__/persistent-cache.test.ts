/**
 * @jest-environment jsdom
 */
import {
  canUsePersistentGraphDatabase,
  getPersistentGraphDatabasePath,
  markHotBundleCacheReady,
  prepareHotBundleCache,
} from '../persistent-cache'

const queryRowsMock = jest.fn()
const executeStatementMock = jest.fn()

jest.mock('../queries', () => ({
  executeStatement: (...args: unknown[]) => executeStatementMock(...args),
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
}))

function createBundle() {
  return {
    bundleChecksum: 'bundle-checksum',
    bundleManifest: {
      bundleVersion: '4',
    },
    bundleVersion: '4',
  }
}

describe('persistent graph cache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reuses the hot cache when metadata and tables match the active bundle', async () => {
    queryRowsMock
      .mockResolvedValueOnce([
        {
          bundle_checksum: 'bundle-checksum',
          bundle_version: '4',
          cache_schema_version: 1,
        },
      ])
      .mockResolvedValueOnce([
        { table_name: 'base_points' },
        { table_name: 'base_clusters' },
      ])

    const conn = { query: jest.fn(async () => undefined) }
    const result = await prepareHotBundleCache(conn as never, createBundle() as never)

    expect(result).toEqual({ reused: true })
    expect(conn.query).not.toHaveBeenCalledWith(expect.stringContaining('DROP TABLE'))
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE __graph_runtime_cache_meta')
    )
  })

  it('drops stale hot tables when the cached bundle metadata does not match', async () => {
    queryRowsMock
      .mockResolvedValueOnce([
        {
          bundle_checksum: 'old-checksum',
          bundle_version: '4',
          cache_schema_version: 1,
        },
      ])
      .mockResolvedValueOnce([
        { table_name: 'base_points' },
        { table_name: 'base_clusters' },
      ])

    const conn = { query: jest.fn(async () => undefined) }
    const result = await prepareHotBundleCache(conn as never, createBundle() as never)

    expect(result).toEqual({ reused: false })
    expect(conn.query).toHaveBeenCalledWith('DROP TABLE IF EXISTS base_points')
    expect(conn.query).toHaveBeenCalledWith('DROP TABLE IF EXISTS base_clusters')
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM __graph_runtime_cache_meta')
    )
  })

  it('marks the hot cache ready with the active checksum metadata', async () => {
    const conn = {}

    await markHotBundleCacheReady(conn as never, createBundle() as never)

    expect(executeStatementMock).toHaveBeenCalledWith(
      conn,
      expect.stringContaining('INSERT OR REPLACE INTO __graph_runtime_cache_meta'),
      ['hot_bundle', 'bundle-checksum', '4', 1]
    )
  })

  it('exposes the canonical OPFS database path when browser storage supports it', () => {
    const originalStorage = window.navigator.storage
    Object.defineProperty(window.navigator, 'storage', {
      configurable: true,
      value: { getDirectory: jest.fn() },
    })

    expect(canUsePersistentGraphDatabase()).toBe(true)
    expect(getPersistentGraphDatabasePath()).toBe('opfs://solemd-graph-runtime.duckdb')

    Object.defineProperty(window.navigator, 'storage', {
      configurable: true,
      value: originalStorage,
    })
  })
})
