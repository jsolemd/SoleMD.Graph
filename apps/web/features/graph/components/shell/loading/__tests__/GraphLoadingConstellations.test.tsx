/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { GraphLoadingConstellations } from "../GraphLoadingConstellations";
import {
  boundsOverlap,
  getLoadingPanelAvoidBounds,
  LOADING_CONSTELLATION_GROUP_GAP,
  resolveConstellationLayoutMap,
} from "../graph-loading-constellation-layout";
import { GRAPH_LOADING_CONSTELLATIONS } from "../graph-loading-constellations";

describe("GraphLoadingConstellations", () => {
  it("covers each featured entity category once", () => {
    const types = GRAPH_LOADING_CONSTELLATIONS.map(
      (constellation) => constellation.entity.entityType,
    );

    expect([...new Set(types)].sort()).toEqual(
      [
        "anatomy",
        "biological process",
        "chemical",
        "disease",
        "gene",
        "network",
        "receptor",
        "species",
      ].sort(),
    );
  });

  it("keeps desktop constellation groups clear of the center loading panel and separate from each other", () => {
    const viewportWidth = 1440;
    const viewportHeight = 900;
    const avoidBounds = getLoadingPanelAvoidBounds(viewportWidth, viewportHeight);
    const frames = resolveConstellationLayoutMap(
      GRAPH_LOADING_CONSTELLATIONS,
      viewportWidth,
      viewportHeight,
    );

    for (const constellation of GRAPH_LOADING_CONSTELLATIONS) {
      const bounds = frames[constellation.id];
      expect(boundsOverlap(bounds, avoidBounds, 24)).toBe(false);
    }

    for (let index = 0; index < GRAPH_LOADING_CONSTELLATIONS.length; index += 1) {
      const current = GRAPH_LOADING_CONSTELLATIONS[index];
      if (!current) continue;
      for (
        let compareIndex = index + 1;
        compareIndex < GRAPH_LOADING_CONSTELLATIONS.length;
        compareIndex += 1
      ) {
        const compare = GRAPH_LOADING_CONSTELLATIONS[compareIndex];
        if (!compare) continue;
        expect(
          boundsOverlap(
            frames[current.id],
            frames[compare.id],
            LOADING_CONSTELLATION_GROUP_GAP,
          ),
        ).toBe(false);
      }
    }
  });

  it("renders the constellation root and hero node test IDs", () => {
    render(<GraphLoadingConstellations />);

    expect(screen.getByTestId("loading-constellations")).toBeInTheDocument();
    expect(screen.getByTestId("loading-constellation-trigger-depression")).toBeInTheDocument();
    expect(screen.getByTestId("loading-constellation-trigger-ketamine")).toBeInTheDocument();
  });

  it("renders hero labels for each constellation", () => {
    render(<GraphLoadingConstellations />);

    expect(screen.getByText("Major depressive disorder")).toBeInTheDocument();
    expect(screen.getByText("Ketamine")).toBeInTheDocument();
    expect(screen.getByText("BDNF")).toBeInTheDocument();
  });
});
