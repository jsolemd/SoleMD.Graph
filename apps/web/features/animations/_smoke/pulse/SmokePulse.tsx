"use client";
/**
 * D1 smoke test — Framer Motion SVG pulse.
 *
 * Proves the Framer Motion + SVG authoring path + publish flow + wiki
 * embed works end-to-end. Referenced by `[[anim:smoke-pulse]]` in the
 * wiki index page.
 *
 * Uses a duration-based tween (not a spring) because Framer Motion's
 * spring solver only supports two keyframes. Honors `useReducedMotion`:
 * when users opt out, the SVG renders at its mid-keyframe without
 * animating.
 */
import { motion, useReducedMotion } from "framer-motion";
import { canvasReveal } from "@/lib/motion";

export default function SmokePulse() {
  const reduced = useReducedMotion();

  const outerAnimate = reduced
    ? { scale: 1, opacity: 0.95 }
    : { scale: [0.9, 1.05, 0.9], opacity: [0.55, 0.95, 0.55] };

  const innerAnimate = reduced ? { opacity: 0.75 } : { opacity: [0.4, 0.9, 0.4] };

  return (
    <motion.div
      {...canvasReveal}
      className="flex h-[280px] w-full items-center justify-center"
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Smoke pulse">
        <motion.circle
          cx="100"
          cy="100"
          r="50"
          fill="var(--color-soft-blue)"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={outerAnimate}
          transition={
            reduced
              ? { duration: 0.3, ease: "easeOut" }
              : {
                  duration: 2.4,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "loop",
                }
          }
        />
        <motion.circle
          cx="100"
          cy="100"
          r="30"
          fill="var(--color-muted-indigo)"
          initial={{ opacity: 0 }}
          animate={innerAnimate}
          transition={
            reduced
              ? { duration: 0.3, ease: "easeOut" }
              : { duration: 2.0, repeat: Infinity, ease: "easeInOut" }
          }
        />
      </svg>
    </motion.div>
  );
}
