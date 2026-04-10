/**
 * Unit tests for the callouts remark plugin.
 */
import type { Root, Blockquote, Paragraph, Text } from 'mdast'
import { remarkCallouts } from '../remark-callouts'

function makeCalloutTree(lines: string[]): Root {
  // Simulate a blockquote with paragraph children as remark-parse would produce
  const paragraphs: Paragraph[] = lines.map((line) => ({
    type: 'paragraph' as const,
    children: [{ type: 'text' as const, value: line }],
  }))

  return {
    type: 'root',
    children: [
      {
        type: 'blockquote',
        children: paragraphs,
      } as Blockquote,
    ],
  }
}

function getBlockquote(tree: Root): Blockquote {
  return tree.children[0] as Blockquote
}

describe('remarkCallouts', () => {
  it('annotates blockquote with callout type and title', () => {
    const tree = makeCalloutTree(['[!note] My Title', 'Content here'])
    const transform = remarkCallouts()
    transform(tree, {} as never, {} as never)

    const bq = getBlockquote(tree)
    const props = bq.data?.hProperties as Record<string, unknown>
    expect(props['data-callout-type']).toBe('note')
    expect(props['data-callout-title']).toBe('My Title')
  })

  it('handles callout without title', () => {
    const tree = makeCalloutTree(['[!warning]', 'Be careful'])
    const transform = remarkCallouts()
    transform(tree, {} as never, {} as never)

    const props = getBlockquote(tree).data?.hProperties as Record<string, unknown>
    expect(props['data-callout-type']).toBe('warning')
    expect(props['data-callout-title']).toBeNull()
  })

  it('normalizes type to lowercase', () => {
    const tree = makeCalloutTree(['[!TIP] A tip'])
    const transform = remarkCallouts()
    transform(tree, {} as never, {} as never)

    const props = getBlockquote(tree).data?.hProperties as Record<string, unknown>
    expect(props['data-callout-type']).toBe('tip')
  })

  it('leaves non-callout blockquotes unchanged', () => {
    const tree = makeCalloutTree(['Just a regular quote'])
    const transform = remarkCallouts()
    transform(tree, {} as never, {} as never)

    const bq = getBlockquote(tree)
    expect(bq.data?.hProperties).toBeUndefined()
  })
})
