import {
  entityTypeSemanticColorKeyByType,
  semanticColorFallbackHexByKey,
} from "@/lib/pastel-tokens"
import type { SemanticColorKey } from "@/lib/pastel-tokens"

export type { SemanticColorKey } from "@/lib/pastel-tokens"

// ---------------------------------------------------------------------------
// Theme palette — semantic-group node colors from CSS tokens
// See docs/map/wiki-taxonomy.md for the two-axis model.
// ---------------------------------------------------------------------------

export interface WikiGraphPalette {
  background: string
  node: Record<SemanticColorKey, number>
  linkColor: number
  linkAlpha: number
  labelColor: number
  hoverRing: number
  activeRing: number
}

const defaultNodeColors = Object.fromEntries(
  Object.entries(semanticColorFallbackHexByKey).map(([key, hex]) => [
    key,
    hexToNumber(hex) ?? 0,
  ]),
) as Record<SemanticColorKey, number>

const DEFAULT_PALETTE: WikiGraphPalette = {
  background: "#1a1a2e",
  node: defaultNodeColors,
  linkColor: 0x475569,
  linkAlpha: 0.3,
  labelColor: 0xe2e8f0,
  hoverRing: 0x747caa,
  activeRing: 0xa8c5e9,
}

let cachedPalette: WikiGraphPalette = { ...DEFAULT_PALETTE, node: { ...defaultNodeColors } }
let cacheValid = false

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}

function resolveCssVar(el: Element, name: string, seen = new Set<string>()): string {
  const value = cssVar(el, name)
  if (!value) return ""

  const match = value.match(/^var\((--[^,\s)]+)(?:,\s*(.+))?\)$/)
  if (!match) return value

  const nestedName = match[1]
  const fallback = match[2]?.trim() ?? ""
  if (seen.has(nestedName)) return fallback

  seen.add(nestedName)
  return resolveCssVar(el, nestedName, seen) || fallback
}

function hexToNumber(hex: string): number | null {
  const clean = hex.replace("#", "")
  const n = parseInt(clean, 16)
  return Number.isFinite(n) ? n : null
}

export function invalidatePalette(): void {
  cacheValid = false
}

const NODE_CSS_VARS: Record<SemanticColorKey, string> = {
  diso: "--wiki-graph-node-diso",
  chem: "--wiki-graph-node-chem",
  gene: "--wiki-graph-node-gene",
  anat: "--wiki-graph-node-anat",
  phys: "--wiki-graph-node-phys",
  proc: "--wiki-graph-node-proc",
  section: "--wiki-graph-node-section",
  paper: "--wiki-graph-node-paper",
  module: "--wiki-graph-node-module",
  default: "--wiki-graph-node-default",
}

export function resolvePalette(container: HTMLElement): WikiGraphPalette {
  if (cacheValid) return cachedPalette

  const bg = resolveCssVar(container, "--graph-panel-bg") || resolveCssVar(container, "--background")
  const link = resolveCssVar(container, "--wiki-graph-link") || "#475569"
  const label = resolveCssVar(container, "--wiki-graph-label") || "#e2e8f0"
  const hoverRing = resolveCssVar(container, "--brand-accent") || "#747caa"
  const activeRing = resolveCssVar(container, "--brand-accent-alt") || "#a8c5e9"

  const node = { ...DEFAULT_PALETTE.node }
  for (const [key, varName] of Object.entries(NODE_CSS_VARS)) {
    const val = resolveCssVar(container, varName)
    if (val) {
      const n = hexToNumber(val)
      if (n != null) node[key as SemanticColorKey] = n
    }
  }

  cachedPalette = {
    background: bg || DEFAULT_PALETTE.background,
    node,
    linkColor: hexToNumber(link) ?? DEFAULT_PALETTE.linkColor,
    linkAlpha: DEFAULT_PALETTE.linkAlpha,
    labelColor: hexToNumber(label) ?? DEFAULT_PALETTE.labelColor,
    hoverRing: hexToNumber(hoverRing) ?? DEFAULT_PALETTE.hoverRing,
    activeRing: hexToNumber(activeRing) ?? DEFAULT_PALETTE.activeRing,
  }
  cacheValid = true
  return cachedPalette
}

// ---------------------------------------------------------------------------
// Exported label + CSS var maps — consumed by WikiGraphLegend overlay
// ---------------------------------------------------------------------------

export const SEMANTIC_GROUP_LABELS: Record<SemanticColorKey, string> = {
  diso: "Disorders",
  chem: "Chemicals",
  gene: "Genes",
  anat: "Anatomy",
  phys: "Physiology",
  proc: "Procedures",
  section: "Sections",
  paper: "Papers",
  module: "Modules",
  default: "Other",
}

/** CSS variable expression for each group — resolves via tokens.css, single source of truth. */
export const SEMANTIC_GROUP_CSS_COLOR: Record<SemanticColorKey, string> = Object.fromEntries(
  Object.entries(NODE_CSS_VARS).map(([key, varName]) => {
    const fallback = semanticColorFallbackHexByKey[key as SemanticColorKey]
    return [key, `var(${varName}, ${fallback})`]
  }),
) as Record<SemanticColorKey, string>

// ---------------------------------------------------------------------------
// Node color resolution — maps SimNode data to a palette color key
// ---------------------------------------------------------------------------

/**
 * Resolve the semantic color key for a wiki graph node.
 *
 * Priority:
 * 1. Paper nodes → "paper"
 * 2. Section hubs (family_key = "wiki-sections" or tag "section") → "section"
 * 3. Node carries semanticGroup → lowercase lookup
 * 4. Fallback from entity_type (PubTator types for uncurated entities)
 * 5. Default
 */
export function resolveNodeColorKey(node: {
  kind: string
  tags: string[]
  semanticGroup?: string | null
  entityType?: string | null
}): SemanticColorKey {
  if (node.kind === "paper") return "paper"
  if (node.tags.includes("module")) return "module"
  if (node.tags.includes("section")) return "section"

  if (node.semanticGroup) {
    const key = node.semanticGroup.toLowerCase() as SemanticColorKey
    if (key in DEFAULT_PALETTE.node) return key
  }

  // Fallback: entity_type → semantic group (wiki page + PubTator types)
  if (node.entityType) {
    const colorKey = entityTypeSemanticColorKeyByType[node.entityType.toLowerCase()]
    if (colorKey) return colorKey
  }

  return "default"
}
