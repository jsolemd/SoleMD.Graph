/**
 * Unit tests for the wikilinks remark plugin.
 *
 * Tests operate on the MDAST directly using the plugin's transform function
 * to avoid ESM-only unified/remark-parse import issues in Jest.
 */
import type { Root, Paragraph, Text, Link, PhrasingContent } from 'mdast'
import { remarkWikilinks } from '../remark-wikilinks'

/** Build a minimal MDAST with one paragraph containing text. */
function makeTree(text: string): Root {
  return {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: text }],
      },
    ],
  }
}

function getParaChildren(tree: Root): PhrasingContent[] {
  return (tree.children[0] as Paragraph).children
}

function getLinks(tree: Root): Link[] {
  return getParaChildren(tree).filter((n): n is Link => n.type === 'link')
}

function linkText(link: Link): string {
  return (link.children[0] as Text).value
}

describe('remarkWikilinks', () => {
  it('converts resolved [[target]] to a wiki: link', () => {
    const tree = makeTree('see [[serotonin]] here')
    const transform = remarkWikilinks({ resolvedLinks: { serotonin: 'entities/serotonin' } })
    transform(tree, {} as never, {} as never)

    const links = getLinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0].url).toBe('wiki:entities/serotonin')
    expect(linkText(links[0])).toBe('serotonin')
  })

  it('handles display alias [[target|alias]]', () => {
    const tree = makeTree('see [[serotonin|5-HT]]')
    const transform = remarkWikilinks({ resolvedLinks: { serotonin: 'entities/serotonin' } })
    transform(tree, {} as never, {} as never)

    const link = getLinks(tree)[0]
    expect(link.url).toBe('wiki:entities/serotonin')
    expect(linkText(link)).toBe('5-HT')
  })

  it('handles multiple wikilinks in one line', () => {
    const tree = makeTree('[[alpha]] and [[beta]]')
    const transform = remarkWikilinks({
      resolvedLinks: { alpha: 'entities/alpha', beta: 'entities/beta' },
    })
    transform(tree, {} as never, {} as never)

    const links = getLinks(tree)
    expect(links).toHaveLength(2)
    expect(links[0].url).toBe('wiki:entities/alpha')
    expect(links[1].url).toBe('wiki:entities/beta')
  })

  it('ignores [[pmid:NNN]] citations', () => {
    const tree = makeTree('[[pmid:12345]] and [[serotonin]]')
    const transform = remarkWikilinks({ resolvedLinks: { serotonin: 'entities/serotonin' } })
    transform(tree, {} as never, {} as never)

    const wikiLinks = getLinks(tree).filter(l => l.url.startsWith('wiki:'))
    expect(wikiLinks).toHaveLength(1)
    expect(wikiLinks[0].url).toBe('wiki:entities/serotonin')
  })

  it('preserves surrounding text', () => {
    const tree = makeTree('before [[link]] after')
    const transform = remarkWikilinks({ resolvedLinks: { link: 'entities/link' } })
    transform(tree, {} as never, {} as never)

    const children = getParaChildren(tree)
    expect(children).toHaveLength(3)
    expect((children[0] as Text).value).toBe('before ')
    expect(children[1].type).toBe('link')
    expect((children[2] as Text).value).toBe(' after')
  })

  // --- Regression: unresolved wikilinks stay as plain text ---

  it('renders unresolved [[target]] as plain text, not a navigable link', () => {
    const tree = makeTree('see [[nonexistent]] here')
    const transform = remarkWikilinks({ resolvedLinks: {} })
    transform(tree, {} as never, {} as never)

    const links = getLinks(tree)
    expect(links).toHaveLength(0)

    // The display text should still appear
    const children = getParaChildren(tree)
    const allText = children.map(c => (c as Text).value).join('')
    expect(allText).toBe('see nonexistent here')
  })

  it('renders mixed resolved and unresolved wikilinks correctly', () => {
    const tree = makeTree('[[known]] and [[unknown]]')
    const transform = remarkWikilinks({ resolvedLinks: { known: 'entities/known' } })
    transform(tree, {} as never, {} as never)

    const links = getLinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0].url).toBe('wiki:entities/known')

    // "unknown" should be plain text
    const children = getParaChildren(tree)
    const textNodes = children.filter((c): c is Text => c.type === 'text')
    expect(textNodes.some(t => t.value.includes('unknown'))).toBe(true)
  })

  it('with no resolvedLinks, all wikilinks become plain text', () => {
    const tree = makeTree('[[alpha]] and [[beta]]')
    const transform = remarkWikilinks()
    transform(tree, {} as never, {} as never)

    expect(getLinks(tree)).toHaveLength(0)
  })

  // --- Regression: does not transform text inside existing links ---

  it('does not transform wikilink syntax inside markdown links', () => {
    // Simulate: [label with [[inner]]](http://example.com)
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: 'http://example.com',
              children: [{ type: 'text', value: 'label with [[inner]]' }],
            },
          ],
        },
      ],
    }
    const transform = remarkWikilinks({ resolvedLinks: { inner: 'entities/inner' } })
    transform(tree, {} as never, {} as never)

    // The link's text child should be unchanged — no nested link created
    const link = (tree.children[0] as Paragraph).children[0] as Link
    expect(link.type).toBe('link')
    expect(link.url).toBe('http://example.com')
    expect(link.children).toHaveLength(1)
    expect((link.children[0] as Text).value).toBe('label with [[inner]]')
  })
})
