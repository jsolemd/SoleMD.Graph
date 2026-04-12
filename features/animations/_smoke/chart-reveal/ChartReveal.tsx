"use client";
import { motion, useReducedMotionConfig as useReducedMotion, type Variants } from "framer-motion";
import { dataReveal } from "@/lib/motion";

const DATA = [
  { label: "A", value: 24, from: "var(--color-soft-pink)",    to: "var(--color-soft-lavender)" },
  { label: "B", value: 36, from: "var(--color-soft-blue)",    to: "var(--color-muted-indigo)" },
  { label: "C", value: 18, from: "var(--color-fresh-green)",  to: "var(--color-soft-blue)" },
  { label: "D", value: 42, from: "var(--color-golden-yellow)", to: "var(--color-warm-coral)" },
];

const MAX = Math.max(...DATA.map((d) => d.value));
const BARS = DATA.map((d) => ({ ...d, pct: ((d.value / MAX) * 100).toFixed(4) }));

const bar: Variants = {
  hidden: { scaleY: 0, opacity: 0 },
  visible: {
    scaleY: 1,
    opacity: 1,
    transition: {
      scaleY: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] },
      opacity: { duration: 0.1, ease: "easeOut" },
    },
  },
};

export default function ChartReveal() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={dataReveal}
      initial={reduced ? "visible" : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      className="flex h-[280px] w-full items-end gap-4 px-6 pb-6 pt-4"
    >
      {BARS.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center gap-2">
          <div className="flex min-h-0 w-full flex-1 items-end">
            <motion.div
              className="flex w-full items-end justify-center rounded-t-lg"
              style={{
                height: `${d.pct}%`,
                transformOrigin: "bottom",
                backgroundImage: `linear-gradient(to top, ${d.from}, ${d.to})`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)",
              }}
              variants={bar}
            >
              <span className="pb-1 text-xs font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                {d.value}
              </span>
            </motion.div>
          </div>
          <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
            {d.label}
          </span>
        </div>
      ))}
    </motion.div>
  );
}
