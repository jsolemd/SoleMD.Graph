import {
  getColumnsForLayer,
  getRenderableColumnsForLayer,
} from '../columns'

describe('renderable columns', () => {
  it('keeps render config on compact canvas-safe columns', () => {
    const renderable = getRenderableColumnsForLayer('corpus').map((column) => column.key)
    const queryColumns = getColumnsForLayer('corpus').map((column) => column.key)

    expect(renderable).toEqual(
      expect.arrayContaining([
        'clusterLabel',
        'paperReferenceCount',
        'displayLabel',
        'paperTitle',
      ])
    )
    expect(renderable).not.toEqual(expect.arrayContaining([
      'semanticGroups',
      'organSystems',
      'relationCategories',
      'textAvailability',
    ]))
    expect(queryColumns).toEqual(expect.arrayContaining([
      'semanticGroups',
      'organSystems',
      'relationCategories',
      'textAvailability',
    ]))
  })
})
