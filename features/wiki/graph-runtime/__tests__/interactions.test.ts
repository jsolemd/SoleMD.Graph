/**
 * @jest-environment jsdom
 */
jest.mock("pixi.js", () => ({
  Application: class {},
  Container: class {},
  Graphics: class {},
  Text: class {},
  TextStyle: class {},
  Circle: class {},
}));

jest.mock("@tweenjs/tween.js", () => {
  class MockGroup {
    add() {
      return this;
    }
    getAll() {
      return [];
    }
    update() {
      return true;
    }
  }
  class MockTween {
    constructor(_: unknown, _group?: unknown) {}
    to() {
      return this;
    }
    start() {
      return this;
    }
    stop() {
      return this;
    }
  }
  return { Group: MockGroup, Tween: MockTween };
});

jest.mock("../simulation-controls", () => ({
  startWikiGraphDragInteraction: jest.fn(),
  endWikiGraphDragInteraction: jest.fn(),
  sustainWikiGraphDragInteraction: jest.fn(),
}));

// d3-selection / d3-zoom ship as pure-ESM, which Jest cannot transform without
// a custom preset. wireNodeInteractions never actually invokes either — they
// are used by wireZoom, which is a sibling export.
jest.mock("d3-selection", () => ({ select: jest.fn() }));
jest.mock("d3-zoom", () => ({ zoom: jest.fn() }));

import { wireNodeInteractions } from "../interactions";
import type { SimNode, WikiGraphIntents } from "../types";
import type { WikiGraphScene } from "../render-scene";
import type { WikiGraphPalette } from "../theme";
import type { Simulation } from "d3-force";

// Minimal palette — renderHoverLinks only needs linkAlpha.
const PALETTE = {
  linkAlpha: 0.3,
} as unknown as WikiGraphPalette;

const SIMULATION = {} as unknown as Simulation<SimNode, never>;

function makeNode(id: string, overrides: Partial<SimNode> = {}): SimNode {
  return {
    id,
    kind: "page",
    label: id,
    slug: id,
    paperId: null,
    conceptId: null,
    entityType: null,
    semanticGroup: null,
    tags: [],
    year: null,
    venue: null,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function makeScene(nodes: SimNode[]) {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const canvas = {
    style: { cursor: "default" },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      const list = listeners.get(type);
      if (!list) return;
      listeners.set(
        type,
        list.filter((f) => f !== fn),
      );
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: jest.fn(),
    releasePointerCapture: jest.fn(),
    hasPointerCapture: jest.fn(() => true),
  };

  const scene = {
    app: {
      canvas,
      stage: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
      },
    },
    nodeRenderData: nodes.map((simulationData) => ({
      simulationData,
      active: false,
      gfx: { alpha: 1 },
    })),
    linkRenderData: [],
    width: 800,
    height: 600,
    hoveredNodeId: null,
    labelsDirty: false,
  } as unknown as WikiGraphScene;

  function dispatch(type: string, event: Record<string, unknown>) {
    const list = listeners.get(type) ?? [];
    for (const fn of list) fn(event);
  }

  return { scene, dispatch };
}

function pointerEvent(
  clientX: number,
  clientY: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    clientX,
    clientY,
    pointerId: 1,
    preventDefault: jest.fn(),
    stopImmediatePropagation: jest.fn(),
    ...overrides,
  };
}

