import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
} from "d3-force"
import type { SimNode, SimLink } from "./types"

// ---------------------------------------------------------------------------
// Simulation factory
// ---------------------------------------------------------------------------

export interface SimulationConfig {
  width: number
  height: number
  centerX?: number
  centerY?: number
  linkDistance?: number
  chargeStrength?: number
}

const DEFAULTS = {
  linkDistance: 30,
  chargeStrength: -100,
} as const

export function buildSimulation(
  nodes: SimNode[],
  links: SimLink[],
  config: SimulationConfig,
): Simulation<SimNode, SimLink> {
  const {
    centerX = 0,
    centerY = 0,
    linkDistance = DEFAULTS.linkDistance,
    chargeStrength = DEFAULTS.chargeStrength,
  } = config

  // Pre-compute link counts for degree-based collide radius
  const linkCounts = new Map<string, number>()
  for (const n of nodes) linkCounts.set(n.id, 0)
  for (const l of links) {
    linkCounts.set(l.sourceId, (linkCounts.get(l.sourceId) ?? 0) + 1)
    linkCounts.set(l.targetId, (linkCounts.get(l.targetId) ?? 0) + 1)
  }

  const sim = forceSimulation<SimNode>(nodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance(linkDistance),
    )
    .force("charge", forceManyBody<SimNode>().strength(chargeStrength))
    .force("center", forceCenter(centerX, centerY).strength(0.3))
    .force("collide", forceCollide<SimNode>((n) => {
      const base = n.kind === "page" ? 3 : 2
      return base + Math.sqrt(linkCounts.get(n.id) ?? 0) + 2
    }).iterations(3))

  return sim
}

export function reheatSimulation(
  sim: Simulation<SimNode, SimLink>,
  alpha = 0.3,
): void {
  sim.alpha(alpha).restart()
}
