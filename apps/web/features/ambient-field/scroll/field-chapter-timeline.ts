import type { UniformScrubber } from "./ambient-field-uniform-scrubber";

// Chapter timeline — declarative GSAP-timeline replacement. Each event
// has a label, an `atProgress` trigger point within the chapter's scroll
// span, a `duration` (also in progress units), and value directives
// (`set` / `to` / `from` / `fromTo`). `setProgress` computes the current
// target for every tracked key by interpolating all active events.
//
// This replaces Maze's `gsap.timeline({ scrub: 1 })` + `.to(...)` calls
// (scripts.pretty.js:43291-43414) with a platform-neutral data model
// that pipes through `UniformScrubber` for the same 1 s lerp feel.

export interface ChapterEvent<K extends string> {
  label?: string;
  atProgress: number;
  duration: number;
  set?: Partial<Record<K, number>>;
  to?: Partial<Record<K, number>>;
  from?: Partial<Record<K, number>>;
  fromTo?: Partial<Record<K, readonly [number, number]>>;
}

export interface FieldChapterTimelineOptions<K extends string> {
  events: readonly ChapterEvent<K>[];
  scrubber: UniformScrubber<K>;
  initialTargets?: Partial<Record<K, number>>;
}

export interface FieldChapterTimeline<K extends string> {
  setProgress(progress: number): void;
  applyTargets(dtMs: number): Record<K, number>;
  current(): Record<K, number>;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function createFieldChapterTimeline<K extends string>(
  options: FieldChapterTimelineOptions<K>,
): FieldChapterTimeline<K> {
  const { events, scrubber, initialTargets } = options;
  const targets = { ...(initialTargets ?? {}) } as Record<K, number>;
  let currentProgress = 0;

  function evaluateEvent(event: ChapterEvent<K>, progress: number) {
    // `set` fires at atProgress without interpolation.
    if (event.set && progress >= event.atProgress) {
      for (const [key, value] of Object.entries(event.set) as [K, number][]) {
        if (typeof value === "number") targets[key] = value;
      }
    }
    const windowEnd = event.atProgress + event.duration;
    const active = progress > event.atProgress && event.duration > 0;
    const resolvedT = active
      ? clamp01((progress - event.atProgress) / event.duration)
      : progress >= windowEnd
        ? 1
        : 0;

    if (event.fromTo) {
      for (const [key, pair] of Object.entries(event.fromTo) as [K, readonly [number, number]][]) {
        if (!pair) continue;
        targets[key] = pair[0] + (pair[1] - pair[0]) * resolvedT;
      }
    }
    if (event.from && progress <= event.atProgress) {
      for (const [key, value] of Object.entries(event.from) as [K, number][]) {
        if (typeof value === "number") targets[key] = value;
      }
    }
    if (event.to && progress >= event.atProgress) {
      for (const [key, value] of Object.entries(event.to) as [K, number][]) {
        if (typeof value === "number") {
          const start = targets[key] ?? value;
          targets[key] = start + (value - start) * resolvedT;
        }
      }
    }
  }

  function setProgress(progress: number) {
    currentProgress = clamp01(progress);
    for (const event of events) evaluateEvent(event, currentProgress);
  }

  function applyTargets(dtMs: number): Record<K, number> {
    return scrubber.step(dtMs, { ...targets });
  }

  function current(): Record<K, number> {
    return { ...targets };
  }

  return { setProgress, applyTargets, current };
}
