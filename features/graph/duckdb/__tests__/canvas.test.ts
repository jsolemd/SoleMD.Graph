import { getCanvasPointCounts, registerActiveCanvasAliasViews } from '../canvas'

describe('getCanvasPointCounts', () => {
  it('combines base and overlay counts for the live canvas dataset', () => {
    expect(getCanvasPointCounts(12, 5)).toEqual({ corpus: 17 })
    expect(getCanvasPointCounts(12, -4)).toEqual({ corpus: 8 })
  })
})

describe('registerActiveCanvasAliasViews', () => {
  it('skips stable alias rewrites once slot targets are already current', async () => {
    const conn = {
      query: jest.fn(async () => undefined),
    }

    await registerActiveCanvasAliasViews(conn as never, {
      overlayRevision: 0,
      overlayCount: 0,
    })
    expect(conn.query).toHaveBeenCalledTimes(6)

    conn.query.mockClear()
    await registerActiveCanvasAliasViews(conn as never, {
      overlayRevision: 1,
      overlayCount: 7,
    })
    expect(conn.query).toHaveBeenCalledTimes(5)

    conn.query.mockClear()
    await registerActiveCanvasAliasViews(conn as never, {
      overlayRevision: 2,
      overlayCount: 9,
    })
    expect(conn.query).toHaveBeenCalledTimes(4)

    conn.query.mockClear()
    await registerActiveCanvasAliasViews(conn as never, {
      overlayRevision: 3,
      overlayCount: 11,
    })
    expect(conn.query).toHaveBeenCalledTimes(2)
    expect(conn.query).toHaveBeenNthCalledWith(
      1,
      `CREATE OR REPLACE VIEW current_points_canvas_web AS
     SELECT * FROM active_points_b_web`
    )
    expect(conn.query).toHaveBeenNthCalledWith(
      2,
      `CREATE OR REPLACE VIEW current_links_web AS
     SELECT * FROM active_links_b_web`
    )

    conn.query.mockClear()
    await registerActiveCanvasAliasViews(conn as never, {
      overlayRevision: 4,
      overlayCount: 0,
    })
    expect(conn.query).toHaveBeenCalledTimes(5)
    expect(conn.query.mock.calls.some(([sql]) => sql.includes('current_points_web'))).toBe(true)
  })
})
