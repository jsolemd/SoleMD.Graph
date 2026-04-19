"use client";

import { motion } from "framer-motion";
import type { AmbientFieldClientRailItem } from "./ambient-field-landing-content";

interface AmbientFieldClientsRailProps {
  items: readonly AmbientFieldClientRailItem[];
}

const railItemStyle = {
  border: "1px solid color-mix(in srgb, var(--graph-panel-border) 78%, transparent)",
  background:
    "color-mix(in srgb, var(--graph-panel-bg) 78%, transparent)",
  color: "color-mix(in srgb, var(--graph-panel-text) 74%, transparent)",
} as const;

export function AmbientFieldClientsRail({
  items,
}: AmbientFieldClientsRailProps) {
  const loopItems = [...items, ...items];

  return (
    <div className="mt-9 w-full overflow-hidden">
      <motion.div
        className="flex w-max gap-3"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          duration: 18,
          ease: "linear",
          repeat: Number.POSITIVE_INFINITY,
        }}
      >
        {loopItems.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="rounded-full px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] sm:px-4 sm:text-xs"
            style={railItemStyle}
          >
            {item.label}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
