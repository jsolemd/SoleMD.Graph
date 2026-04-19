// GSAP `scrub: 1` emulation for shader/DOM uniforms. Exposes a pure-function
// step() that lerps every tracked key toward its current target with a
// half-life-based low-pass filter, so fast scrolls visibly trail and settle
// rather than snapping.
//
// Formula: current += (target - current) * (1 - 0.5 ** (dtMs / halfLifeMs))
// 1 s half-life at 1 s of elapsed time reaches exactly 0.5 of the gap;
// 2 s reaches 0.75. Matches the perceived cadence of Maze's `scrub: 1`
// GSAP timeline (`scripts.pretty.js:43291-43414`).

export interface UniformScrubberOptions<K extends string> {
  halfLifeMs?: number;
  initial?: Partial<Record<K, number>>;
}

export interface UniformScrubber<K extends string> {
  step(dtMs: number, targets: Record<K, number>): Record<K, number>;
  reset(values?: Partial<Record<K, number>>): void;
  current(): Record<K, number>;
}

const DEFAULT_HALF_LIFE_MS = 1000;

export function createUniformScrubber<K extends string>(
  options: UniformScrubberOptions<K> = {},
): UniformScrubber<K> {
  const halfLifeMs = Math.max(1, options.halfLifeMs ?? DEFAULT_HALF_LIFE_MS);
  const state = new Map<K, number>();
  for (const [key, value] of Object.entries(options.initial ?? {}) as [K, number][]) {
    if (typeof value === "number") state.set(key, value);
  }

  function step(dtMs: number, targets: Record<K, number>) {
    const alpha = dtMs <= 0 ? 0 : 1 - Math.pow(0.5, dtMs / halfLifeMs);
    const out = {} as Record<K, number>;
    for (const key of Object.keys(targets) as K[]) {
      const target = targets[key];
      const prev = state.get(key) ?? target;
      const next = prev + (target - prev) * alpha;
      state.set(key, next);
      out[key] = next;
    }
    return out;
  }

  function reset(values?: Partial<Record<K, number>>) {
    if (!values) {
      state.clear();
      return;
    }
    for (const [key, value] of Object.entries(values) as [K, number][]) {
      if (typeof value === "number") state.set(key, value);
    }
  }

  function current() {
    const out = {} as Record<K, number>;
    for (const [key, value] of state.entries()) out[key] = value;
    return out;
  }

  return { step, reset, current };
}
