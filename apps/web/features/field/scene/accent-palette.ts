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

// Landing blob base hue. Tuned against the pastel `--color-soft-blue`
// token: saturated enough to carry against the rainbow sweep, cool
// enough that the blob reads blue (not pink) at the mid-cycle instant
// when `uColorNoise` lands on the magenta rainbow stop.
export {
  LANDING_BASE_BLUE_RGB as LANDING_BASE_BLUE,
  LANDING_RAINBOW_RGB,
  LANDING_RAINBOW_STOP_SECONDS,
} from "../shared/landing-feel-constants";
