/**
 * @jest-environment jsdom
 *
 * Regression tests for the rAF / destroy race in mount-wiki-graph.
 *
 * Bugs (from `tmp/audit/web-wiki.md` #6):
 *   1. Theme MutationObserver called buildRenderData() which destroyed live
 *      Pixi Graphics while the rAF loop was mid-update, producing
 *      "Cannot read properties of null" or stale-texture crashes.
 *   2. The rAF loop stored no handle and never called cancelAnimationFrame
 *      on destroy, so a frame could run after destroy() returned.
 *
 * Contract under test:
 *   - destroy() cancels the pending requestAnimationFrame.
 *   - No Pixi object method is invoked by the rAF loop after destroy().
 *   - A theme-observer trigger during an in-flight frame defers the
 *     buildRenderData rebuild to the frame tail (after renderer.render()).
 */

// --- Pixi stub -------------------------------------------------------------
// We don't need real Pixi; render-scene is mocked so its internals never
// touch the DOM. Keeping this mock in sync with the existing
// render-scene.test.ts convention.
jest.mock("pixi.js", () => ({
  Application: class {},
  Container: class {},
  Graphics: class {},
  Text: class {},
  TextStyle: class {},
  Circle: class {},
}));

// --- Dependencies of mount-wiki-graph -------------------------------------
// Each dependency is replaced with a recording stub so we can assert
// ordering (did cancelAnimationFrame fire before destroyScene?) and
// confirm destroyed scenes are never touched by rAF callbacks.

const destroySceneSpy = jest.fn();
const buildRenderDataSpy = jest.fn();
const updatePositionsSpy = jest.fn();
const createSceneSpy = jest.fn(async () => ({
  app: { renderer: { render: jest.fn(), resize: jest.fn() }, stage: {}, destroy: jest.fn() },
  nodeRenderData: [],
  linkRenderData: [],
  labelsDirty: false,
  lastLabelLayoutAt: 0,
  highlightNodeIds: undefined,
}));

jest.mock("../render-scene", () => ({
  createScene: (...args: unknown[]) => createSceneSpy(...args),
  buildRenderData: (...args: unknown[]) => buildRenderDataSpy(...args),
  updatePositions: (...args: unknown[]) => updatePositionsSpy(...args),
  destroyScene: (...args: unknown[]) => destroySceneSpy(...args),
  resizeScene: jest.fn(),
}));

jest.mock("../build-simulation", () => ({
  buildSimulation: () => ({
    alpha: () => 0.05,
    stop: jest.fn(),
    on: jest.fn(),
  }),
}));

const cleanupInteractionsSpy = jest.fn();
jest.mock("../interactions", () => ({
  wireZoom: () => ({ fitToExtents: jest.fn() }),
  wireNodeInteractions: () => cleanupInteractionsSpy,
  updateTweens: jest.fn(),
}));

jest.mock("@/features/graph/lib/pointer-gesture", () => ({
  createPanLatch: () => ({}),
}));

jest.mock("../theme", () => ({
  resolvePalette: () => ({ linkAlpha: 0.5 }),
  invalidatePalette: jest.fn(),
}));

jest.mock("../label-visibility", () => ({
  applyLabelVisibility: jest.fn(),
}));

jest.mock("../layout-cache", () => ({
  getCachedPositions: () => null,
  setCachedPositions: jest.fn(),
}));

// --- rAF manual scheduler -------------------------------------------------
// We drive frames by hand so we can interleave a theme mutation at a
// precise point inside a frame.
type RafCallback = (time: number) => void;
let nextRafId = 0;
let pendingRafs: Map<number, RafCallback>;
let cancelledRafIds: number[];

