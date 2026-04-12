import {
  replaceSelectedPointIndices,
  SELECTED_POINT_INSERT_CHUNK_SIZE,
} from '../views/selection'

describe('replaceSelectedPointIndices', () => {
  it('chunks large direct-value inserts inside one transaction', async () => {
    const preparedCalls: Array<{ sql: string; params: unknown[] }> = []
    const conn = {
      prepare: jest.fn(async (sql: string) => ({
        close: jest.fn(async () => undefined),
        query: jest.fn(async (...params: unknown[]) => {
          preparedCalls.push({ sql, params })
        }),
      })),
      query: jest.fn(async () => undefined),
    }
    const pointIndices = Array.from(
      { length: SELECTED_POINT_INSERT_CHUNK_SIZE + 3 },
      (_, index) => index + 1
    )

    await replaceSelectedPointIndices(conn as never, pointIndices)

    expect(conn.query).toHaveBeenNthCalledWith(1, 'BEGIN TRANSACTION')
    expect(conn.query).toHaveBeenNthCalledWith(2, 'DELETE FROM selected_point_indices')
    expect(conn.query).toHaveBeenLastCalledWith('COMMIT')
    expect(conn.prepare).toHaveBeenCalledTimes(2)
    expect((conn.prepare.mock.calls[0]?.[0].match(/\?/g) ?? []).length).toBe(
      SELECTED_POINT_INSERT_CHUNK_SIZE
    )
    expect((conn.prepare.mock.calls[1]?.[0].match(/\?/g) ?? []).length).toBe(3)
    expect(preparedCalls).toEqual([
      {
        sql: conn.prepare.mock.calls[0]?.[0],
        params: pointIndices.slice(0, SELECTED_POINT_INSERT_CHUNK_SIZE),
      },
      {
        sql: conn.prepare.mock.calls[1]?.[0],
        params: pointIndices.slice(SELECTED_POINT_INSERT_CHUNK_SIZE),
      },
    ])
  })

  it('rolls back the transaction when a chunk insert fails', async () => {
    const conn = {
      prepare: jest.fn(async () => ({
        close: jest.fn(async () => undefined),
        query: jest.fn(async () => {
          throw new Error('chunk insert failed')
        }),
      })),
      query: jest.fn(async () => undefined),
    }

    await expect(
      replaceSelectedPointIndices(conn as never, [1, 2, 3, 4, 5, 6, 7, 8, 9])
    ).rejects.toThrow('chunk insert failed')

    expect(conn.query).toHaveBeenNthCalledWith(1, 'BEGIN TRANSACTION')
    expect(conn.query).toHaveBeenNthCalledWith(2, 'DELETE FROM selected_point_indices')
    expect(conn.query).toHaveBeenLastCalledWith('ROLLBACK')
    expect(conn.query).not.toHaveBeenCalledWith('COMMIT')
  })
})
