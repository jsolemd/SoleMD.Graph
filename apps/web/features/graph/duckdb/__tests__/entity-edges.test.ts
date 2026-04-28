import {
  ORB_ENTITY_EDGES_CURRENT_VIEW,
  registerOrbEntityEdgeViews,
} from '../views/entity-edges'

describe('registerOrbEntityEdgeViews', () => {
  it('creates an empty current entity-edge view when the optional table is absent', async () => {
    const query = jest.fn(async () => undefined)

    await registerOrbEntityEdgeViews({ query } as never, {
      entityEdgesTable: null,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`CREATE OR REPLACE VIEW ${ORB_ENTITY_EDGES_CURRENT_VIEW}`),
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE false'),
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('source_bitmap'),
    )
  })

  it('projects entity edges through active point indices when the table is attached', async () => {
    const query = jest.fn(async () => undefined)

    await registerOrbEntityEdgeViews({ query } as never, {
      entityEdgesTable: 'orb_entity_edges',
    })

    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('FROM orb_entity_edges e')
    expect(sql).toContain('JOIN active_point_index_lookup_web src')
    expect(sql).toContain('JOIN active_point_index_lookup_web dst')
    expect(sql).toContain("'entity' AS link_kind")
  })
})
