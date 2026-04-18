import { mapGraphPointRow, type GraphPointSelectionRow } from '../queries/node-selection'

function selectionRow(overrides: Partial<GraphPointSelectionRow> = {}): GraphPointSelectionRow {
  return {
    index: 0,
    id: 'pt_001',
    paperId: 'paper_001',
    nodeRole: 'primary',
    color: '#ff0000',
    colorLight: '#ff6666',
    x: 1.0,
    y: 2.0,
    clusterId: 5,
    clusterLabel: 'Neuroscience',
    displayLabel: 'Smith 2024',
    paperTitle: 'A Great Paper',
    citekey: 'smith2024',
    journal: 'Nature',
    year: 2024,
    semanticGroups: 'Disorders',
    relationCategories: 'causes',
    textAvailability: 'full',
    paperAuthorCount: 3,
    paperReferenceCount: 42,
    paperEntityCount: 10,
    paperRelationCount: 5,
    isInBase: true,
    baseRank: 1,
    isOverlayActive: false,
    ...overrides,
  }
}

describe('mapGraphPointRow', () => {
  it('maps all fields from a fully populated row', () => {
    const result = mapGraphPointRow(selectionRow())
    expect(result.id).toBe('pt_001')
    expect(result.paperId).toBe('paper_001')
    expect(result.nodeKind).toBe('paper')
    expect(result.nodeRole).toBe('primary')
    expect(result.color).toBe('#ff0000')
    expect(result.colorLight).toBe('#ff6666')
    expect(result.x).toBe(1.0)
    expect(result.y).toBe(2.0)
    expect(result.clusterId).toBe(5)
    expect(result.clusterLabel).toBe('Neuroscience')
    expect(result.displayLabel).toBe('Smith 2024')
    expect(result.paperTitle).toBe('A Great Paper')
    expect(result.displayPreview).toBe('A Great Paper')
    expect(result.year).toBe(2024)
    expect(result.isInBase).toBe(true)
    expect(result.isOverlayActive).toBe(false)
  })

  it('defaults nodeRole to primary when null', () => {
    const result = mapGraphPointRow(selectionRow({ nodeRole: null }))
    expect(result.nodeRole).toBe('primary')
  })

  it('defaults clusterId to 0 when null', () => {
    const result = mapGraphPointRow(selectionRow({ clusterId: null }))
    expect(result.clusterId).toBe(0)
  })

  it('uses displayLabel as displayPreview when paperTitle is null', () => {
    const result = mapGraphPointRow(selectionRow({ paperTitle: null, displayLabel: 'Label' }))
    expect(result.displayPreview).toBe('Label')
  })

  it('defaults isInBase to false when null', () => {
    const result = mapGraphPointRow(selectionRow({ isInBase: null }))
    expect(result.isInBase).toBe(false)
  })

  it('defaults isOverlayActive to false when null', () => {
    const result = mapGraphPointRow(selectionRow({ isOverlayActive: null }))
    expect(result.isOverlayActive).toBe(false)
  })

  it('preserves overlay role', () => {
    const result = mapGraphPointRow(selectionRow({ nodeRole: 'overlay' }))
    expect(result.nodeRole).toBe('overlay')
  })

  it('handles null optional string fields', () => {
    const result = mapGraphPointRow(selectionRow({
      paperId: null,
      clusterLabel: null,
      displayLabel: null,
      paperTitle: null,
      citekey: null,
      journal: null,
      semanticGroups: null,
      relationCategories: null,
      textAvailability: null,
    }))
    expect(result.paperId).toBeNull()
    expect(result.clusterLabel).toBeNull()
    expect(result.displayPreview).toBeNull()
  })

  it('handles null optional numeric fields', () => {
    const result = mapGraphPointRow(selectionRow({
      year: null,
      paperAuthorCount: null,
      paperReferenceCount: null,
      paperEntityCount: null,
      paperRelationCount: null,
      baseRank: null,
    }))
    expect(result.year).toBeNull()
    expect(result.paperAuthorCount).toBeNull()
    expect(result.baseRank).toBeNull()
  })
})
