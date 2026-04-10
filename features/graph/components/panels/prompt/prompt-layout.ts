/**
 * Pure layout target resolution for the PromptBox.
 *
 * Extracted from usePromptPosition to separate computation from
 * React effect orchestration. All functions are pure — no hooks, no refs.
 */
import { resolvePromptAutoPosition, type PromptAvoidRect } from "./avoidance";
import {
  BOTTOM_BASE,
  VIEWPORT_MARGIN,
  PILL_LEFT,
  cardWidth,
} from "./constants";

export interface LayoutClearances {
  leftClearance: number;
  rightClearance: number;
  leftPanelBottom: number;
  rightPanelBottom: number;
}

export function resolveCollapsedTarget(vw: number, targetY: number) {
  return {
    x: PILL_LEFT - vw / 2,
    y: targetY,
  };
}

export function resolveNormalTarget(
  vw: number,
  vh: number,
  targetY: number,
  cardH: number,
  clearances: LayoutClearances,
  avoidRects?: PromptAvoidRect[],
) {
  const { leftClearance, rightClearance, leftPanelBottom, rightPanelBottom } = clearances;
  const cardW = cardWidth(vw, leftClearance, rightClearance);
  const promptTop = vh - BOTTOM_BASE - cardH + targetY;
  const centeredLeft = vw / 2 - cardW / 2;
  const centeredRight = centeredLeft + cardW;
  let minX = VIEWPORT_MARGIN - centeredLeft;
  let maxX = (vw - VIEWPORT_MARGIN) - centeredRight;
  const maxUp = -(vh - BOTTOM_BASE - cardH - VIEWPORT_MARGIN);

  if (leftClearance > 0 && leftPanelBottom > promptTop && centeredLeft < leftClearance) {
    minX = leftClearance - centeredLeft;
  }
  if (rightClearance > 0 && rightPanelBottom > promptTop && centeredRight > vw - rightClearance) {
    maxX = (vw - rightClearance) - centeredRight;
  }

  const baseTargetX = minX <= maxX
    ? Math.max(minX, Math.min(0, maxX))
    : Math.max(Math.min(0, minX), maxX);

  return resolvePromptAutoPosition({
    vw,
    vh,
    cardW,
    cardH,
    baseX: baseTargetX,
    baseY: targetY,
    minX,
    maxX,
    minY: maxUp,
    maxY: targetY,
    bottomBase: BOTTOM_BASE,
    avoidRects,
  });
}
