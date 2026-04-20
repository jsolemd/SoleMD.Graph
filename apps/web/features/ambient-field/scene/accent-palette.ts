// Ambient-field accent palette. The landing blob carries the full 8-stop
// saturated rainbow at rest via two parallel uniform arrays — each (base,
// noise) pair feeds the Maze binary-lerp shape `base + clamp(vNoise,0,1) *
// 4 * (noise - base)`. Sibling-adjacent pairing (stop N paired with stop
// N+1) keeps every bucket's two hues on neighboring wheel positions, so
// particles read as smooth color shifts rather than hard transitions.
//
// Color space notes:
// - `SOLEMD_BURST_COLORS` anchors the SoleMD semantic buckets (paper /
//   entity / relation / evidence) to Maze's unused bake palette family
//   (`scripts.pretty.js:42641-42664`). Still exported because
//   `asset/point-source-registry.ts` uses it to tint the CPU-side
//   `buffers.color` array consumed by hotspot readers.
// - `LANDING_RAINBOW_RGB` is a hand-picked saturated wheel (~85-100% sat)
//   that pairs with Maze's saturated magenta base without reading washed
//   out. The pastel `--color-semantic-*` tokens stay the UI source of
//   truth; this palette is GL-side only.

export const SOLEMD_BURST_COLORS: Record<string, string> = {
  paper: "#42A4FE",
  entity: "#8958FF",
  relation: "#02E8FF",
  evidence: "#D409FE",
};

function hexToRgb(hex: string): readonly [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff] as const;
}

// 8 rainbow stops, hue-ordered so adjacent stops sit on neighboring wheel
// positions. Three stops (phys/section/proc) align with
// `SOLEMD_BURST_COLORS` (paper/entity/evidence) to anchor the wheel to
// brand identity.
export const LANDING_RAINBOW_RGB: readonly (readonly [number, number, number])[] = [
  hexToRgb("#FF7A3C"), // orange
  hexToRgb("#FFC132"), // gold
  hexToRgb("#3FD656"), // green
  hexToRgb("#20D9A8"), // teal
  hexToRgb("#42A4FE"), // sky blue (= paper brand)
  hexToRgb("#8958FF"), // violet   (= entity brand)
  hexToRgb("#D409FE"), // magenta  (= evidence brand)
  hexToRgb("#FF3FB7"), // hot pink
];

// Paired uniform arrays. The shader reads `uBucketBases[b]` and
// `uBucketNoises[b]` together via `int b = int(aBucket) % 8`, then runs
// the Maze binary-lerp shape on the pair. Each base's noise is its
// sibling-adjacent successor (index+1 mod 8), so every pair carries two
// neighboring rainbow stops. With the current 4-valued `aBucket`
// (`paper/entity/relation/evidence` in SOLEMD_DEFAULT_BUCKETS), only
// slots 0..3 are ever sampled per particle; slots 4..7 mirror 0..3 so
// future aBucket expansion is a drop-in. Because each of the 4 live
// pairs spans two adjacent stops, all 8 rainbow hues show up across the
// field simultaneously.
export const LANDING_BUCKET_BASES_RGB: readonly (readonly [number, number, number])[] = [
  LANDING_RAINBOW_RGB[0]!, // slot 0 base = orange
  LANDING_RAINBOW_RGB[2]!, // slot 1 base = green
  LANDING_RAINBOW_RGB[4]!, // slot 2 base = sky blue
  LANDING_RAINBOW_RGB[6]!, // slot 3 base = magenta
  LANDING_RAINBOW_RGB[0]!, // slot 4 (reserved)
  LANDING_RAINBOW_RGB[2]!,
  LANDING_RAINBOW_RGB[4]!,
  LANDING_RAINBOW_RGB[6]!,
];

export const LANDING_BUCKET_NOISES_RGB: readonly (readonly [number, number, number])[] = [
  LANDING_RAINBOW_RGB[1]!, // slot 0 noise = gold   (orange → gold)
  LANDING_RAINBOW_RGB[3]!, // slot 1 noise = teal   (green  → teal)
  LANDING_RAINBOW_RGB[5]!, // slot 2 noise = violet (sky    → violet)
  LANDING_RAINBOW_RGB[7]!, // slot 3 noise = pink   (magenta→ pink)
  LANDING_RAINBOW_RGB[1]!,
  LANDING_RAINBOW_RGB[3]!,
  LANDING_RAINBOW_RGB[5]!,
  LANDING_RAINBOW_RGB[7]!,
];

// Maze cyan→magenta stays available for layers that want 1:1 parity with
// Maze's base material — the stream/pcb defaults below repeat the same
// pair across all 8 slots, so every particle lerps cyan→magenta exactly
// like Maze's six-scalar family.
const MAZE_CYAN: readonly [number, number, number] = [40, 197, 234];
const MAZE_MAGENTA: readonly [number, number, number] = [202, 50, 223];

export const MAZE_DEFAULT_BASES_RGB: readonly (readonly [number, number, number])[] =
  Array.from({ length: 8 }, () => MAZE_CYAN);

export const MAZE_DEFAULT_NOISES_RGB: readonly (readonly [number, number, number])[] =
  Array.from({ length: 8 }, () => MAZE_MAGENTA);
