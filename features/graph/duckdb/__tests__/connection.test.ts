/**
 * @jest-environment jsdom
 */
import { createConnection } from '../connection'

const selectBundleMock = jest.fn()
const instantiateMock = jest.fn(async () => undefined)
const openMock = jest.fn(async () => undefined)
const queryMock = jest.fn(async () => undefined)
const connectMock = jest.fn(async () => ({ query: queryMock }))

jest.mock('@duckdb/duckdb-wasm', () => {
  return {
    AsyncDuckDB: jest.fn().mockImplementation(() => ({
      connect: connectMock,
      instantiate: instantiateMock,
      open: openMock,
    })),
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
    URL.createObjectURL = jest.fn((blob: Blob) => {
      return 'blob:test-worker'
    })
    URL.revokeObjectURL = jest.fn()
    global.Worker = jest.fn().mockImplementation(() => ({})) as unknown as typeof Worker

    await createConnection()

    expect(capturedBlobParts).not.toBeNull()
    expect(String(capturedBlobParts?.[0])).toContain(
      'importScripts("http://localhost/_next/static/media/duckdb-browser-eh.worker.test.js");'
    )
    expect(instantiateMock).toHaveBeenCalledWith(
      'http://localhost/_next/static/media/duckdb-eh.test.wasm',
      'http://localhost/_next/static/media/duckdb-pthread.test.js'
    )
  })
})
