import { queryCorpusTablePage, queryPointSearch } from '../queries'
import { createSessionQueryController } from '../session/query-controller'

jest.mock('../queries', () => {
  const actual = jest.requireActual('../queries')
  return {
    ...actual,
    queryPointSearch: jest.fn(),
    queryCorpusTablePage: jest.fn(),
  }
})

const queryPointSearchMock = jest.mocked(queryPointSearch)
const queryCorpusTablePageMock = jest.mocked(queryCorpusTablePage)

describe('createSessionQueryController', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('evicts failed search cache entries so retries can recover', async () => {
    queryPointSearchMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ id: 'point-1' }] as never)

    const controller = createSessionQueryController({
      bundle: {} as never,
      conn: {} as never,
      ensureOptionalBundleTables: jest.fn(async () => undefined),
    })

    await expect(
      controller.searchPoints({
        layer: 'corpus',
        column: 'paper_title',
        query: 'alpha',
      })
    ).rejects.toThrow('boom')

    await expect(
      controller.searchPoints({
        layer: 'corpus',
        column: 'paper_title',
        query: 'alpha',
      })
    ).resolves.toEqual([{ id: 'point-1' }])

    expect(queryPointSearchMock).toHaveBeenCalledTimes(2)
  })

  it('clears overlay-dependent caches when reset is called', async () => {
    queryPointSearchMock.mockResolvedValue([{ id: 'point-1' }] as never)

    const controller = createSessionQueryController({
      bundle: {} as never,
      conn: {} as never,
      ensureOptionalBundleTables: jest.fn(async () => undefined),
    })

    await controller.searchPoints({
      layer: 'corpus',
      column: 'paper_title',
      query: 'alpha',
    })
    controller.resetOverlayDependentCaches()
    await controller.searchPoints({
      layer: 'corpus',
      column: 'paper_title',
      query: 'alpha',
    })

    expect(queryPointSearchMock).toHaveBeenCalledTimes(2)
  })

  it('caches dataset page-1 table queries and returns the same promise', async () => {
    queryCorpusTablePageMock.mockResolvedValue({ rows: [], totalCount: 0 } as never)

    const controller = createSessionQueryController({
      bundle: {} as never,
      conn: {} as never,
      ensureOptionalBundleTables: jest.fn(async () => undefined),
    })

    const args = {
      layer: 'corpus' as const,
      view: 'current' as const,
      page: 1,
      pageSize: 100,
      currentPointScopeSql: null,
    }

    const p1 = controller.getTablePage(args)
    const p2 = controller.getTablePage(args)

    expect(p1).toBe(p2)
    await p1
    expect(queryCorpusTablePageMock).toHaveBeenCalledTimes(1)
  })

  it('clears table page-1 cache on resetOverlayDependentCaches', async () => {
    queryCorpusTablePageMock.mockResolvedValue({ rows: [], totalCount: 0 } as never)

    const controller = createSessionQueryController({
      bundle: {} as never,
      conn: {} as never,
      ensureOptionalBundleTables: jest.fn(async () => undefined),
    })

    const args = {
      layer: 'corpus' as const,
      view: 'current' as const,
      page: 1,
      pageSize: 100,
      currentPointScopeSql: null,
    }

    await controller.getTablePage(args)
    controller.resetOverlayDependentCaches()
    await controller.getTablePage(args)

    expect(queryCorpusTablePageMock).toHaveBeenCalledTimes(2)
  })

  it('bypasses cache for non-page-1 and selection table queries', async () => {
    queryCorpusTablePageMock.mockResolvedValue({ rows: [], totalCount: 0 } as never)

    const controller = createSessionQueryController({
      bundle: {} as never,
      conn: {} as never,
      ensureOptionalBundleTables: jest.fn(async () => undefined),
    })

    // Page 2 — should not cache
    const page2Args = {
      layer: 'corpus' as const,
      view: 'current' as const,
      page: 2,
      pageSize: 100,
      currentPointScopeSql: null,
    }
    const p1 = controller.getTablePage(page2Args)
    const p2 = controller.getTablePage(page2Args)
    expect(p1).not.toBe(p2)

    // Selection view — should not cache
    const selectionArgs = {
      layer: 'corpus' as const,
      view: 'selected' as const,
      page: 1,
      pageSize: 100,
      currentPointScopeSql: null,
    }
    const p3 = controller.getTablePage(selectionArgs)
    const p4 = controller.getTablePage(selectionArgs)
    expect(p3).not.toBe(p4)

    await Promise.all([p1, p2, p3, p4])
    expect(queryCorpusTablePageMock).toHaveBeenCalledTimes(4)
  })
})
