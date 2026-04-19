import { semanticColorFallbackHexByKey } from "@/lib/pastel-tokens";

// SoleMD semantic-burst color mapping. Each bucket id in SOLEMD_DEFAULT_BUCKETS
// has one canonical hex here; the burst overlay shader reads it through the
// per-bucket `uBurstColor` uniform when that bucket is the active tint target.
// Paired with Maze's homepage palette (#42A4FE / #8958FF / #02E8FF / #D409FE)
// so foreground bursts stay in the same color family as Maze's unused bake
// palette (`scripts.pretty.js:42641-42664`).

export const SOLEMD_BURST_COLORS: Record<string, string> = {
  paper: "#42A4FE",
  entity: "#8958FF",
  relation: "#02E8FF",
  evidence: "#D409FE",
};

// Phase-id -> bucket-id routing. The landing page tracks scroll chapters via
// sceneState.phases ("paperHighlights", "detailInspection", …) rather than
// raw bucket ids; this map picks which bucket each phase tints.
export const PHASE_TO_BUCKET: Record<string, string> = {
  paperHighlights: "paper",
  paperCards: "paper",
  paperFocus: "paper",
  detailInspection: "entity",
  synthesisLinks: "relation",
  reform: "evidence",
};

// Cool-tone burst palette for the landing page. The burst controller walks
// this list one step per non-null bucket transition so consecutive bursts
// read through more than just magenta while staying in the blue → purple →
// magenta family that pairs with Maze's cyan→magenta ambient base. Order
// alternates Maze-saturated (from SOLEMD_BURST_COLORS) and pastel-semantic
// (from semanticColorFallbackHexByKey, the GL-side resolver for the
// `--color-semantic-*` tokens in `apps/web/lib/pastel-tokens.ts`) entries so
// adjacent bursts feel related, not abrupt. No hexes live in this array —
// every entry resolves through one of the two existing token sources.
export const LANDING_BURST_PALETTE: readonly string[] = [
  SOLEMD_BURST_COLORS.paper!,
  semanticColorFallbackHexByKey.gene,
  SOLEMD_BURST_COLORS.entity!,
  semanticColorFallbackHexByKey.phys,
  SOLEMD_BURST_COLORS.relation!,
  semanticColorFallbackHexByKey.proc,
  SOLEMD_BURST_COLORS.evidence!,
  semanticColorFallbackHexByKey.section,
];

function hexToRgb(hex: string): readonly [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff] as const;
}

// Full semantic rainbow, hue-ordered so adjacent stops lerp through
// neighbouring hues. Drives the shader's per-bucket `uBucketAccents[4]`
// array on the blob layer: each of the four semantic buckets samples this
// palette at a quarter-period phase offset, so four hues always coexist
// (see FieldScene.tsx blob color hijack). The shared base (`uBaseColor`)
// stays at its Maze-cyan init value from visual-presets.ts, matching
// Maze's fixed-base contract at
// `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:42564-42567`.
//
// Saturated hand-picked rainbow (~85-100% sat) — pairs with Maze's
// saturated magenta (#D409FE) base without reading washed out. The
// pastel `semanticColorFallbackHexByKey` tokens (35-55% sat) stay the
// UI source of truth for the `--color-semantic-*` variables; this array
// is GL-side only. Each stop labels the semantic bucket it represents,
// and three (phys/section/proc) deliberately align with
// `SOLEMD_BURST_COLORS` (paper/entity/evidence) so the cycle anchors to
// the brand identity.
export const LANDING_ACCENT_RAINBOW_RGB: readonly (readonly [number, number, number])[] = [
  hexToRgb("#FF7A3C"), // orange   (diso)
  hexToRgb("#FFC132"), // gold     (anat)
  hexToRgb("#3FD656"), // green    (chem)
  hexToRgb("#20D9A8"), // teal     (module)
  hexToRgb("#42A4FE"), // sky blue (phys,    = paper brand)
  hexToRgb("#8958FF"), // violet   (section, = entity brand)
  hexToRgb("#D409FE"), // magenta  (proc,    = evidence brand)
  hexToRgb("#FF3FB7"), // hot pink (gene)
];
