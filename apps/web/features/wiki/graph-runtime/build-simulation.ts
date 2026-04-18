import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceRadial,
  type Simulation,
} from "d3-force";
import type { SimNode, SimLink } from "./types";
import { WIKI_GRAPH_SIMULATION_DEFAULTS } from "./simulation-controls";

// ---------------------------------------------------------------------------
// Simulation factory
// ---------------------------------------------------------------------------

export interface SimulationConfig {
  width: number;
  height: number;
  centerX?: number;
  centerY?: number;
  linkDistance?: number;
  chargeStrength?: number;
  centerStrength?: number;
  velocityDecay?: number;
}

export function buildSimulation(
  nodes: SimNode[],
  links: SimLink[],
  config: SimulationConfig,
): Simulation<SimNode, SimLink> {
  const {
    centerX = 0,
    centerY = 0,
    linkDistance = WIKI_GRAPH_SIMULATION_DEFAULTS.linkDistance,
    chargeStrength = WIKI_GRAPH_SIMULATION_DEFAULTS.chargeStrength,
    centerStrength = WIKI_GRAPH_SIMULATION_DEFAULTS.centerStrength,
    velocityDecay = WIKI_GRAPH_SIMULATION_DEFAULTS.velocityDecay,
  } = config;

  const linkCounts = new Map<string, number>();
  for (const n of nodes) linkCounts.set(n.id, 0);
  for (const l of links) {
    linkCounts.set(l.sourceId, (linkCounts.get(l.sourceId) ?? 0) + 1);
    linkCounts.set(l.targetId, (linkCounts.get(l.targetId) ?? 0) + 1);
  }

  // Orphan nodes (no links) get a radial pull toward the cluster periphery
  // so they stay near the graph instead of flying off into space.
  const orphanRadius = 100;
  const orphanStrength = (n: SimNode) =>
    (linkCounts.get(n.id) ?? 0) === 0 ? 0.1 : 0;

  return forceSimulation<SimNode>(nodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance(linkDistance),
    )
    .force("charge", forceManyBody<SimNode>().strength(chargeStrength))
    .force("center", forceCenter(centerX, centerY).strength(centerStrength))
    .force(
      "orphan-gravity",
      forceRadial<SimNode>(orphanRadius, centerX, centerY).strength(orphanStrength),
    )
    .force(
      "collide",
      forceCollide<SimNode>((n) => {
        const base = n.kind === "page" ? 5 : 2;
        return base + Math.sqrt(linkCounts.get(n.id) ?? 0) + 2;
      }).iterations(3),
    )
    .velocityDecay(velocityDecay);
}
