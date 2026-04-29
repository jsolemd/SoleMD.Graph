/**
 * @jest-environment jsdom
 *
 * Wave 2B regression: pickAsync results carry a generation token. When
 * two picks are in flight and they resolve out of order (e.g. the
 * second pick's readback wins the GPU race), the consumer must drop
 * the lower-generation result silently — committing it would write a
 * stale set on top of the winning newer pick.
 */
import { act, cleanup, renderHook } from "@testing-library/react";

import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import {
  useOrbPickerStore,
  type OrbPickerHandle,
  type OrbPickResult,
} from "../orb-picker-store";
import { useOrbHover } from "../use-orb-hover";

interface DeferredPick {
  resolve: (value: OrbPickResult) => void;
  promise: Promise<OrbPickResult>;
}

function deferred(): DeferredPick {
  let resolve!: (value: OrbPickResult) => void;
  const promise = new Promise<OrbPickResult>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

// Queued rAF: callbacks fire only when `flushRaf()` runs. We can't use
// a synchronous rAF-fires-cb pattern because the hook assigns
// `rafRef.current = requestAnimationFrame(...)` AFTER the callback
// would have already cleared it, leaving a stale id that blocks the
// next move.
let rafQueue: Array<FrameRequestCallback> = [];
let nextRafId = 1;

function installQueuedRaf(): void {
  rafQueue = [];
  nextRafId = 1;
  (window as unknown as {
    requestAnimationFrame: typeof requestAnimationFrame;
  }).requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return nextRafId++;
  }) as typeof requestAnimationFrame;
  (window as unknown as {
    cancelAnimationFrame: typeof cancelAnimationFrame;
  }).cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
}

function flushRaf(): void {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(0);
}

describe("orb picker generation token — stale-result drop", () => {
  beforeEach(() => {
    useOrbFocusVisualStore.getState().reset();
    useOrbPickerStore.setState({ handle: null });
    installQueuedRaf();
  });

  afterEach(() => {
    cleanup();
  });

  it("drops a slow first pick when a later pick has already won", async () => {
    const first = deferred();
    const second = deferred();
    const calls: DeferredPick[] = [first, second];
    let callCount = 0;

    const handle: OrbPickerHandle = {
      pickAsync: jest.fn(() => {
        const next = calls[callCount];
        callCount += 1;
        if (!next) throw new Error("unexpected extra pickAsync call");
        return next.promise;
      }),
      pickRectAsync: jest.fn(),
      bumpPickGeneration: jest.fn(),
    };
    useOrbPickerStore.getState().setHandle(handle);

    const setHoverIndexSpy = jest.spyOn(
      useOrbFocusVisualStore.getState(),
      "setHoverIndex",
    );

    const { result } = renderHook(() =>
      useOrbHover({ particleCount: 1000, enabled: true }),
    );

    // First move + flush → pickAsync #1 dispatched.
    act(() => {
      result.current.handleHoverMove(10, 10);
    });
    act(() => {
      flushRaf();
    });
    // Second move + flush → pickAsync #2 dispatched. flushRaf clears
    // the queued callback before rafRef.current is reassigned, so
    // handleHoverMove sees rafRef.current = null on the next call.
    act(() => {
      result.current.handleHoverMove(20, 20);
    });
    act(() => {
      flushRaf();
    });
    expect(handle.pickAsync).toHaveBeenCalledTimes(2);

    // Resolve the SECOND pick first (newer generation arrives first).
    second.resolve({ index: 222, generation: 5 });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setHoverIndexSpy).toHaveBeenLastCalledWith(222);

    // Now resolve the FIRST pick — it carries an older generation
    // token (3) than the watermark we just set (5). The consumer must
    // drop it silently: setHoverIndex must NOT be called with 111.
    first.resolve({ index: 111, generation: 3 });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const calledWith111 = setHoverIndexSpy.mock.calls.some(
      ([arg]) => arg === 111,
    );
    expect(calledWith111).toBe(false);
    // The freshest write still stands.
    expect(useOrbFocusVisualStore.getState().hoverIndex).toBe(222);
  });

  it("accepts in-order picks; each freshens the watermark", async () => {
    const first = deferred();
    const second = deferred();
    const calls: DeferredPick[] = [first, second];
    let callCount = 0;

    const handle: OrbPickerHandle = {
      pickAsync: jest.fn(() => {
        const next = calls[callCount];
        callCount += 1;
        if (!next) throw new Error("unexpected extra pickAsync call");
        return next.promise;
      }),
      pickRectAsync: jest.fn(),
      bumpPickGeneration: jest.fn(),
    };
    useOrbPickerStore.getState().setHandle(handle);

    const setHoverIndexSpy = jest.spyOn(
      useOrbFocusVisualStore.getState(),
      "setHoverIndex",
    );

    const { result } = renderHook(() =>
      useOrbHover({ particleCount: 1000, enabled: true }),
    );

    act(() => {
      result.current.handleHoverMove(10, 10);
    });
    act(() => {
      flushRaf();
    });
    first.resolve({ index: 100, generation: 1 });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setHoverIndexSpy).toHaveBeenLastCalledWith(100);

    act(() => {
      result.current.handleHoverMove(20, 20);
    });
    act(() => {
      flushRaf();
    });
    second.resolve({ index: 200, generation: 2 });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setHoverIndexSpy).toHaveBeenLastCalledWith(200);
  });
});
