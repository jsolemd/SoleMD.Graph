import { queryPointSearch } from '../queries'
import { createSessionQueryController } from '../session/query-controller'

jest.mock('../queries', () => {
  const actual = jest.requireActual('../queries')
  return {
    ...actual,
    queryPointSearch: jest.fn(),
  }
})

const queryPointSearchMock = jest.mocked(queryPointSearch)

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
})
