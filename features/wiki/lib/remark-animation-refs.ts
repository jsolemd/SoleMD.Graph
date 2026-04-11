/**
 * Remark plugin: transforms [[anim:name]] animation refs into standard
 * link nodes with an `anim:` URL scheme.
 *
 * The `components.a` handler in the pipeline dispatches `anim:` links
 * to the AnimationEmbed component. This mirrors remark-pmid-citations
 * line-for-line — any change in that plugin's pattern should be
 * reflected here.
 */
import type { Root, PhrasingContent, Link } from 'mdast'
import type { Plugin } from 'unified'
import { visitTextNodes } from './visit-text'

const ANIM_RE = /\[\[anim:([a-z0-9-]+)\]\]/gi

const remarkAnimationRefs: Plugin<[], Root> = () => {
  return (tree) => {
    visitTextNodes(tree, (node, index, parent) => {
      const value = node.value
      const children: PhrasingContent[] = []
      let lastIndex = 0

      ANIM_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = ANIM_RE.exec(value)) !== null) {
        const [full, name] = match

        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) })
        }

        const linkNode: Link = {
          type: 'link',
          url: `anim:${name}`,
          title: `Animation: ${name}`,
          children: [{ type: 'text', value: name }],
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

export { remarkAnimationRefs }
