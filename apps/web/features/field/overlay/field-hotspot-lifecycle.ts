// FieldHotspotLifecycleController — Maze-parity per-hotspot reseed.
//
// Maze attaches an `animationend` listener to each hotspot; when that
// single hotspot's ring animation completes, it resets `--delay`, samples
// a new 3D attachment point, and restarts the animation for THAT hotspot
// only. Other hotspots keep their own independent cadence. SoleMD
// previously reseeded via a shared timer; this controller restores the
// per-hotspot path.
//
// Source: scripts.pretty.js:43421-43457 (pool + animationend wiring),
// :43470-43499 (rejection rules by hotspot index).

export interface HotspotSamplePosition {
  (index: number, retry: number): unknown | null;
}

export interface HotspotLifecycleControllerOptions {
  count: number;
  samplePosition: HotspotSamplePosition;
  sampleDelayMs?: () => number;
  durationMs?: number;
  maxRetries?: number;
  now?: () => number;
}

export interface HotspotRuntime {
  index: number;
  attachment: unknown | null;
  delayMs: number;
  seedKey: number;
  lastSeededAtMs: number;
}

export interface HotspotLifecycleController {
  readonly runtimes: readonly HotspotRuntime[];
  reseed(index: number): void;
  reseedAll(): void;
  onAnimationEnd(index: number): void;
}

const DEFAULT_DURATION_MS = 2000;
const DEFAULT_MAX_RETRIES = 20;

function defaultDelay(): number {
  return Math.random() * 2000;
}

export function createHotspotLifecycleController(
  options: HotspotLifecycleControllerOptions,
): HotspotLifecycleController {
  const {
    count,
    samplePosition,
    sampleDelayMs = defaultDelay,
    maxRetries = DEFAULT_MAX_RETRIES,
    now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  } = options;

  const runtimes: HotspotRuntime[] = Array.from({ length: count }, (_, index) => ({
    index,
    attachment: null,
    delayMs: sampleDelayMs(),
    seedKey: 0,
    lastSeededAtMs: 0,
  }));

  function sampleWithRetries(index: number): unknown | null {
    for (let retry = 0; retry < maxRetries; retry += 1) {
      const attachment = samplePosition(index, retry);
      if (attachment) return attachment;
    }
    return null;
  }

  function reseed(index: number) {
    const runtime = runtimes[index];
    if (!runtime) return;
    runtime.attachment = sampleWithRetries(index);
    runtime.delayMs = sampleDelayMs();
    runtime.seedKey += 1;
    runtime.lastSeededAtMs = now();
  }

  function reseedAll() {
    for (let i = 0; i < runtimes.length; i += 1) reseed(i);
  }

  function onAnimationEnd(index: number) {
    // Maze's pattern: on each hotspot's own animationend, resample
    // attachment and rewrite delay. Duration intentionally kept so the
    // next cycle fires at the same tempo unless the stage phase gate
    // changes.
    reseed(index);
  }

  return {
    runtimes,
    reseed,
    reseedAll,
    onAnimationEnd,
  };
}

export const HOTSPOT_CYCLE_DURATION_MS = DEFAULT_DURATION_MS;
