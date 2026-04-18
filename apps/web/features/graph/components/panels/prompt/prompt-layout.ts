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
} from "./constants";

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
  cardW: number,
  cardH: number,
  avoidRects?: PromptAvoidRect[],
) {
  const centeredLeft = vw / 2 - cardW / 2;
  const centeredRight = centeredLeft + cardW;
  const minX = VIEWPORT_MARGIN - centeredLeft;
  const maxX = (vw - VIEWPORT_MARGIN) - centeredRight;
  const maxUp = -(vh - BOTTOM_BASE - cardH - VIEWPORT_MARGIN);

  return resolvePromptAutoPosition({
    vw,
    vh,
    cardW,
    cardH,
    baseX: 0,
    baseY: targetY,
    minX,
    maxX,
    minY: maxUp,
    maxY: targetY,
    bottomBase: BOTTOM_BASE,
    avoidRects,
  });
}