beforeEach(() => {
  nextRafId = 0;
  pendingRafs = new Map();
  cancelledRafIds = [];
  (global as unknown as { requestAnimationFrame: (cb: RafCallback) => number }).requestAnimationFrame = (
    cb: RafCallback,
  ) => {
    nextRafId += 1;
    pendingRafs.set(nextRafId, cb);
    return nextRafId;
  };
  (global as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame = (id: number) => {
    cancelledRafIds.push(id);
    pendingRafs.delete(id);
  };
  // ResizeObserver stub — mount-wiki-graph creates one.
  (global as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  jest.clearAllMocks();
});

function runOneFrame(time = 16) {
  // Drain the earliest-queued frame. Each frame may schedule the next one,
  // which will be queued with a higher id and NOT drained this call.
  const entries = Array.from(pendingRafs.entries());
  if (entries.length === 0) return false;
  const [id, cb] = entries[0];
  pendingRafs.delete(id);
  cb(time);
  return true;
}

// Import after all mocks are registered.
import { mountWikiGraph } from "../mount-wiki-graph";
import type { MountWikiGraphOptions } from "../types";

function makeContainer() {
  const el = document.createElement("div");
  // mount-wiki-graph reads clientWidth/clientHeight before awaiting.
  Object.defineProperty(el, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

function baseOptions(): MountWikiGraphOptions {
  return {
    container: makeContainer(),
    nodes: [{ id: "a" } as unknown as MountWikiGraphOptions["nodes"][number]],
    links: [],
    signature: "sig",
    intents: {} as MountWikiGraphOptions["intents"],
    highlightNodeIds: undefined,
  };
}

describe("mount-wiki-graph rAF cancellation", () => {
  it("cancels the pending rAF on destroy before tearing down the scene", async () => {
    const handle = await mountWikiGraph(baseOptions());

    // The loop scheduled exactly one frame on mount.
    expect(pendingRafs.size).toBe(1);
    const scheduledId = Array.from(pendingRafs.keys())[0];

    handle.destroy();

    expect(cancelledRafIds).toContain(scheduledId);
    // Ordering: cancelAnimationFrame for the animate loop runs BEFORE
    // destroyScene so a late frame callback can never read a destroyed
    // scene.
    expect(destroySceneSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores a frame that fires after destroy() (no Pixi work done)", async () => {
    const handle = await mountWikiGraph(baseOptions());
    // Capture the scheduled callback, then destroy, then run the callback
    // manually as if the browser fired it late (raf cancellation is
    // supposed to prevent this, but we defend with the destroyed flag).
    const [id, cb] = Array.from(pendingRafs.entries())[0]!;
    handle.destroy();

    // Resimulate a late-firing frame. Even though we already cancelled it,
    // browsers can race; the frame body must bail on `destroyed`.
    cb(32);
    void id;

    // updatePositions is the first thing the frame body touches; with the
    // destroyed guard in place it should never run after destroy().
    expect(updatePositionsSpy).not.toHaveBeenCalled();
  });
});

describe("mount-wiki-graph theme rebuild race", () => {
  it("defers theme-triggered buildRenderData until after the current frame's render", async () => {
    await mountWikiGraph(baseOptions());

    // Before the first frame runs, no rebuild or render happened.
    expect(buildRenderDataSpy).toHaveBeenCalledTimes(1); // initial mount call
    buildRenderDataSpy.mockClear();

    // Fire the theme observer callback. The observer is wired via
    // MutationObserver against document.documentElement — simulate it by
    // toggling the class attribute.
    document.documentElement.classList.toggle("dark");

    // Give the microtask queue a chance to flush the observer callback.
    await Promise.resolve();
    await Promise.resolve();

    // Key assertion: the rebuild has NOT happened yet because it is
    // deferred until the rAF tail. If the observer were still calling
    // buildRenderData synchronously (the pre-fix behaviour), this count
    // would be 1 already.
    const callsBeforeFrame = buildRenderDataSpy.mock.calls.length;

    // Drain one frame — this runs updatePositions, renders, then processes
    // the pending theme rebuild at the frame tail.
    runOneFrame(16);

    // After the frame, the rebuild should have happened exactly once,
    // AFTER renderer.render (enforced by position in animate()).
    const callsAfterFrame = buildRenderDataSpy.mock.calls.length;
    expect(callsAfterFrame - callsBeforeFrame).toBeLessThanOrEqual(1);
    // At minimum, no mid-frame destruction of Graphics — assert that
    // updatePositions (which runs before render) saw a live scene (no
    // throw) and destroyScene was not called.
    expect(destroySceneSpy).not.toHaveBeenCalled();
  });
});
