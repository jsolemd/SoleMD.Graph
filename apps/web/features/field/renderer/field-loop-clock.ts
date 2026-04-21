// Module-level monotonic clock for the field shader. Survives
// React StrictMode double-mount and Next.js warmup remounts because the
// epoch lives in module scope. Doubles as the single RAF subscriber bus
// for the field feature — FieldScene's R3F `useFrame` calls
// `tick(dt)` once per frame and the bus fans out to priority-ordered
// consumers (controllers, overlays, surface chrome).
//
// Priority bands (lower runs first):
//   10  scroll driver
//   20  controllers
//   30  hotspot projection
//   40  overlays
//   50  story progress
//   60  warmup action
//   70  landing-page chrome mode sync
//   80  scroll cue

let epochMs: number | null = null;

function now(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

export function getFieldElapsedMs(atMs?: number): number {
  const reference = atMs ?? now();
  if (epochMs == null) {
    epochMs = reference;
    return 0;
  }
  return Math.max(0, reference - epochMs);
}

export function getFieldElapsedSeconds(atMs?: number): number {
  return getFieldElapsedMs(atMs) / 1000;
}

export type FieldLoopTick = (dtSec: number, elapsedSec: number) => void;

interface FieldLoopSubscription {
  name: string;
  priority: number;
  tick: FieldLoopTick;
}

const subscribers = new Map<string, FieldLoopSubscription>();
let orderedCache: FieldLoopSubscription[] | null = null;

function rebuildOrder(): FieldLoopSubscription[] {
  const list = Array.from(subscribers.values());
  list.sort((a, b) => a.priority - b.priority);
  orderedCache = list;
  return list;
}

export function subscribe(
  name: string,
  priority: number,
  tick: FieldLoopTick,
): () => void {
  subscribers.set(name, { name, priority, tick });
  orderedCache = null;
  return () => unsubscribe(name);
}

export function unsubscribe(name: string): void {
  if (subscribers.delete(name)) orderedCache = null;
}

export function tick(dtSec: number): void {
  const ordered = orderedCache ?? rebuildOrder();
  const elapsedSec = getFieldElapsedSeconds();
  for (const sub of ordered) {
    try {
      sub.tick(dtSec, elapsedSec);
    } catch (error) {
      if (typeof console !== "undefined") {
        console.error(`[field-loop-clock] subscriber "${sub.name}" threw`, error);
      }
    }
  }
}

export function __resetFieldLoopClockForTests(): void {
  epochMs = null;
  subscribers.clear();
  orderedCache = null;
}

export const fieldLoopClock = {
  subscribe,
  unsubscribe,
  tick,
  getElapsedMs: getFieldElapsedMs,
  getElapsedSeconds: getFieldElapsedSeconds,
};
