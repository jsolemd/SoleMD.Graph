import { getPointIncludeColumns } from '../cosmograph-columns'

describe('cosmograph-columns', () => {
  it('includes timeline accessor column when timeline is visible', () => {
    expect(
      getPointIncludeColumns({
        layer: 'corpus',
        activePanel: 'info',
        showTimeline: true,
        filterColumns: [],
        timelineColumn: 'year',
        pointColorColumn: 'hexColor',
        pointSizeColumn: 'paperReferenceCount',
        pointLabelColumn: 'clusterLabel',
        positionXColumn: 'x',
        positionYColumn: 'y',
      })
    ).toEqual(['year'])
  })

  it('includes filter widget accessor columns', () => {
    const result = getPointIncludeColumns({
      layer: 'corpus',
      activePanel: 'info',
      showTimeline: false,
      filterColumns: [
        { column: 'relationCategories', type: 'categorical' },
        { column: 'paperReferenceCount', type: 'numeric' },
      ],
      timelineColumn: 'year',
      pointColorColumn: 'hexColor',
      pointSizeColumn: 'paperReferenceCount',
      pointLabelColumn: 'clusterLabel',
      positionXColumn: 'x',
      positionYColumn: 'y',
    })
    expect(result).toContain('relationCategories')
    expect(result).toContain('paperReferenceCount')
  })

  it('deduplicates columns across timeline and filters', () => {
    const result = getPointIncludeColumns({
      layer: 'corpus',
      activePanel: 'info',
      showTimeline: true,
      filterColumns: [{ column: 'year', type: 'numeric' }],
      timelineColumn: 'year',
      pointColorColumn: 'hexColor',
      pointSizeColumn: 'paperReferenceCount',
      pointLabelColumn: 'clusterLabel',
      positionXColumn: 'x',
      positionYColumn: 'y',
    })
    expect(result).toEqual(['year'])
  })

  it('returns empty when no timeline or filters are active', () => {
    expect(
      getPointIncludeColumns({
        layer: 'corpus',
        activePanel: null,
        showTimeline: false,
        filterColumns: [],
        timelineColumn: null,
        pointColorColumn: 'hexColor',
        pointSizeColumn: 'paperReferenceCount',
        pointLabelColumn: 'clusterLabel',
        positionXColumn: 'x',
        positionYColumn: 'y',
      })
    ).toEqual([])
  })
})
