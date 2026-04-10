/**
 * Remark plugin: transforms [[target]] and [[target|alias]] wikilinks
 * into standard link nodes with a `wiki:` URL scheme.
 *
 * Receives a resolved-links map from the engine so the frontend does
 * NO slug resolution — it just looks up pre-resolved data.
 *
 * **Contract**: Only targets present in `resolvedLinks` become navigable
 * `wiki:` links.  Unresolved targets (ambiguous, nonexistent pages) stay
 * as plain text — matching the engine-side contract in links.py.
 */
import type { Root, PhrasingContent, Link } from 'mdast'
import type { Plugin } from 'unified'
import { visitTextNodes } from './visit-text'

const WIKILINK_RE = /\[\[(?!pmid:)([^\]|]+?)(?:\|([^\]]+))?\]\]/gi

export interface RemarkWikilinksOptions {
  /** Raw wikilink target → resolved full slug, from engine API. */
  resolvedLinks?: Record<string, string>
}

function normalizeRaw(target: string): string {
  return target.trim().toLowerCase().replace(/ /g, '-')
}

const remarkWikilinks: Plugin<[RemarkWikilinksOptions?], Root> = (options = {}) => {
  const { resolvedLinks = {} } = options

  return (tree) => {
    visitTextNodes(tree, (node, index, parent) => {
      const value = node.value
      const children: PhrasingContent[] = []
      let lastIndex = 0

      WIKILINK_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = WIKILINK_RE.exec(value)) !== null) {
        const [full, target, alias] = match
        const raw = normalizeRaw(target)
        const resolvedSlug = resolvedLinks[raw]
        const displayText = alias?.trim() || target.trim()

        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) })
        }

        if (resolvedSlug) {
          // Resolved — emit navigable wiki: link
          const linkNode: Link = {
            type: 'link',
            url: `wiki:${resolvedSlug}`,
            children: [{ type: 'text', value: displayText }],
          }
          children.push(linkNode)
        } else {
          // Unresolved — emit plain text, no navigation
          children.push({ type: 'text', value: displayText })
        }

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

export { remarkWikilinks }
