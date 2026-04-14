// ── Prompt layout constants ──────────────────────────────────────────
import { APP_CHROME_PX, densityPx, densityViewportWidth } from "@/lib/density";

export const BOTTOM_BASE = densityPx(32);
export const VIEWPORT_MARGIN = densityPx(8);
/** Top clearance for write panel — below Wordmark icon row when panels visible. */
export const WRITE_TOP_CLEARANCE = densityPx(96);
/** Top clearance for write panel — no panel icons. */
export const WRITE_TOP_BASE = densityPx(56);
/** Maximum card width in any mode. */
export const MAX_CARD_W = densityPx(560);
/** Minimum card width in normal mode when desktop lanes get tight. */
export const MIN_CARD_W_NORMAL = densityPx(280);
/** Minimum card width in create mode (CSS clamp lower bound). */
export const MIN_CARD_W_CREATE = densityPx(530);
/** Viewport ratio for normal-mode width (90vw cap). */
export const VW_RATIO = 0.9;
/** Viewport ratio for create-mode card width. */
export const CREATE_CARD_RATIO = 0.5;
/** Collapsed pill height target. */
export const PILL_H = densityPx(48);
/** Collapsed pill left-edge offset from viewport left. */
export const PILL_LEFT = densityPx(12);
/** Standard prompt surface paddings and offsets. */
export const PROMPT_PADDING_X = densityPx(12);
export const PROMPT_PADDING_COLLAPSED_Y = densityPx(8);
export const PROMPT_PADDING_EXPANDED_TOP = densityPx(12);
export const PROMPT_PADDING_EXPANDED_BOTTOM = densityPx(8);
export const PROMPT_RECENTER_PADDING_Y = densityPx(12);
export const PROMPT_RECENTER_PADDING_X = densityPx(8);
export const PROMPT_CREATE_SIDE_INSET = APP_CHROME_PX.floatingViewportInset;
export const PROMPT_MIN_BOTTOM_CLEARANCE = APP_CHROME_PX.floatingViewportInset;
export const PROMPT_FALLBACK_NORMAL_HEIGHT = densityPx(100);
/** Extra padding around the focused point ring that overlays should avoid. */
export const FOCUSED_POINT_AVOIDANCE_PADDING = densityPx(18);
/** Approximate vertical gap between the focused point and its native label. */
export const FOCUSED_POINT_LABEL_GAP = densityPx(10);
/** Approximate native focused label height. */
export const FOCUSED_LABEL_HEIGHT = densityPx(28);
/** Approximate native label char width for viewport avoidance. */
export const FOCUSED_LABEL_ESTIMATED_CHAR_WIDTH = 6.4;
/** Minimum width reserved for the focused point label. */
export const FOCUSED_LABEL_MIN_WIDTH = densityPx(140);
/** Maximum width reserved for the focused point label. */
export const FOCUSED_LABEL_MAX_WIDTH = densityPx(320);
/** Fallback min width when the focused native label has not measured yet. */
export const FOCUSED_LABEL_FALLBACK_MIN_WIDTH = densityPx(220);

export const SCOPE_LABELS: Record<string, string> = {
  paper: "paper",
  chunk: "chunk",
  term: "term",
  alias: "alias",
  relation_assertion: "relation",
};

/** Compute card width for normal mode. */
export function cardWidth(vw: number): number {
  return densityViewportWidth(vw, VW_RATIO, { maxBase: 560 });
}
