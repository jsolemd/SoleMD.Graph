/**
 * Shared spring presets — single source of truth for the site's motion feel.
 *
 * Naming is semantic (what the motion *feels like*), not structural
 * (where it's used). Pick the spring that matches the gesture.
 *
 * Lowercase because they're config objects, not React components.
 * The module is already called `motion.ts`, so no `SPRING_` prefix needed.
 */

type SpringTransition = {
  type: "spring";
  stiffness: number;
  damping: number;
};

/** Snappy — panel enter/exit, toolbar reveal. Short travel, crisp. */
export const snappy: SpringTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

/** Smooth — mode transitions, large layout shifts. Long travel, gentle settle. */
export const smooth: SpringTransition = {
  type: "spring",
  stiffness: 80,
  damping: 22,
};

/** Responsive — drag obstacles, small position adjustments. */
export const responsive: SpringTransition = {
  type: "spring",
  stiffness: 120,
  damping: 20,
};

/** Bouncy — micro-interactions, icon hover pops. */
export const bouncy: SpringTransition = {
  type: "spring",
  stiffness: 400,
  damping: 10,
};

/** Settle — icon/button enter transitions. Moderate travel, controlled. */
export const settle: SpringTransition = {
  type: "spring",
  stiffness: 260,
  damping: 25,
};

/** Crisp — panel appear/dismiss. Short travel, no visible bounce. ~180ms settle. */
export const crisp: SpringTransition = {
  type: "spring",
  stiffness: 320,
  damping: 28,
};

/* ───── Standardized hover conventions ─────
 *
 * Use these on `whileHover` to communicate interactivity:
 *   hoverHint   → "click me" (single-click affordance)
 *   dblHoverHint → "double-click me" (double-click affordance)
 *
 * Both are plain objects for Framer Motion's `whileHover` prop.
 * The transition shapes are intentionally different so users learn
 * the vocabulary: single bump = click, double bump = double-click.
 */

/** Single-click hover hint — gentle scale bump. */
export const hoverHint = {
  scale: 1.1,
  transition: bouncy,
} as const;

/**
 * Double-click hover hint — two quick vertical dips.
 * The rhythm physically mirrors the double-tap gesture.
 */
export const dblHoverHint = {
  y: [0, 3, 0, 0, 3, 0] as number[],
  transition: { duration: 0.7, ease: "easeInOut" as const },
};

/* ───── Reveal presets ─────
 *
 * Complete { initial, animate, exit, transition } objects for enter/exit
 * gestures. Spread onto motion.div: <motion.div {...panelReveal.left}>
 *
 * Naming is semantic (what the motion DOES), not structural (where it's used).
 * Opacity uses a fast tween (not the spring) so backgrounds reach full
 * strength almost instantly — prevents ghosting over the WebGL canvas.
 */

/** Panel scale-reveal — grows from anchor corner, fast opacity (no ghosting). */
export const panelReveal = {
  left: {
    initial: { scale: 0.92, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.92, opacity: 0 },
    transition: { scale: crisp, opacity: { duration: 0.1, ease: "easeOut" as const } },
    style: { transformOrigin: "top left" as const },
  },
  right: {
    initial: { scale: 0.92, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.92, opacity: 0 },
    transition: { scale: crisp, opacity: { duration: 0.1, ease: "easeOut" as const } },
    style: { transformOrigin: "top right" as const },
  },
} as const;

/** Edge reveal — slides from an anchored edge (bottom bar, timeline). */
export function edgeReveal(travel: number) {
  return {
    initial: { opacity: 0, y: travel },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: travel },
    transition: smooth,
  } as const;
}

/** Chrome toggle — tiny y-shift for toolbar elements appearing/hiding. */
export const chromeToggle = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { y: crisp, opacity: { duration: 0.1 } },
} as const;

/** Pop — scale-up for action buttons appearing/disappearing. */
export const pop = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
  transition: { scale: snappy, opacity: { duration: 0.1 } },
} as const;
