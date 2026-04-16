/**
 * @jest-environment jsdom
 */
import { closeConnection, createConnection } from '../connection'

const selectBundleMock = jest.fn()
const instantiateMock = jest.fn(async () => undefined)
const openMock = jest.fn(async () => undefined)
const terminateMock = jest.fn(async () => undefined)
const flushFilesMock = jest.fn(async () => undefined)
const closePreparedStatementsMock = jest.fn(async () => undefined)
const queryMock = jest.fn(async () => undefined)
const connectionCloseMock = jest.fn(async () => undefined)
const connectMock = jest.fn(async () => ({
  close: connectionCloseMock,
  query: queryMock,
}))
let workerTerminateMock = jest.fn()

jest.mock('../queries/core', () => ({
  closePreparedStatements: (...args: unknown[]) =>
    closePreparedStatementsMock(...args),
}))

jest.mock('@duckdb/duckdb-wasm', () => {
  return {
    AsyncDuckDB: jest.fn().mockImplementation(() => ({
      connect: connectMock,
      flushFiles: flushFilesMock,
      instantiate: instantiateMock,
      open: openMock,
      terminate: terminateMock,
    })),
    DuckDBAccessMode: {
      READ_WRITE: 'READ_WRITE',
    },
    VoidLogger: jest.fn(),
    selectBundle: (...args: unknown[]) => selectBundleMock(...args),
  }
})

describe('createConnection', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalWorker = global.Worker
  const originalBlob = global.Blob

  beforeEach(() => {
    jest.clearAllMocks()
    workerTerminateMock = jest.fn()
    selectBundleMock.mockResolvedValue({
      mainModule: '/_next/static/media/duckdb-eh.test.wasm',
      mainWorker: '/_next/static/media/duckdb-browser-eh.worker.test.js',
      pthreadWorker: '/_next/static/media/duckdb-pthread.test.js',
    })
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    global.Worker = originalWorker
    global.Blob = originalBlob
  })

  it('normalizes relative DuckDB asset URLs before booting the blob worker', async () => {
    let capturedBlobParts: BlobPart[] | null = null
    global.Blob = jest.fn().mockImplementation((parts: BlobPart[]) => {
      capturedBlobParts = parts
      return { parts } as unknown as Blob
    }) as unknown as typeof Blob
    URL.createObjectURL = jest.fn(() => 'blob:test-worker')
    URL.revokeObjectURL = jest.fn()
    global.Worker = jest.fn().mockImplementation(() => ({
      terminate: workerTerminateMock,
    })) as unknown as typeof Worker

    await createConnection()

    expect(capturedBlobParts).not.toBeNull()
    expect(String(capturedBlobParts?.[0])).toContain(
      'importScripts("http://localhost/_next/static/media/duckdb-browser-eh.worker.test.js");'
    )
    expect(instantiateMock).toHaveBeenCalledWith(
      'http://localhost/_next/static/media/duckdb-eh.test.wasm',
      'http://localhost/_next/static/media/duckdb-pthread.test.js'
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-worker')
  })

  it('opens an in-memory DuckDB session instead of a direct OPFS database path', async () => {
    URL.createObjectURL = jest.fn(() => 'blob:test-worker')
    URL.revokeObjectURL = jest.fn()
    global.Worker = jest.fn().mockImplementation(() => ({
      terminate: workerTerminateMock,
    })) as unknown as typeof Worker

    await createConnection()

    expect(openMock).toHaveBeenCalledWith({
      accessMode: 'READ_WRITE',
      maximumThreads: 1,
      filesystem: {
        reliableHeadRequests: false,
      },
    })
    expect(queryMock).toHaveBeenNthCalledWith(1, 'PRAGMA enable_object_cache')
    expect(queryMock).toHaveBeenNthCalledWith(2, 'SET preserve_insertion_order = false')
    expect(queryMock).toHaveBeenNthCalledWith(3, "SET memory_limit = '1500MB'")
    expect(queryMock).toHaveBeenNthCalledWith(4, 'SET threads = 1')
  })

  it('cleans up the worker when bootstrap fails', async () => {
    URL.createObjectURL = jest.fn(() => 'blob:test-worker')
    URL.revokeObjectURL = jest.fn()
    global.Worker = jest.fn().mockImplementation(() => ({
      terminate: workerTerminateMock,
    })) as unknown as typeof Worker
    openMock.mockRejectedValueOnce(new Error('open failed'))

    await expect(createConnection()).rejects.toThrow('open failed')

    expect(terminateMock).toHaveBeenCalledTimes(1)
    expect(workerTerminateMock).toHaveBeenCalledTimes(1)
  })

  it('closes DuckDB and tears down the worker on dispose', async () => {
    const conn = {
      close: connectionCloseMock,
    } as never
    const db = {
      flushFiles: flushFilesMock,
      terminate: terminateMock,
    } as never
    const worker = {
      terminate: workerTerminateMock,
    } as Worker

    await closeConnection(conn, db, worker)

    expect(closePreparedStatementsMock).toHaveBeenCalledWith(conn)
    expect(flushFilesMock).toHaveBeenCalledTimes(1)
    expect(connectionCloseMock).toHaveBeenCalledTimes(1)
    expect(terminateMock).toHaveBeenCalledTimes(1)
    expect(workerTerminateMock).toHaveBeenCalledTimes(1)
  })
})
