import {
  ATTACHED_UNIVERSE_POINTS_TABLE,
  initializeAttachedUniversePointTable,
  registerUniversePointView,
} from '../views/universe'

describe('universe point views', () => {
  it('creates the local attached universe temp table from canonical point columns', async () => {
    const query = jest.fn(async () => {})

    await initializeAttachedUniversePointTable({
      query,
    } as never)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`CREATE TEMP TABLE IF NOT EXISTS ${ATTACHED_UNIVERSE_POINTS_TABLE}`),
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM base_points'),
    )
  })

  it('unions bundle universe points with locally attached universe points', async () => {
    const query = jest.fn(async () => {})

    await registerUniversePointView(
      {
        query,
      } as never,
      {
        sourceTable: 'universe_points',
        selectCanvasSql: (sourceTable, indexSql) =>
          `SELECT ${indexSql} AS index FROM ${sourceTable}`,
        selectQuerySql: (sourceTable, indexSql) =>
          `SELECT ${indexSql} AS index FROM ${sourceTable}`,
      },
    )

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT * FROM universe_points'),
    )
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`SELECT * FROM ${ATTACHED_UNIVERSE_POINTS_TABLE}`),
    )
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UNION ALL'),
    )
  })
})
