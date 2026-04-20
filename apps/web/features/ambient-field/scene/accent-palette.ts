// Ambient-field accent palette. The shader uses Maze's single-pair
// `uColorBase` + `uColorNoise` uniforms; `BlobController` runtime-tweens
// `uColorNoise` through `LANDING_RAINBOW_RGB` one stop at a time to give
// rolling waves of color across the field. `uColorBase` is fixed at
// `LANDING_BASE_BLUE` so the blob reads as blue at rest.
//
// Color space notes:
// - `SOLEMD_BURST_COLORS` anchors the SoleMD semantic buckets (paper /
//   entity / relation / evidence) to Maze's unused bake palette family
//   (`scripts.pretty.js:42641-42664`). Consumed by
//   `asset/point-source-registry.ts` to tint the CPU-side `buffers.color`
//   array used by hotspot readers (`getPointColorCss`).
// - `LANDING_RAINBOW_RGB` is a hand-picked saturated wheel (~85-100% sat)
//   that reads vivid against a blue base. GL-side only; the pastel
//   `--color-semantic-*` tokens stay the UI source of truth.

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

// Landing blob base hue. Tuned against the pastel `--color-soft-blue`
// token: saturated enough to carry against the rainbow sweep, cool
// enough that the blob reads blue (not pink) at the mid-cycle instant
// when `uColorNoise` lands on the magenta rainbow stop.
export const LANDING_BASE_BLUE: readonly [number, number, number] =
  hexToRgb("#2FA4FF");

// 8 rainbow stops, hue-ordered so adjacent stops sit on neighboring wheel
// positions. The BlobController timeline tweens `uColorNoise` through
// these in order with a hold per stop, so the field shows one color
// "wave" at a time rather than all eight simultaneously.
export const LANDING_RAINBOW_RGB: readonly (readonly [number, number, number])[] = [
  hexToRgb("#FF7A3C"), // orange
  hexToRgb("#FFC132"), // gold
  hexToRgb("#3FD656"), // green
  hexToRgb("#20D9A8"), // teal
  hexToRgb("#42A4FE"), // sky blue  (= paper brand)
  hexToRgb("#8958FF"), // violet    (= entity brand)
  hexToRgb("#D409FE"), // magenta   (= evidence brand)
  hexToRgb("#FF3FB7"), // hot pink
];
