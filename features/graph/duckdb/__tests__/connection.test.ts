const mockSelectBundle = jest.fn()
const mockAsyncDuckDB = jest.fn()
const mockVoidLogger = jest.fn()

jest.mock('@duckdb/duckdb-wasm', () => ({
  selectBundle: mockSelectBundle,
  AsyncDuckDB: mockAsyncDuckDB,
  VoidLogger: mockVoidLogger,
}))

describe('createConnection', () => {
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL
  const originalWorker = global.Worker
  const originalWindow = global.window

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    global.window = {
      location: new URL('http://localhost:3000/'),
    } as Window & typeof globalThis
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
    global.Worker = originalWorker
    global.window = originalWindow
  })

  it('normalizes DuckDB worker assets onto the app origin before bootstrapping the worker', async () => {
    const query = jest.fn(async () => undefined)
    const conn = {
      query,
    }
    const instantiate = jest.fn(async () => undefined)
    const open = jest.fn(async () => undefined)
    const connect = jest.fn(async () => conn)
    const worker = {} as Worker

    mockSelectBundle.mockResolvedValue({
      mainModule: '/_next/static/chunks/duckdb-eh.wasm',
      mainWorker: '/_next/static/media/duckdb-browser-eh.worker.js',
      pthreadWorker: '/_next/static/media/duckdb-browser-coi.pthread.worker.js',
    })
    mockAsyncDuckDB.mockImplementation(() => ({
      instantiate,
      open,
      connect,
    }))
    URL.createObjectURL = jest.fn(() => 'blob:duckdb-worker')
    URL.revokeObjectURL = jest.fn()
    global.Worker = jest.fn(() => worker) as typeof Worker

    const { createConnection } = await import('../connection')
    await createConnection()

    const workerScript = await (URL.createObjectURL as jest.Mock).mock.calls[0][0].text()
    expect(workerScript).toContain(
      'importScripts("http://localhost:3000/_next/static/media/duckdb-browser-eh.worker.js");'
    )
    expect(instantiate).toHaveBeenCalledWith(
      'http://localhost:3000/_next/static/chunks/duckdb-eh.wasm',
      'http://localhost:3000/_next/static/media/duckdb-browser-coi.pthread.worker.js'
    )
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        maximumThreads: 1,
      })
    )
    expect(query).toHaveBeenCalledWith('PRAGMA enable_object_cache')
    expect(query).toHaveBeenCalledWith("SET preserve_insertion_order = false")
    expect(query).toHaveBeenCalledWith("SET memory_limit = '1500MB'")
    expect(query).toHaveBeenCalledWith('SET threads = 1')
  })
})
