// ── Prompt layout constants ──────────────────────────────────────────
export const BOTTOM_BASE = 32;
export const VIEWPORT_MARGIN = 8;
/** Top clearance for write panel — below Wordmark icon row when panels visible. */
export const WRITE_TOP_CLEARANCE = 96;
/** Top clearance for write panel — no panel icons. */
export const WRITE_TOP_BASE = 56;
/** Maximum card width in any mode. */
export const MAX_CARD_W = 560;
/** Minimum card width in create mode (CSS clamp lower bound). */
export const MIN_CARD_W_CREATE = 530;
/** Viewport ratio for normal-mode width (90vw cap). */
export const VW_RATIO = 0.9;
/** Collapsed pill height target. */
export const PILL_H = 48;
/** Collapsed pill left-edge offset from viewport left. */
export const PILL_LEFT = 12;
/** Extra padding around the focused point ring that overlays should avoid. */
export const FOCUSED_POINT_AVOIDANCE_PADDING = 18;
/** Approximate vertical gap between the focused point and its native label. */
export const FOCUSED_POINT_LABEL_GAP = 10;
/** Approximate native focused label height. */
export const FOCUSED_LABEL_HEIGHT = 28;
/** Approximate native label char width for viewport avoidance. */
export const FOCUSED_LABEL_ESTIMATED_CHAR_WIDTH = 6.4;
/** Minimum width reserved for the focused point label. */
export const FOCUSED_LABEL_MIN_WIDTH = 140;
/** Maximum width reserved for the focused point label. */
export const FOCUSED_LABEL_MAX_WIDTH = 320;

export const SCOPE_LABELS: Record<string, string> = {
  paper: "paper",
  chunk: "chunk",
  term: "term",
  alias: "alias",
  relation_assertion: "relation",
};

/** Compute card width for normal mode. */
export function cardWidth(vw: number): number {
  return Math.round(Math.min(MAX_CARD_W, vw * VW_RATIO));
}
