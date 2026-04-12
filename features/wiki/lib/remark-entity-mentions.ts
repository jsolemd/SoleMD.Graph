/**
 * Remark plugin: highlights precomputed entity mentions in wiki body text.
 *
 * Matches are resolved server-side by EntityService.match_entities() and
 * delivered in the page response as `body_entity_matches`.  This plugin
 * performs text-based matching (not offset-based) because
 * preprocessWikilinks() shifts character positions before the AST is built.
 *
 * The `components.a` handler in the pipeline dispatches entity: links
 * to the EntityMention component.
 */
import type { Root, PhrasingContent, Link } from 'mdast'
import type { Plugin } from 'unified'
import { visitTextNodes } from './visit-text'
import type { WikiBodyEntityMatch } from '@/lib/engine/wiki-types'

export interface RemarkEntityMentionsOptions {
  bodyEntityMatches: readonly WikiBodyEntityMatch[]
}

/**
 * Build a case-insensitive regex that matches any of the entity mention texts.
 * Longest matches first so overlapping terms prefer the longer form.
 */
function buildMatchRegex(matches: readonly WikiBodyEntityMatch[]): RegExp | null {
  if (matches.length === 0) return null

  const escaped = [...matches]
    .sort((a, b) => b.matched_text.length - a.matched_text.length)
    .map((m) => m.matched_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
}

const remarkEntityMentions: Plugin<[RemarkEntityMentionsOptions?], Root> = (
  options,
) => {
  const matches = options?.bodyEntityMatches ?? []

  // Index matches by lowercased matched_text for O(1) lookup
  const matchByText = new Map<string, WikiBodyEntityMatch>()
  for (const m of matches) {
    const key = m.matched_text.trim().toLowerCase()
    if (!matchByText.has(key)) {
      matchByText.set(key, m)
    }
  }

  const regex = buildMatchRegex(matches)

  return (tree) => {
    if (!regex || matchByText.size === 0) return

    // Track which entity texts have already been highlighted (first-occurrence only)
    const highlighted = new Set<string>()

    visitTextNodes(tree, (node, index, parent) => {
      const value = node.value
      const children: PhrasingContent[] = []
      let lastIndex = 0

      regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(value)) !== null) {
        const [fullMatch] = match
        const key = fullMatch.trim().toLowerCase()

        // First occurrence only per entity
        if (highlighted.has(key)) continue

        const entityMatch = matchByText.get(key)
        if (!entityMatch) continue

        highlighted.add(key)

        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) })
        }

        // Encode entity identity in the URL for the component dispatch
        const entityUrl = `entity:${encodeURIComponent(entityMatch.entity_type)}:${encodeURIComponent(entityMatch.source_identifier)}`
        const linkNode: Link = {
          type: 'link',
          url: entityUrl,
          title: entityMatch.canonical_name,
          children: [{ type: 'text', value: fullMatch }],
        }
        children.push(linkNode)
        lastIndex = match.index + fullMatch.length
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

export { remarkEntityMentions }
