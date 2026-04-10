/**
 * Wiki link resolution: converts [[target]] wikilinks in raw markdown
 * into standard markdown links BEFORE the parser sees them.
 *
 * This is a preprocessor, not a remark plugin, because CommonMark parsers
 * consume `[[…]]` as nested bracket syntax (link reference + text), making
 * the `[[target]]` pattern unreachable as a text node in the AST.
 *
 * **Contract**: Only targets present in `resolvedLinks` become navigable
 * `wiki:` links.  Unresolved targets (ambiguous, nonexistent pages) stay
 * as plain text — matching the engine-side contract in links.py.
 */

const WIKILINK_RE = /\[\[(?!pmid:)([^\]|]+?)(?:\|([^\]]+))?\]\]/gi

function normalizeRaw(target: string): string {
  return target.trim().toLowerCase().replace(/ /g, '-')
}

/**
 * Preprocesses raw markdown to replace `[[target]]` wikilinks with
 * standard markdown links `[display](wiki:slug)`.
 *
 * Unresolved targets become plain text (display only, no link).
 * PMID citations (`[[pmid:…]]`) are left untouched for remark-pmid-citations.
 */
export function preprocessWikilinks(
  markdown: string,
  resolvedLinks: Record<string, string>,
): string {
  return markdown.replace(WIKILINK_RE, (_match, target: string, alias?: string) => {
    const raw = normalizeRaw(target)
    const resolvedSlug = resolvedLinks[raw]
    const displayText = alias?.trim() || target.trim()

    if (resolvedSlug) {
      return `[${displayText}](wiki:${resolvedSlug})`
    }
    return displayText
  })
}
