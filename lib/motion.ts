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

/** Crisp — short-travel default: panels, chrome, icon buttons, edge reveals,
 *  bottom chrome float. Sharp, controlled, no visible bounce. ~180ms settle. */
export const crisp: SpringTransition = {
  type: "spring",
  stiffness: 300,
  damping: 28,
};

/** Smooth — long travel, gentle settle. Mode transitions, large layout shifts,
 *  drag-release snaps, prompt box position animations. */
export const smooth: SpringTransition = {
  type: "spring",
  stiffness: 80,
  damping: 22,
};

/** Responsive — drag-tracking feel, looser than crisp. Prompt box safe-bounds
 *  snap, auto-repositioning under a moving target. */
export const responsive: SpringTransition = {
  type: "spring",
  stiffness: 120,
  damping: 20,
};

/** Bouncy — micro-interactions, intentional bounce. Icon hover pops, mode
 *  toggle bar, prompt icon button. */
export const bouncy: SpringTransition = {
  type: "spring",
  stiffness: 400,
  damping: 10,
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

/** Edge reveal — slides from an anchored edge (bottom bar, timeline).
 *  Uses crisp spring + fast opacity tween (matching panelReveal)
 *  to prevent ghosting over the WebGL canvas. */
export function edgeReveal(travel: number) {
  return {
    initial: { opacity: 0, y: travel },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: travel },
    transition: { y: crisp, opacity: { duration: 0.1, ease: "easeOut" as const } },
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
  transition: { scale: crisp, opacity: { duration: 0.1 } },
} as const;

/* ───── Animation pipeline presets ─────
 *
 * Added for the SoleMD.Make -> SoleMD.Graph animation pipeline. All
 * honor the 0.1s opacity-tween rule to prevent canvas ghosting over
 * the WebGL surface when components float above the graph.
 */

/** Matte card / embedded animation appearance — used by AnimationEmbed. */
export const canvasReveal = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 12 },
  transition: { y: smooth, opacity: { duration: 0.1, ease: "easeOut" as const } },
} as const;

/** Node focus pop-in — used by `useNodeFocusSpring`-driven DOM overlays. */
export const nodePopIn = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
  transition: { scale: crisp, opacity: { duration: 0.1, ease: "easeOut" as const } },
} as const;

/** Edge draw-in stagger container — for path highlight sequences. */
export const edgeDrawStagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
} as const;

/** Biology timeline — configurable duration for mechanism scenes. */
export function biologyTimeline(durationMs = 1200) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: {
      y: smooth,
      opacity: { duration: 0.1, ease: "easeOut" as const },
      duration: durationMs / 1000,
    },
  } as const;
}

/** Data reveal — charts / timelines entering the viewport. */
export const dataReveal = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      y: smooth,
      opacity: { duration: 0.1, ease: "easeOut" as const },
      staggerChildren: 0.04,
    },
  },
} as const;

/** Scroll-driven hero reveal — pairs with `useScroll` / `useTransform`. */
export const heroScrollReveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
  transition: { y: smooth, opacity: { duration: 0.18, ease: "easeOut" as const } },
} as const;

/** Route transition — pair with the ::view-transition-* CSS in globals.css. */
export const routeTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: "easeOut" as const },
} as const;
