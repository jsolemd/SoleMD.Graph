/**
 * Remark plugin: transforms Obsidian-style callouts into annotated
 * blockquote nodes that the Callout component can render.
 *
 * Syntax:
 *   > [!note] Optional Title
 *   > Content of the callout
 *
 * Sets `data-callout-type` and `data-callout-title` attributes on the
 * blockquote's HAST output via `data.hProperties`.
 */
import type { Root, Blockquote, Parent } from 'mdast'
import type { Plugin } from 'unified'

const CALLOUT_RE = /^\[!(\w+)\]\s*(.*)/

const remarkCallouts: Plugin<[], Root> = () => {
  return (tree) => {
    walkBlockquotes(tree)
  }
}

function walkBlockquotes(node: Parent): void {
  for (const child of node.children) {
    if (child.type === 'blockquote') {
      transformCallout(child as Blockquote)
    }
    if ('children' in child) {
      walkBlockquotes(child as Parent)
    }
  }
}

function transformCallout(node: Blockquote): void {
  const firstChild = node.children[0]
  if (firstChild?.type !== 'paragraph') return

  const firstInline = firstChild.children[0]
  if (firstInline?.type !== 'text') return

  const match = firstInline.value.match(CALLOUT_RE)
  if (!match) return

  const [, calloutType, calloutTitle] = match

  // Annotate for remark-rehype → HAST → React
  node.data = {
    ...((node.data as Record<string, unknown>) ?? {}),
    hProperties: {
      'data-callout-type': calloutType.toLowerCase(),
      'data-callout-title': calloutTitle || null,
    },
  }

  // Remove the [!type] prefix from the text
  const remaining = firstInline.value.replace(CALLOUT_RE, '').trim()
  if (remaining) {
    firstInline.value = remaining
  } else if (firstChild.children.length > 1) {
    firstChild.children.shift()
    if (firstChild.children[0]?.type === 'break') {
      firstChild.children.shift()
    }
  } else {
    node.children.shift()
  }
}

export { remarkCallouts }
