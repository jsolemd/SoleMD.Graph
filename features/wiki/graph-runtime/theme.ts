// ---------------------------------------------------------------------------
// Theme palette — semantic-group node colors from CSS tokens
// See docs/map/wiki-taxonomy.md for the two-axis model.
// ---------------------------------------------------------------------------

/** Semantic groups that map to distinct node colors. */
export type SemanticColorKey =
  | "diso"
  | "chem"
  | "gene"
  | "anat"
  | "phys"
  | "proc"
  | "section"
  | "paper"
  | "default"

export interface WikiGraphPalette {
  background: string
  node: Record<SemanticColorKey, number>
  linkColor: number
  linkAlpha: number
  labelColor: number
  hoverRing: number
  activeRing: number
}

const DEFAULT_PALETTE: WikiGraphPalette = {
  background: "#1a1a2e",
  node: {
    diso: 0xffada4,
    chem: 0xaedc93,
    gene: 0xeda8c4,
    anat: 0xe5c799,
    phys: 0xa8c5e9,
    proc: 0xd8bee9,
    section: 0x747caa,
    paper: 0xd4c5a0,
    default: 0xa8c5e9,
  },
  linkColor: 0x475569,
  linkAlpha: 0.3,
  labelColor: 0xe2e8f0,
  hoverRing: 0x747caa,
  activeRing: 0xa8c5e9,
}

let cachedPalette: WikiGraphPalette = { ...DEFAULT_PALETTE, node: { ...DEFAULT_PALETTE.node } }
let cacheValid = false

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
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
  default: "--wiki-graph-node-default",
}

export function resolvePalette(container: HTMLElement): WikiGraphPalette {
  if (cacheValid) return cachedPalette

  const bg = cssVar(container, "--graph-panel-bg") || cssVar(container, "--mantine-color-body")
  const link = cssVar(container, "--wiki-graph-link") || "#475569"
  const label = cssVar(container, "--wiki-graph-label") || "#e2e8f0"
  const hoverRing = cssVar(container, "--brand-accent") || "#747caa"
  const activeRing = cssVar(container, "--brand-accent-alt") || "#a8c5e9"

  const node = { ...DEFAULT_PALETTE.node }
  for (const [key, varName] of Object.entries(NODE_CSS_VARS)) {
    const val = cssVar(container, varName)
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
  if (node.tags.includes("section")) return "section"

  if (node.semanticGroup) {
    const key = node.semanticGroup.toLowerCase() as SemanticColorKey
    if (key in DEFAULT_PALETTE.node) return key
  }

  // Fallback: entity_type → semantic group (wiki page + PubTator types)
  if (node.entityType) {
    const et = node.entityType.toLowerCase()
    if (et === "disease") return "diso"
    if (et === "chemical") return "chem"
    if (et === "gene" || et === "receptor") return "gene"
    if (et === "anatomy") return "anat"
    if (et === "network" || et === "biological process") return "phys"
  }

  return "default"
}
