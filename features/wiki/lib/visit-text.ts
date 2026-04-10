/**
 * Minimal text-node visitor for remark plugins.
 *
 * Avoids importing the ESM-only `unist-util-visit` package, which causes
 * issues in Jest's CJS transform pipeline.  Our plugins only need to walk
 * text nodes inside paragraphs/headings, so a targeted helper suffices.
 */
import type { Root, Parent, Text, PhrasingContent } from 'mdast'

/** Node types that should NOT be descended into — their text children
 *  are already part of a semantic structure (link label, footnote ref). */
const SKIP_TYPES = new Set(['link', 'linkReference', 'image', 'imageReference'])

type VisitAction = readonly [skip: 'skip', nextIndex: number]

type TextVisitor = (
  node: Text,
  index: number,
  parent: Parent,
) => VisitAction | void

/**
 * Walk all text nodes in the tree, allowing the visitor to splice the
 * parent's children (e.g. to replace text with link + text nodes).
 *
 * Skips `link`, `linkReference`, `image`, and `imageReference` descendants
 * to prevent producing invalid nested-link structures.
 *
 * When the visitor splices, it returns `['skip', newLength]` so the
 * walker advances past the inserted nodes.
 */
export function visitTextNodes(tree: Root, visitor: TextVisitor): void {
  function walk(node: Parent) {
    const children = node.children as PhrasingContent[]
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child.type === 'text') {
        const result = visitor(child, i, node)
        if (result && result[0] === 'skip') {
          i = result[1] - 1 // -1 because the for loop increments
        }
      } else if ('children' in child && !SKIP_TYPES.has(child.type)) {
        walk(child as unknown as Parent)
      }
    }
  }
  walk(tree)
}
