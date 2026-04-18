import { getLayerConfig } from '../layers'

describe('layer config', () => {
  it('binds the corpus render path to the canonical current canvas aliases', () => {
    const config = getLayerConfig('corpus')

    expect(config.pointsTable).toBe('current_points_canvas_web')
    expect(config.linksTable).toBe('current_links_web')
  })
})
