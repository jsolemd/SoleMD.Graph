"use client";
/**
 * Biology mechanism template — 2D SVG + Framer Motion.
 *
 * Use for: receptor binding, ion channels, pathway mechanisms, any
 * illustration that is fundamentally a 2D diagram with time evolution.
 *
 * Brand tokens only — never hardcode hex. Honor the 0.1s opacity
 * tween rule on entrances to prevent canvas ghosting.
 */
import { motion } from "framer-motion";
import { smooth, panelReveal } from "@/lib/motion";

export function BiologyMechanismTemplate() {
  return (
    <motion.div
      {...panelReveal.left}
      className="flex min-h-[320px] w-full items-center justify-center rounded-[1rem] border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]"
    >
      <svg viewBox="0 0 320 200" className="h-full w-full" role="img" aria-label="Mechanism">
        {/* Example: a receptor pocket + a ligand sliding into it */}
        <motion.circle
          cx="80"
          cy="100"
          r="40"
          fill="var(--color-soft-blue)"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ scale: smooth, opacity: { duration: 0.1, ease: "easeOut" } }}
        />
        <motion.circle
          cx="240"
          cy="100"
          r="14"
          fill="var(--color-warm-coral)"
          initial={{ x: 0, opacity: 0 }}
          animate={{ x: -120, opacity: 1 }}
          transition={{ x: smooth, opacity: { duration: 0.1, ease: "easeOut" }, delay: 0.3 }}
        />
      </svg>
    </motion.div>
  );
}
