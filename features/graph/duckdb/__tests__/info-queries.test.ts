import {
  queryInfoBarsBatch,
  queryInfoSummary,
} from '../queries'
import { createSessionInfoQueries } from '../session/info-queries'

jest.mock('../queries', () => {
  const actual = jest.requireActual('../queries')
  return {
    ...actual,
    queryInfoBarsBatch: jest.fn(),
    queryInfoSummary: jest.fn(),
  }
})

const queryInfoBarsBatchMock = jest.mocked(queryInfoBarsBatch)
const queryInfoSummaryMock = jest.mocked(queryInfoSummary)

describe('createSessionInfoQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queryInfoSummaryMock.mockResolvedValue({
      totalCount: 10,
      scopedCount: 10,
      baseCount: 10,
      overlayCount: 0,
      scope: 'dataset',
      isSubset: false,
      hasSelection: false,
      papers: 10,
      clusters: 2,
      noise: 0,
      yearRange: null,
      topClusters: [],
    } as never)
    queryInfoBarsBatchMock.mockResolvedValue({
      journal: [{ value: 'Nature', count: 4 }],
    } as never)
  })

  it('keeps dataset summaries on canonical views without materializing the interactive runtime', async () => {
    const ensurePrimaryQueryTables = jest.fn(async () => undefined)
    const controller = createSessionInfoQueries({
      conn: {} as never,
      getDatasetTotalCount: () => 10,
      getOverlayRevision: () => 0,
      ensurePrimaryQueryTables,
    })

    await controller.getInfoSummary({
      layer: 'corpus',
      scope: 'dataset',
      currentPointScopeSql: null,
    })

    expect(queryInfoSummaryMock).toHaveBeenCalledTimes(1)
    expect(ensurePrimaryQueryTables).not.toHaveBeenCalled()
  })

  it('keeps dataset facet bars on canonical views without materializing the interactive runtime', async () => {
    const ensurePrimaryQueryTables = jest.fn(async () => undefined)
    const controller = createSessionInfoQueries({
      conn: {} as never,
      getDatasetTotalCount: () => 10,
      getOverlayRevision: () => 0,
      ensurePrimaryQueryTables,
    })

    await controller.getInfoBars({
      layer: 'corpus',
      scope: 'dataset',
      column: 'journal',
      maxItems: 8,
      currentPointScopeSql: null,
    })

    expect(queryInfoBarsBatchMock).toHaveBeenCalledTimes(1)
    expect(ensurePrimaryQueryTables).not.toHaveBeenCalled()
  })

  it('promotes scoped summaries through the interactive runtime', async () => {
    const ensurePrimaryQueryTables = jest.fn(async () => undefined)
    const controller = createSessionInfoQueries({
      conn: {} as never,
      getDatasetTotalCount: () => 10,
      getOverlayRevision: () => 0,
      ensurePrimaryQueryTables,
    })

    await controller.getInfoSummary({
      layer: 'corpus',
      scope: 'selected',
      currentPointScopeSql: null,
    })

    expect(queryInfoSummaryMock).toHaveBeenCalledTimes(1)
    expect(ensurePrimaryQueryTables).toHaveBeenCalledTimes(1)
  })
})
