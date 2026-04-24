/**
 * @jest-environment jsdom
 */
import { bindShellStateClasses } from "../bind-shell-state-classes";

type RafCb = (time: number) => void;

let rafQueue: RafCb[] = [];
let rafId = 0;

function flushRaf() {
  const queued = rafQueue;
  rafQueue = [];
  for (const cb of queued) cb(performance.now());
}

beforeEach(() => {
  rafQueue = [];
  rafId = 0;
  (window as unknown as { requestAnimationFrame: (cb: RafCb) => number })
    .requestAnimationFrame = (cb: RafCb) => {
      rafId += 1;
      rafQueue.push(cb);
      return rafId;
    };
  (window as unknown as { cancelAnimationFrame: (id: number) => void })
    .cancelAnimationFrame = () => {
      rafQueue = [];
    };
  document.body.className = "";
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 1000, writable: true, configurable: true });
});

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });
}

describe("bindShellStateClasses scroll rAF batching", () => {
  it("coalesces multiple scroll events within one frame", () => {
    const teardown = bindShellStateClasses({ headerHeight: 100 });

    // Initial sync runs synchronously on bind (runSyncScrollState at startup).
    // After bind, clear class state to observe rAF-coalesced updates.
    document.body.classList.remove("is-scrolled");

    const toggleSpy = jest.spyOn(document.body.classList, "toggle");

    setScrollY(50);
    window.dispatchEvent(new Event("scroll"));
    setScrollY(100);
    window.dispatchEvent(new Event("scroll"));
    setScrollY(200);
    window.dispatchEvent(new Event("scroll"));

    // No rAF flushed yet — no class writes from syncScrollState should have fired.
    const callsBeforeFlush = toggleSpy.mock.calls.length;
    expect(callsBeforeFlush).toBe(0);

    // After flushing, syncScrollState runs exactly once (coalesced).
    flushRaf();

    // is-scrolled + is-scrolling-down + is-scrolled-header-height + 3 vh fractions = 6 toggle calls per pass.
    // If coalesced to one pass, we'd see a bounded number (6). If not, we'd see 18+.
    const callsAfterFlush = toggleSpy.mock.calls.length;
    expect(callsAfterFlush).toBeGreaterThan(0);
    expect(callsAfterFlush).toBeLessThanOrEqual(8);

    toggleSpy.mockRestore();
    teardown();
  });

  it("runs again after rAF flush", () => {
    const teardown = bindShellStateClasses({ headerHeight: 100 });
    const toggleSpy = jest.spyOn(document.body.classList, "toggle");

    setScrollY(50);
    window.dispatchEvent(new Event("scroll"));
    flushRaf();
    const first = toggleSpy.mock.calls.length;
    expect(first).toBeGreaterThan(0);

    setScrollY(300);
    window.dispatchEvent(new Event("scroll"));
    const beforeSecondFlush = toggleSpy.mock.calls.length;
    expect(beforeSecondFlush).toBe(first);
    flushRaf();
    const afterSecondFlush = toggleSpy.mock.calls.length;
    expect(afterSecondFlush).toBeGreaterThan(first);

    toggleSpy.mockRestore();
    teardown();
  });

  it("teardown cancels pending rAF — no run after teardown", () => {
    const teardown = bindShellStateClasses({ headerHeight: 100 });

    setScrollY(50);
    window.dispatchEvent(new Event("scroll"));

    const toggleSpy = jest.spyOn(document.body.classList, "toggle");
    teardown();
    flushRaf();

    // Pending rAF cancelled by teardown (rafQueue cleared by cancelAnimationFrame).
    expect(toggleSpy.mock.calls.length).toBe(0);
    toggleSpy.mockRestore();
  });
});
