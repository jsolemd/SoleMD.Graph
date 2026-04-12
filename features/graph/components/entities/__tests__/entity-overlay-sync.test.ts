import type { GraphBundleQueries } from '@/features/graph/types'
import { ENTITY_GRAPH_OVERLAY_PRODUCER } from '@/features/graph/lib/overlay-producers'
import { fetchGraphEntityOverlay } from '@/features/graph/lib/entity-service'

import { syncEntityOverlay } from '../entity-overlay-sync'

jest.mock('@/features/graph/lib/entity-service', () => ({
  fetchGraphEntityOverlay: jest.fn(),
}))

const fetchGraphEntityOverlayMock = jest.mocked(fetchGraphEntityOverlay)

function createQueries(): jest.Mocked<GraphBundleQueries> {
  return {
    setSelectedPointIndices: jest.fn(),
    setSelectedPointScopeSql: jest.fn(),
    getOverlayPointIds: jest.fn(),
    setOverlayProducerPointIds: jest.fn(async () => ({ overlayCount: 1 })),
    clearOverlayProducer: jest.fn(async () => ({ overlayCount: 0 })),
    setOverlayPointIds: jest.fn(),
    clearOverlay: jest.fn(),
    activateOverlay: jest.fn(),
    getClusterDetail: jest.fn(),
    getSelectionDetail: jest.fn(),
    getPaperDocument: jest.fn(),
    getSelectionScopeGraphPaperRefs: jest.fn(),
    getPaperNodesByGraphPaperRefs: jest.fn(),
    ensureGraphPaperRefsAvailable: jest.fn(async () => ({
      activeGraphPaperRefs: [],
      universePointIdsByGraphPaperRef: {
        'paper:1': 'overlay-1',
        'paper:2': 'overlay-2',
      },
      unresolvedGraphPaperRefs: [],
    })),
    getUniversePointIdsByGraphPaperRefs: jest.fn(),
    resolvePointSelection: jest.fn(),
    getTablePage: jest.fn(),
    getInfoSummary: jest.fn(),
    getCategoricalValues: jest.fn(),
    getNumericValues: jest.fn(),
    getInfoBars: jest.fn(),
    getInfoHistogram: jest.fn(),
    getFacetSummary: jest.fn(),
    getFacetSummaries: jest.fn(),
    getInfoBarsBatch: jest.fn(),
    getInfoHistogramsBatch: jest.fn(),
    getNumericStatsBatch: jest.fn(),
    searchPoints: jest.fn(),
    getVisibilityBudget: jest.fn(),
    getScopeCoordinates: jest.fn(),
    runReadOnlyQuery: jest.fn(),
    exportTableCsv: jest.fn(),
  } as jest.Mocked<GraphBundleQueries>
}

describe('entity-overlay-sync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('promotes explicit entity graph actions through the canonical overlay producer path', async () => {
    const queries = createQueries()
    queries.getPaperNodesByGraphPaperRefs.mockResolvedValue({
      'paper:1': { index: 7 },
      'paper:2': { index: 11 },
    } as never)
    fetchGraphEntityOverlayMock.mockResolvedValue({
      graphPaperRefs: ['paper:1', 'paper:2'],
    })

    await expect(
      syncEntityOverlay({
        queries,
        entityRefs: [
          {
            entityType: 'disease',
            sourceIdentifier: 'schizophrenia',
          },
        ],
        graphReleaseId: 'release-1',
      })
    ).resolves.toEqual({
      response: {
        graphPaperRefs: ['paper:1', 'paper:2'],
      },
      overlayPointIds: ['overlay-1', 'overlay-2'],
      selectedPointIndices: [7, 11],
    })

    expect(fetchGraphEntityOverlayMock).toHaveBeenCalledWith(
      {
        entityRefs: [
          {
            entityType: 'disease',
            sourceIdentifier: 'schizophrenia',
          },
        ],
        graphReleaseId: 'release-1',
      },
      { signal: undefined }
    )
    expect(queries.ensureGraphPaperRefsAvailable).toHaveBeenCalledWith(
      ['paper:1', 'paper:2'],
    )
    expect(queries.setOverlayProducerPointIds).toHaveBeenCalledWith({
      producerId: ENTITY_GRAPH_OVERLAY_PRODUCER,
      pointIds: ['overlay-1', 'overlay-2'],
    })
    expect(queries.getPaperNodesByGraphPaperRefs).toHaveBeenCalledWith([
      'paper:1',
      'paper:2',
    ])
    expect(queries.clearOverlayProducer).not.toHaveBeenCalled()
  })
})
