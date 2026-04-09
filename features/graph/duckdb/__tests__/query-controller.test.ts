import {
  executeReadOnlyQuery,
  queryClusterRows,
  queryCorpusPointSelection,
  queryCorpusTablePage,
  queryExemplarRows,
  queryPaperDetail,
  queryPaperNodesByGraphPaperRefs,
  queryPointSearch,
  queryUniversePointIdsByGraphPaperRefs,
} from '../queries'
import { maybeAttachGraphPaperRefs } from '../attachment'
import { createSessionQueryController } from '../session/query-controller'

jest.mock('../queries', () => {
  const actual = jest.requireActual('../queries')
  return {
    ...actual,
    executeReadOnlyQuery: jest.fn(),
    queryClusterRows: jest.fn(),
    queryCorpusPointSelection: jest.fn(),
    queryPointSearch: jest.fn(),
    queryCorpusTablePage: jest.fn(),
    queryExemplarRows: jest.fn(),
    queryPaperDetail: jest.fn(),
    queryPaperNodesByGraphPaperRefs: jest.fn(),
    queryUniversePointIdsByGraphPaperRefs: jest.fn(),
  }
})

jest.mock('../attachment', () => ({
  maybeAttachGraphPaperRefs: jest.fn(),
}))

const executeReadOnlyQueryMock = jest.mocked(executeReadOnlyQuery)
const queryClusterRowsMock = jest.mocked(queryClusterRows)
const queryCorpusPointSelectionMock = jest.mocked(queryCorpusPointSelection)
const queryPointSearchMock = jest.mocked(queryPointSearch)
const queryCorpusTablePageMock = jest.mocked(queryCorpusTablePage)
const queryExemplarRowsMock = jest.mocked(queryExemplarRows)
const queryPaperDetailMock = jest.mocked(queryPaperDetail)
const queryPaperNodesByGraphPaperRefsMock = jest.mocked(queryPaperNodesByGraphPaperRefs)
const queryUniversePointIdsByGraphPaperRefsMock = jest.mocked(queryUniversePointIdsByGraphPaperRefs)
const maybeAttachGraphPaperRefsMock = jest.mocked(maybeAttachGraphPaperRefs)

describe('createSessionQueryController', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queryPaperNodesByGraphPaperRefsMock.mockResolvedValue({})
    queryUniversePointIdsByGraphPaperRefsMock.mockResolvedValue({})
    maybeAttachGraphPaperRefsMock.mockResolvedValue(false)
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

  it('resolves point selections through the canonical active views', async () => {
    queryCorpusPointSelectionMock.mockResolvedValue({ id: 'point-1' } as never)

    const controller = createSessionQueryController({
      bundle: {} as never,
      conn: {} as never,
      ensureOptionalBundleTables: jest.fn(async () => undefined),
    })

    await controller.resolvePointSelection('corpus', { id: 'point-1' })

    expect(queryCorpusPointSelectionMock).toHaveBeenCalledTimes(1)
  })

  it('routes controller reads through the shared session views', async () => {
    executeReadOnlyQueryMock.mockResolvedValue({ columns: [], rows: [] } as never)
    queryClusterRowsMock.mockResolvedValue([] as never)
    queryExemplarRowsMock.mockResolvedValue([] as never)
    queryPaperDetailMock.mockResolvedValue([] as never)

    const controller = createSessionQueryController({
      bundle: {} as never,
      conn: {} as never,
      ensureOptionalBundleTables: jest.fn(async () => undefined),
    })

    await controller.runReadOnlyQuery('SELECT 1')
    await controller.getClusterDetail(1)
    await controller.getSelectionDetail({
      id: 'point-1',
      clusterId: 1,
      paperId: 'paper-1',
    } as never)

    expect(executeReadOnlyQueryMock).toHaveBeenCalledWith({} as never, 'SELECT 1')
    expect(queryClusterRowsMock).toHaveBeenCalledWith({} as never, 1)
    expect(queryPaperDetailMock).toHaveBeenCalledWith({} as never, 'paper-1')
  })

  it('prefers targeted attachment before hydrating the full universe table', async () => {
    const ensureOptionalBundleTables = jest.fn(async () => undefined)
    maybeAttachGraphPaperRefsMock.mockResolvedValue(true)
    queryUniversePointIdsByGraphPaperRefsMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        'paper:1': 'overlay-1',
      })

    const controller = createSessionQueryController({
      bundle: { bundleChecksum: 'bundle-1' } as never,
      conn: {} as never,
      ensureOptionalBundleTables,
    })

    await expect(
      controller.ensureGraphPaperRefsAvailable(['paper:1'])
    ).resolves.toEqual({
      activeGraphPaperRefs: [],
      universePointIdsByGraphPaperRef: {
        'paper:1': 'overlay-1',
      },
      unresolvedGraphPaperRefs: [],
    })

    expect(maybeAttachGraphPaperRefsMock).toHaveBeenCalledTimes(1)
    expect(ensureOptionalBundleTables).not.toHaveBeenCalled()
    expect(queryUniversePointIdsByGraphPaperRefsMock).toHaveBeenCalledTimes(2)
    expect(queryUniversePointIdsByGraphPaperRefsMock).toHaveBeenNthCalledWith(
      1,
      {} as never,
      ['paper:1']
    )
    expect(queryUniversePointIdsByGraphPaperRefsMock).toHaveBeenNthCalledWith(
      2,
      {} as never,
      ['paper:1']
    )
  })

  it('reuses already-local universe rows before re-attaching graph paper refs', async () => {
    const ensureOptionalBundleTables = jest.fn(async () => undefined)
    queryUniversePointIdsByGraphPaperRefsMock.mockResolvedValue({
      'paper:local': 'overlay-local',
    })

    const controller = createSessionQueryController({
      bundle: { bundleChecksum: 'bundle-1' } as never,
      conn: {} as never,
      ensureOptionalBundleTables,
    })

    await expect(
      controller.ensureGraphPaperRefsAvailable(['paper:local'])
    ).resolves.toEqual({
      activeGraphPaperRefs: [],
      universePointIdsByGraphPaperRef: {
        'paper:local': 'overlay-local',
      },
      unresolvedGraphPaperRefs: [],
    })

    expect(maybeAttachGraphPaperRefsMock).not.toHaveBeenCalled()
    expect(ensureOptionalBundleTables).not.toHaveBeenCalled()
    expect(queryUniversePointIdsByGraphPaperRefsMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the bundled universe table only for refs still unresolved after attachment', async () => {
    const ensureOptionalBundleTables = jest.fn(async () => undefined)
    maybeAttachGraphPaperRefsMock.mockResolvedValue(true)
    queryUniversePointIdsByGraphPaperRefsMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        'paper:2': 'overlay-2',
      })

    const controller = createSessionQueryController({
      bundle: { bundleChecksum: 'bundle-1' } as never,
      conn: {} as never,
      ensureOptionalBundleTables,
    })

    await expect(
      controller.ensureGraphPaperRefsAvailable(['paper:2'])
    ).resolves.toEqual({
      activeGraphPaperRefs: [],
      universePointIdsByGraphPaperRef: {
        'paper:2': 'overlay-2',
      },
      unresolvedGraphPaperRefs: [],
    })

    expect(maybeAttachGraphPaperRefsMock).toHaveBeenCalledTimes(1)
    expect(ensureOptionalBundleTables).toHaveBeenCalledTimes(1)
    expect(ensureOptionalBundleTables).toHaveBeenCalledWith(['universe_points'])
    expect(queryUniversePointIdsByGraphPaperRefsMock).toHaveBeenCalledTimes(3)
  })
})
