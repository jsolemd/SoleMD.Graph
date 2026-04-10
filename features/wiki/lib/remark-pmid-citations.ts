/**
 * Remark plugin: transforms [[pmid:NNN]] citations into standard link
 * nodes with a `pmid:` URL scheme.
 *
 * The `components.a` handler in the pipeline dispatches pmid: links
 * to the PaperCitation component.
 */
import type { Root, PhrasingContent, Link } from 'mdast'
import type { Plugin } from 'unified'
import { visitTextNodes } from './visit-text'

const PMID_RE = /\[\[pmid:(\d+)\]\]/gi

export interface RemarkPmidCitationsOptions {
  /** PMID → bundle-compatible graphPaperRef, from engine API. */
  paperGraphRefs?: Record<number, string>
}

const remarkPmidCitations: Plugin<[RemarkPmidCitationsOptions?], Root> = () => {
  return (tree) => {
    visitTextNodes(tree, (node, index, parent) => {
      const value = node.value
      const children: PhrasingContent[] = []
      let lastIndex = 0

      PMID_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = PMID_RE.exec(value)) !== null) {
        const [full, pmidStr] = match
        const pmid = parseInt(pmidStr, 10)

        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) })
        }

        const linkNode: Link = {
          type: 'link',
          url: `pmid:${pmid}`,
          title: `PMID ${pmid}`,
          children: [{ type: 'text', value: `PMID ${pmid}` }],
        }
        children.push(linkNode)
        lastIndex = match.index + full.length
      }

      if (children.length === 0) return

      if (lastIndex < value.length) {
        children.push({ type: 'text', value: value.slice(lastIndex) })
      }

      parent.children.splice(index, 1, ...children)
      return ['skip', index + children.length] as const
    })
  }
}

export { remarkPmidCitations }
