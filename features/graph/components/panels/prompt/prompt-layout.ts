/**
 * Pure layout target resolution for the PromptBox.
 *
 * Extracted from usePromptPosition to separate computation from
 * React effect orchestration. All functions are pure — no hooks, no refs.
 */
import { resolvePromptAutoPosition, type PromptAvoidRect } from "./avoidance";
import {
  BOTTOM_BASE,
  MIN_CARD_W_NORMAL,
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

export function resolveNormalCardWidth({
  vw,
  vh,
  cardH,
  desiredWidth,
  avoidRects = [],
}: {
  vw: number;
  vh: number;
  cardH: number;
  desiredWidth: number;
  avoidRects?: PromptAvoidRect[];
}) {
  if (avoidRects.length === 0) {
    return desiredWidth;
  }

  const promptTop = vh - BOTTOM_BASE - cardH;
  const promptBottom = vh - BOTTOM_BASE;
  const horizontalObstacles = avoidRects
    .filter((rect) => rect.bottom > promptTop && rect.top < promptBottom)
    .map((rect) => ({
      left: Math.max(0, rect.left),
      right: Math.min(vw, rect.right),
    }))
    .filter((rect) => rect.right > rect.left)
    .sort((a, b) => a.left - b.left);

  if (horizontalObstacles.length === 0) {
    return desiredWidth;
  }

  let cursor = VIEWPORT_MARGIN;
  let widestGap = 0;

  for (const rect of horizontalObstacles) {
    widestGap = Math.max(widestGap, rect.left - cursor - VIEWPORT_MARGIN);
    cursor = Math.max(cursor, rect.right + VIEWPORT_MARGIN);
  }

  widestGap = Math.max(widestGap, vw - VIEWPORT_MARGIN - cursor);

  if (widestGap <= 0) {
    return desiredWidth;
  }

  return Math.min(desiredWidth, Math.max(MIN_CARD_W_NORMAL, widestGap));
}
