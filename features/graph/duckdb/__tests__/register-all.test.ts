import {
  createEnsurePrimaryQueryTables,
  type SessionViewState,
} from '../views/register-all'

describe('createEnsurePrimaryQueryTables', () => {
  it('materializes the interactive runtime from local canonical tables instead of parquet', async () => {
    const query = jest.fn(async () => undefined)
    const ensurePrimaryQueryTables = createEnsurePrimaryQueryTables(
      {
        query,
      } as never,
      {} as never,
      {
        attachedTableSet: new Set(['base_points', 'base_clusters']),
        availableLayers: ['corpus'],
        basePointCount: 1,
        buildPointCanvasProjectionSql: jest.fn(),
        buildPointQueryProjectionSql: jest.fn(
          (sourceTable: string) => `SELECT point_index AS index FROM ${sourceTable}`
        ),
      } satisfies SessionViewState
    )

    await ensurePrimaryQueryTables()

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'CREATE TEMP TABLE IF NOT EXISTS base_points_query_runtime AS'
      )
    )
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM base_points')
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'CREATE TEMP TABLE IF NOT EXISTS base_clusters_runtime AS'
      )
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM base_clusters')
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('FROM base_points_query_runtime')
    )
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('FROM base_clusters_runtime')
    )
  })
})
