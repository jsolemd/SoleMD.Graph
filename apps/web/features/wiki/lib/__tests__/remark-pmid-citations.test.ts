/**
 * Unit tests for the PMID citations remark plugin.
 */
import type { Root, Paragraph, Text, Link, PhrasingContent } from 'mdast'
import { remarkPmidCitations } from '../remark-pmid-citations'

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

function getLinks(tree: Root): Link[] {
  return ((tree.children[0] as Paragraph).children as PhrasingContent[])
    .filter((n): n is Link => n.type === 'link')
}

function linkText(link: Link): string {
  return (link.children[0] as Text).value
}

describe('remarkPmidCitations', () => {
  it('converts [[pmid:NNN]] to a pmid: link', () => {
    const tree = makeTree('study [[pmid:28847293]]')
    const transform = remarkPmidCitations()
    transform(tree, {} as never, {} as never)

    const links = getLinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0].url).toBe('pmid:28847293')
    expect(linkText(links[0])).toBe('PMID 28847293')
  })

  it('handles multiple PMID citations', () => {
    const tree = makeTree('[[pmid:111]] and [[pmid:222]]')
    const transform = remarkPmidCitations()
    transform(tree, {} as never, {} as never)

    const links = getLinks(tree)
    expect(links).toHaveLength(2)
    expect(links[0].url).toBe('pmid:111')
    expect(links[1].url).toBe('pmid:222')
  })

  it('is case insensitive', () => {
    const tree = makeTree('[[PMID:12345]]')
    const transform = remarkPmidCitations()
    transform(tree, {} as never, {} as never)

    expect(getLinks(tree)[0].url).toBe('pmid:12345')
  })

  it('does not match non-PMID wikilinks', () => {
    const tree = makeTree('[[serotonin]]')
    const transform = remarkPmidCitations()
    transform(tree, {} as never, {} as never)

    expect(getLinks(tree)).toHaveLength(0)
  })
})
