import { selectBottomObstacles, useDashboardStore } from "@/features/graph/stores";
import { APP_CHROME_PX } from "@/lib/density";
import { crisp } from "@/lib/motion";

/**
 * Motion props for chrome elements that float above the timeline and data
 * table, lifting in sync with whichever widgets are currently visible.
 *
 * Returned values are spread directly onto a `motion.div`:
 *
 *   <motion.div {...useBottomChromeFloat()} ...>
 *
 * `initial` matches `animate` so the element does not animate on mount —
 * the spring only fires when timeline/table visibility changes. Uses
 * `crisp` to match the timeline's edgeReveal and panel reveal springs so
 * all chrome motion tracks together on toggle.
 *
 * Obstacle math (timeline height + table height) lives in
 * `selectBottomObstacles` — do not duplicate here.
 */
export function useBottomChromeFloat(base: number = APP_CHROME_PX.edgeMargin) {
  const obstacles = useDashboardStore(selectBottomObstacles);
  const bottom = base + obstacles;

  return {
    initial: { bottom },
    animate: { bottom },
    transition: { bottom: crisp },
  };
}
