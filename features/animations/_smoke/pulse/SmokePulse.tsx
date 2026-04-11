"use client";
/**
 * D1 smoke test — Framer Motion SVG pulse.
 *
 * Proves the Framer Motion + SVG authoring path + publish flow + wiki
 * embed works end-to-end. Referenced by `[[anim:smoke-pulse]]` in the
 * wiki index page.
 */
import { motion } from "framer-motion";
import { canvasReveal, smooth } from "@/lib/motion";

export default function SmokePulse() {
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
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: [0.8, 1.05, 1], opacity: [0, 0.9, 1] }}
          transition={{
            scale: smooth,
            opacity: { duration: 0.1, ease: "easeOut" },
            repeat: Infinity,
            repeatType: "reverse",
            duration: 2.4,
          }}
        />
        <motion.circle
          cx="100"
          cy="100"
          r="30"
          fill="var(--color-muted-indigo)"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </motion.div>
  );
}