describe("wireNodeInteractions", () => {
  it("opens a page on pointerdown+pointerup (no click event needed)", () => {
    const node = makeNode("page-a", { x: 0, y: 0 });
    const { scene, dispatch } = makeScene([node]);

    const intents: WikiGraphIntents = {
      onOpenPage: jest.fn(),
      onFocusPaper: jest.fn(),
      onFlashPapers: jest.fn(),
      onSelectEntity: jest.fn(),
    };

    wireNodeInteractions(scene, SIMULATION, intents, PALETTE);

    // Node is positioned at stage center (width/2, height/2) = (400, 300).
    dispatch("pointerdown", pointerEvent(400, 300));
    dispatch("pointerup", pointerEvent(400, 300));

    expect(intents.onOpenPage).toHaveBeenCalledWith("page-a");
  });

  it("fires paper intents on tap when the node is a paper", () => {
    const node = makeNode("paper-a", {
      kind: "paper",
      slug: null,
      paperId: "paper-a",
    });
    const { scene, dispatch } = makeScene([node]);

    const intents: WikiGraphIntents = {
      onOpenPage: jest.fn(),
      onFocusPaper: jest.fn(),
      onFlashPapers: jest.fn(),
    };

    wireNodeInteractions(scene, SIMULATION, intents, PALETTE);

    dispatch("pointerdown", pointerEvent(400, 300));
    dispatch("pointerup", pointerEvent(400, 300));

    expect(intents.onOpenPage).not.toHaveBeenCalled();
    expect(intents.onFocusPaper).toHaveBeenCalledWith("paper-a");
    expect(intents.onFlashPapers).toHaveBeenCalledWith(["paper-a"]);
  });

  it("suppresses intents when the pointer traveled beyond the tap threshold", () => {
    const node = makeNode("page-a", { x: 0, y: 0 });
    const { scene, dispatch } = makeScene([node]);
    const intents: WikiGraphIntents = {
      onOpenPage: jest.fn(),
    };

    wireNodeInteractions(scene, SIMULATION, intents, PALETTE);

    dispatch("pointerdown", pointerEvent(400, 300));
    // Move far enough to count as drag, then release.
    dispatch("pointermove", pointerEvent(460, 300));
    dispatch("pointerup", pointerEvent(460, 300));

    expect(intents.onOpenPage).not.toHaveBeenCalled();
  });

  it("does not fire intents on pointercancel", () => {
    const node = makeNode("page-a", { x: 0, y: 0 });
    const { scene, dispatch } = makeScene([node]);
    const intents: WikiGraphIntents = {
      onOpenPage: jest.fn(),
    };

    wireNodeInteractions(scene, SIMULATION, intents, PALETTE);

    dispatch("pointerdown", pointerEvent(400, 300));
    dispatch("pointercancel", pointerEvent(400, 300));

    expect(intents.onOpenPage).not.toHaveBeenCalled();
  });

  it("uses the touch hit radius on touch so finger-width taps land", () => {
    const node = makeNode("page-a", { x: 0, y: 0 });
    const { scene, dispatch } = makeScene([node]);
    const intents: WikiGraphIntents = { onOpenPage: jest.fn() };

    wireNodeInteractions(scene, SIMULATION, intents, PALETTE);

    // Node center is at canvas (400, 300). 18px away is outside the mouse
    // radius (12) but inside the touch radius (24).
    dispatch("pointerdown", pointerEvent(418, 300, { pointerType: "touch" }));
    dispatch("pointerup", pointerEvent(418, 300, { pointerType: "touch" }));

    expect(intents.onOpenPage).toHaveBeenCalledWith("page-a");
  });

  it("keeps mouse hits tight (no over-pick at touch radius)", () => {
    const node = makeNode("page-a", { x: 0, y: 0 });
    const { scene, dispatch } = makeScene([node]);
    const intents: WikiGraphIntents = { onOpenPage: jest.fn() };

    wireNodeInteractions(scene, SIMULATION, intents, PALETTE);

    // Same 18px-away tap, but with a mouse pointer — should miss.
    dispatch("pointerdown", pointerEvent(418, 300, { pointerType: "mouse" }));
    dispatch("pointerup", pointerEvent(418, 300, { pointerType: "mouse" }));

    expect(intents.onOpenPage).not.toHaveBeenCalled();
  });

  it("does not fire intents when pointerup hits a different node", () => {
    const nodeA = makeNode("page-a", { x: 0, y: 0 });
    const nodeB = makeNode("page-b", { x: 300, y: 0 });
    const { scene, dispatch } = makeScene([nodeA, nodeB]);
    const intents: WikiGraphIntents = {
      onOpenPage: jest.fn(),
    };

    wireNodeInteractions(scene, SIMULATION, intents, PALETTE);

    // Press on nodeA (400,300) then lift over nodeB (700,300) — too far to
    // count as a tap; the gesture is a drag that happens to end near nodeB.
    dispatch("pointerdown", pointerEvent(400, 300));
    dispatch("pointerup", pointerEvent(700, 300));

    expect(intents.onOpenPage).not.toHaveBeenCalled();
  });
});
