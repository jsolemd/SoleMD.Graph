import type { Simulation } from "d3-force";
import type { SimNode, SimLink } from "./types";

export interface WikiGraphSimulationDefaults {
  linkDistance: number;
  chargeStrength: number;
  centerStrength: number;
  velocityDecay: number;
}

export interface WikiGraphDragInteractionConfig {
  alphaTarget: number;
  alphaFloor: number;
  releaseAlphaFloor: number;
}

export const WIKI_GRAPH_SIMULATION_DEFAULTS: WikiGraphSimulationDefaults = {
  linkDistance: 36,
  chargeStrength: -130,
  centerStrength: 0.14,
  velocityDecay: 0.22,
};

export const WIKI_GRAPH_DRAG_INTERACTION: WikiGraphDragInteractionConfig = {
  alphaTarget: 0.26,
  alphaFloor: 0.18,
  releaseAlphaFloor: 0.1,
};

export function startWikiGraphDragInteraction(
  simulation: Simulation<SimNode, SimLink>,
  config: WikiGraphDragInteractionConfig = WIKI_GRAPH_DRAG_INTERACTION,
): void {
  if (simulation.alpha() < config.alphaFloor) {
    simulation.alpha(config.alphaFloor);
  }
  simulation.alphaTarget(config.alphaTarget).restart();
}

export function sustainWikiGraphDragInteraction(
  simulation: Simulation<SimNode, SimLink>,
  config: WikiGraphDragInteractionConfig = WIKI_GRAPH_DRAG_INTERACTION,
): void {
  if (simulation.alpha() < config.alphaFloor) {
    simulation.alpha(config.alphaFloor);
  }
  simulation.restart();
}

export function endWikiGraphDragInteraction(
  simulation: Simulation<SimNode, SimLink>,
  config: WikiGraphDragInteractionConfig = WIKI_GRAPH_DRAG_INTERACTION,
): void {
  if (simulation.alpha() < config.releaseAlphaFloor) {
    simulation.alpha(config.releaseAlphaFloor);
  }
  simulation.alphaTarget(0).restart();
}
