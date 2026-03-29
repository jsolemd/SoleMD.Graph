import {
  buildPaperNoteMarkdown,
  findPaperNodeByPaperId,
  getPreferredPaperPreview,
} from '../helpers'

describe('detail panel helpers', () => {
  it('prefers a narrative display preview for paper preview text', () => {
    const preview = getPreferredPaperPreview({
      abstract: 'Short abstract.',
      displayPreview:
        'BACKGROUND\n\nDelirium is a common and serious syndrome that affects older adults and often requires multidisciplinary management.',
      nodeDisplayPreview: null,
    })

    expect(preview).toEqual({
      source: 'display',
      text: 'Delirium is a common and serious syndrome that affects older adults and often requires multidisciplinary management.',
    })
  })

  it('falls back to abstract when display preview is not narrative', () => {
    const preview = getPreferredPaperPreview({
      abstract:
        'Depression is one of the leading causes of disability worldwide and arises from interacting biological, psychological, and social mechanisms.',
      displayPreview: 'TITLE\n\nAUTHORS\n\nAFFILIATIONS',
      nodeDisplayPreview: null,
    })

    expect(preview).toEqual({
      source: 'abstract',
      text: 'Depression is one of the leading causes of disability worldwide and arises from interacting biological, psychological, and social mechanisms.',
    })
  })

  it('resolves graph nodes by canonical paper id', () => {
    const paperNode = findPaperNodeByPaperId(
      [
        {
          id: 'paper-node-1',
          paperId: 'paper-1',
        },
      ] as any,
      'paper-1'
    )

    expect(paperNode?.id).toBe('paper-node-1')
  })

  it('builds a copy-friendly markdown note for papers', () => {
    const markdown = buildPaperNoteMarkdown({
      nodeDisplayPreview: 'Preview text',
      paper: {
        title: 'A paper',
        journal: 'Journal',
        year: 2026,
        citekey: 'Smith2026',
        doi: '10.1000/example',
        abstract: null,
        authors: [{ name: 'Alice Author' }],
      } as any,
      paperDocument: {
        displayPreview:
          'This paper describes a clinically useful and graph-relevant summary paragraph for the selected paper.',
      } as any,
      servicePaper: {
        narrative_chunks: [{ preview: 'A strong supporting passage.' }],
      } as any,
    })

    expect(markdown).toContain('# A paper')
    expect(markdown).toContain('## Preview')
    expect(markdown).toContain('## Authors')
    expect(markdown).toContain('## Key Passages')
  })
})
