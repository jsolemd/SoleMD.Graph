import { queryRows } from '../queries/core'
import { queryInfoHistogramsBatch } from '../queries/summary'

jest.mock('../queries/core', () => ({
  queryRows: jest.fn(),
}))

const queryRowsMock = jest.mocked(queryRows)

describe('queryInfoHistogramsBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queryRowsMock.mockResolvedValue([])
  })

  it('qualifies stats.column_key when manual bounds are joined', async () => {
    await queryInfoHistogramsBatch({} as never, {
      layer: 'corpus',
      scope: 'dataset',
      columns: ['year'],
      bins: 16,
      currentPointScopeSql: null,
    })

    const sql = queryRowsMock.mock.calls[0]?.[1]
    expect(sql).toBeDefined()
    expect(sql).toMatch(/bounds AS \(\s+SELECT\s+stats\.column_key,/s)
    expect(sql).toContain('ON manual_bounds.column_key = stats.column_key')
  })
})
