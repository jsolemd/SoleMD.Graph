/// <reference types="@webgpu/types" />

// Shared perf-mark helpers for the orb WebGPU runtime, picking, and
// per-frame weight tick. All marks are gated by the `__orbPerf` boolean
// on globalThis (set window.__orbPerf = true in DevTools to enable). The
// flag is read once per call site — never inside a hot loop — so the
// overhead is a single property access when the flag is off.

export const ORB_PERF_FLAG = "__orbPerf";
export const ORB_PERF_MEASURE_PREFIX = "orb:";
export const ORB_PERF_MEASURE_TAIL = 120;
export const ORB_DEBUG_KEY = "__orbDebug";

export function isOrbPerfOn(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    (globalThis as { [key: string]: unknown })[ORB_PERF_FLAG] === true
  );
}

export function markPerf(name: string): void {
  if (!isOrbPerfOn()) return;
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    try {
      performance.mark(name);
    } catch {
      // mark API can throw if buffer is full or name is invalid; never
      // let perf instrumentation break the runtime.
    }
  }
}

export function measurePerf(name: string, start: string, end: string): void {
  if (!isOrbPerfOn()) return;
  if (
    typeof performance !== "undefined" &&
    typeof performance.measure === "function"
  ) {
    try {
      performance.measure(name, start, end);
    } catch {
      // measure throws if the start mark is missing (rare across hot
      // reloads). Swallow so perf gates never crash a frame.
    }
  }
}

// Returns the most recent N performance measures whose name starts with
// `orb:`. Wave 2C reads this through `window.__orbDebug.perfMarks()`.
export function getOrbPerfMarks(): PerformanceMeasure[] {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function"
  ) {
    return [];
  }
  const entries = performance.getEntriesByType("measure") as PerformanceMeasure[];
  const filtered = entries.filter((entry) =>
    entry.name.startsWith(ORB_PERF_MEASURE_PREFIX),
  );
  if (filtered.length <= ORB_PERF_MEASURE_TAIL) return filtered;
  return filtered.slice(filtered.length - ORB_PERF_MEASURE_TAIL);
}

interface OrbDebugBag {
  perfMarks?: () => PerformanceMeasure[];
  [extra: string]: unknown;
}

// Attach `__orbDebug.perfMarks` to globalThis so DevTools can pull
// recent measures during Wave 2C overlay work. Returns a detach
// callback; the runtime calls it from destroy(). No-op when the perf
// flag is off — we never expose the debug surface unsolicited.
export function attachOrbDebugPerfMarks(): () => void {
  if (!isOrbPerfOn() || typeof globalThis === "undefined") return () => {};
  const root = globalThis as { [ORB_DEBUG_KEY]?: OrbDebugBag };
  const bag: OrbDebugBag = root[ORB_DEBUG_KEY] ?? {};
  bag.perfMarks = getOrbPerfMarks;
  root[ORB_DEBUG_KEY] = bag;
  return () => {
    if (root[ORB_DEBUG_KEY]?.perfMarks === getOrbPerfMarks) {
      delete root[ORB_DEBUG_KEY]!.perfMarks;
    }
  };
}
