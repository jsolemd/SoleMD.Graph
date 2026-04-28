import { queryRows } from '../queries/core'
import {
  queryInfoHistogramsBatch,
  queryNumericColumnValues,
} from '../queries/histograms'

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

describe('queryNumericColumnValues', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queryRowsMock.mockResolvedValue([
      { value: 2020 },
      { value: '2021' },
      { value: null },
      { value: Number.NaN },
    ])
  })

  it('returns finite numeric values from a safe numeric column', async () => {
    const values = await queryNumericColumnValues({} as never, {
      layer: 'corpus',
      scope: 'current',
      column: 'year',
      currentPointScopeSql: 'year >= 2020',
    })

    expect(values).toEqual([2020, 2021])
    expect(queryRowsMock).toHaveBeenCalledWith(
      {} as never,
      expect.stringContaining('WHERE year >= 2020'),
    )
  })

  it('does not query unsupported nonnumeric columns', async () => {
    const values = await queryNumericColumnValues({} as never, {
      layer: 'corpus',
      scope: 'dataset',
      column: 'journal',
      currentPointScopeSql: null,
    })

    expect(values).toEqual([])
    expect(queryRowsMock).not.toHaveBeenCalled()
  })
})
