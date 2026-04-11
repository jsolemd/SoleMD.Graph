import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force"
import type { Graphics, Text as PixiText } from "pixi.js"
import type { WikiGraphNode, WikiGraphEdge } from "@/lib/engine/wiki-types"

// ---------------------------------------------------------------------------
// Simulation node/link types (D3-force compatible)
// ---------------------------------------------------------------------------

export interface SimNode extends SimulationNodeDatum {
  id: string
  kind: "page" | "paper"
  label: string
  slug: string | null
  paperId: string | null
  conceptId: string | null
  entityType: string | null
  semanticGroup: string | null
  tags: string[]
  year: number | null
  venue: string | null
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  sourceId: string
  targetId: string
  kind: "wikilink" | "paper_reference"
}

// ---------------------------------------------------------------------------
// Render data — Pixi graphics + active state for hover focus (Quartz pattern)
// ---------------------------------------------------------------------------

export interface NodeRenderData {
  simulationData: SimNode
  gfx: Graphics
  label: PixiText
  labelBaseWidth: number
  labelBaseHeight: number
  labelPriority: number
  color: string
  alpha: number
  active: boolean
  radius: number
}

export interface LinkRenderData {
  simulationData: SimLink
  gfx: Graphics
  color: number
  alpha: number
  active: boolean
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

export function toSimNode(n: WikiGraphNode): SimNode {
  return {
    id: n.id,
    kind: n.kind,
    label: n.label,
    slug: n.slug,
    paperId: n.paper_id,
    conceptId: n.concept_id,
    entityType: n.entity_type,
    semanticGroup: n.semantic_group ?? null,
    tags: n.tags,
    year: n.year,
    venue: n.venue,
  }
}

export function toSimLink(e: WikiGraphEdge): SimLink {
  return {
    source: e.source,
    target: e.target,
    sourceId: e.source,
    targetId: e.target,
    kind: e.kind,
  }
}

// ---------------------------------------------------------------------------
// Degree computation
// ---------------------------------------------------------------------------

export function computeLinkCounts(
  nodes: SimNode[],
  links: SimLink[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const n of nodes) counts.set(n.id, 0)
  for (const l of links) {
    counts.set(l.sourceId, (counts.get(l.sourceId) ?? 0) + 1)
    counts.set(l.targetId, (counts.get(l.targetId) ?? 0) + 1)
  }
  return counts
}

export function nodeRadius(node: SimNode, linkCount: number): number {
  const base = node.kind === "page" ? 3 : 2
  return base + Math.sqrt(linkCount)
}

// ---------------------------------------------------------------------------
// Intent callbacks (passed from React boundary → runtime)
// ---------------------------------------------------------------------------

export interface WikiGraphIntents {
  onOpenPage: (slug: string) => void
  onSelectEntity?: (conceptId: string) => void
  onFocusPaper?: (paperId: string) => void
  onFlashPapers?: (paperIds: string[]) => void
}

// ---------------------------------------------------------------------------
// Mount options
// ---------------------------------------------------------------------------

export interface MountWikiGraphOptions {
  container: HTMLElement
  nodes: SimNode[]
  links: SimLink[]
  signature: string
  intents: WikiGraphIntents
}
