import { getPointIncludeColumns } from '../cosmograph-columns'

describe('cosmograph-columns', () => {
  it('keeps Cosmograph on the dense render path without rich point metadata hydration', () => {
    expect(
      getPointIncludeColumns({
        layer: 'corpus',
        activePanel: 'info',
        showTimeline: true,
        filterColumns: [{ column: 'relationCategories', type: 'categorical' }],
        timelineColumn: 'year',
        pointColorColumn: 'hexColor',
        pointSizeColumn: 'paperReferenceCount',
        pointLabelColumn: 'clusterLabel',
        positionXColumn: 'x',
        positionYColumn: 'y',
      })
    ).toEqual([])
  })
})
