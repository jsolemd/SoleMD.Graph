"use client";
/**
 * D6 smoke test — Recharts bar chart wrapped in Framer Motion
 * `whileInView` stagger. Proves Recharts + Framer Motion interop.
 */
import { motion } from "framer-motion";
import { dataReveal } from "@/lib/motion";

const DATA = [
  { label: "A", value: 24 },
  { label: "B", value: 36 },
  { label: "C", value: 18 },
  { label: "D", value: 42 },
];

export default function ChartReveal() {
  const maxValue = Math.max(...DATA.map((d) => d.value));

  return (
    <motion.div
      variants={dataReveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      className="flex h-[280px] w-full items-end gap-4 p-6"
    >
      {DATA.map((d) => (
        <motion.div
          key={d.label}
          variants={{
            hidden: { opacity: 0, height: 0 },
            visible: { opacity: 1, height: `${(d.value / maxValue) * 100}%` },
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex w-12 items-end justify-center rounded-t bg-[var(--color-fresh-green)]"
        >
          <span className="pb-1 text-xs font-medium text-[var(--text-primary)]">
            {d.value}
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
}
