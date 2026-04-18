import {
  WIKI_GRAPH_DRAG_INTERACTION,
  startWikiGraphDragInteraction,
  sustainWikiGraphDragInteraction,
  endWikiGraphDragInteraction,
} from "../simulation-controls";

function createSimulationMock(initialAlpha = 0.04) {
  let currentAlpha = initialAlpha;

  const simulation = {
    alpha: jest.fn((next?: number) => {
      if (typeof next === "number") {
        currentAlpha = next;
        return simulation;
      }
      return currentAlpha;
    }),
    alphaTarget: jest.fn(() => simulation),
    restart: jest.fn(() => simulation),
  };

  return { simulation, getAlpha: () => currentAlpha };
}

describe("wiki graph drag interaction controls", () => {
  it("starts drag with a sustained alpha target and floor", () => {
    const { simulation, getAlpha } = createSimulationMock(0.02);

    startWikiGraphDragInteraction(simulation as never);

    expect(simulation.alphaTarget).toHaveBeenCalledWith(
      WIKI_GRAPH_DRAG_INTERACTION.alphaTarget,
    );
    expect(simulation.restart).toHaveBeenCalled();
    expect(getAlpha()).toBe(WIKI_GRAPH_DRAG_INTERACTION.alphaFloor);
  });

  it("keeps the simulation warm while dragging", () => {
    const { simulation, getAlpha } = createSimulationMock(0.01);

    sustainWikiGraphDragInteraction(simulation as never);

    expect(simulation.restart).toHaveBeenCalled();
    expect(getAlpha()).toBe(WIKI_GRAPH_DRAG_INTERACTION.alphaFloor);
  });

  it("releases drag into a natural settle cycle", () => {
    const { simulation, getAlpha } = createSimulationMock(0.03);

    endWikiGraphDragInteraction(simulation as never);

    expect(simulation.alphaTarget).toHaveBeenCalledWith(0);
    expect(simulation.restart).toHaveBeenCalled();
    expect(getAlpha()).toBe(WIKI_GRAPH_DRAG_INTERACTION.releaseAlphaFloor);
  });
});
