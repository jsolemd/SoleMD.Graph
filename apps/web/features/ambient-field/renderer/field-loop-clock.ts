// Module-level monotonic clock for the ambient-field shader. Survives
// React StrictMode double-mount and Next.js warmup remounts because the
// epoch lives in module scope rather than a component ref. Everything
// downstream (uTime, scroll scrubber, burst controller) reads elapsed-ms
// from here.
//
// Source rationale: Maze's runtime increments `uTime.value += 0.002` per
// frame from a single shared RAF loop (`scripts.pretty.js:43047-43049`).
// We produce the same monotonic time base, but driven off `performance.now()`
// to stay independent of RAF frequency and of React's render lifecycle.

let epochMs: number | null = null;

function now(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

export function getAmbientFieldElapsedMs(atMs?: number): number {
  const reference = atMs ?? now();
  if (epochMs == null) {
    epochMs = reference;
    return 0;
  }
  return Math.max(0, reference - epochMs);
}

export function getAmbientFieldElapsedSeconds(atMs?: number): number {
  return getAmbientFieldElapsedMs(atMs) / 1000;
}

export function __resetAmbientFieldLoopClockForTests(): void {
  epochMs = null;
}
