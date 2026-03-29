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
/** Floor width when side panels squeeze available space. */
export const MIN_AVAILABLE_W = 300;
/** Horizontal gap between card edges and panel edges. */
export const PANEL_GAP = 48;
/** Collapsed pill height target. */
export const PILL_H = 48;
/** Collapsed pill left-edge offset from viewport left. */
export const PILL_LEFT = 12;

export const SCOPE_LABELS: Record<string, string> = {
  paper: "paper",
  chunk: "chunk",
  term: "term",
  alias: "alias",
  relation_assertion: "relation",
};

/** Compute card width for normal mode, respecting panel clearance. */
export function cardWidth(vw: number, leftCl: number, rightCl: number): number {
  if (leftCl > 0 || rightCl > 0) {
    const avail = Math.max(MIN_AVAILABLE_W, vw - leftCl - rightCl - PANEL_GAP);
    return Math.round(Math.min(MAX_CARD_W, vw * VW_RATIO, avail));
  }
  return Math.round(Math.min(MAX_CARD_W, vw * VW_RATIO));
}
