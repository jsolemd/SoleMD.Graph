import { zoomIdentity, type ZoomTransform } from "d3-zoom";
import type { SimNode } from "./types";

/**
 * Compute a d3-zoom transform that fits node extents into a container.
 *
 * The wiki graph simulation follows the Quartz pattern: force-center at
 * origin, the renderer offsets by (W/2, H/2) per frame. A rendered bbox
 * center therefore lives at `(centerX + W/2, centerY + H/2)`; applying
 * the returned transform to the Pixi stage lands that point at
 * `(W/2, H/2)` on screen and scales so the whole bbox fits with the given
 * padding margin (0.9 ⇒ 10% breathing room on every side).
 *
 * Returns `null` when the container is empty or no node has coordinates
 * yet — callers should no-op in that case.
 */
export function computeFitTransform(
  nodes: ReadonlyArray<SimNode>,
  containerWidth: number,
  containerHeight: number,
  padding: number = 0.9,
): ZoomTransform | null {
  if (containerWidth <= 0 || containerHeight <= 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
    count += 1;
  }
  if (count === 0) return null;

  // Floor each bbox dimension at 1px so a single-node graph (extent = 0)
  // still produces a finite k instead of dividing by zero.
  const bboxW = Math.max(1, maxX - minX);
  const bboxH = Math.max(1, maxY - minY);
  const k = Math.min(containerWidth / bboxW, containerHeight / bboxH) * padding;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const tx = containerWidth / 2 - (centerX + containerWidth / 2) * k;
  const ty = containerHeight / 2 - (centerY + containerHeight / 2) * k;

  return zoomIdentity.translate(tx, ty).scale(k);
}
