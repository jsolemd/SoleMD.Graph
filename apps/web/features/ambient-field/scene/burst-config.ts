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
