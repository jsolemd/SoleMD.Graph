import {
  refreshActivePointRuntimeTables,
  registerActivePointViews,
} from '../views/active-points'

jest.mock('../queries', () => ({
  queryRows: jest.fn(async () => [{ count: 7 }]),
}))

describe('active point runtime tables', () => {
  it('keeps startup on base aliases when no overlay runtime exists yet', async () => {
    const query = jest.fn(async () => undefined)

    await registerActivePointViews({ query } as never, 12)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE VIEW active_points_web AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM base_points_web')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE VIEW active_point_index_lookup_web AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM base_points_canvas_web')
    )
  })

  it('materializes overlay and active runtime tables only when the runtime refresh runs', async () => {
    const query = jest.fn(async () => undefined)

    await expect(
      refreshActivePointRuntimeTables({ query } as never, 12)
    ).resolves.toEqual({
      overlayCount: 7,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE TEMP TABLE overlay_points_canvas_runtime AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE TEMP TABLE overlay_points_query_runtime AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE TEMP TABLE active_point_index_lookup_runtime AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN active_point_index_lookup_web overlay_lookup')
    )
  })
})
