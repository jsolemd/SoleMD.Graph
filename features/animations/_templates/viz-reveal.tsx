"use client";
/**
 * Data viz reveal template — Recharts chart + Framer Motion stagger.
 *
 * Wrap a Recharts chart in a `motion.div` with `whileInView` and stagger
 * the inner bars/lines via Framer Motion variants. Recharts doesn't
 * animate off the shelf in a brand-consistent way; this wrapper gives
 * you the entrance while Recharts handles the actual SVG.
 */
import { motion, type Variants } from "framer-motion";
import { smooth } from "@/lib/motion";

const container: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      y: smooth,
      opacity: { duration: 0.1, ease: "easeOut" },
      staggerChildren: 0.04,
    },
  },
};

export function VizRevealTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      className="rounded-[1rem] border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]"
    >
      {children}
    </motion.div>
  );
}
