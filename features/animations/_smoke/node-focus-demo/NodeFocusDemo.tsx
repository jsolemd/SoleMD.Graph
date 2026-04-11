"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useNodeFocusSpring } from "../node-focus/useNodeFocusSpring";

type Node = {
  id: string;
  x: number;
  y: number;
  label: string;
  tint: string;
};

const NODES: Node[] = [
  { id: "a", x:  48, y:  64, label: "Dopamine",      tint: "var(--color-soft-pink)" },
  { id: "b", x: 176, y:  40, label: "Serotonin",     tint: "var(--color-soft-lavender)" },
  { id: "c", x: 304, y:  96, label: "GABA",          tint: "var(--color-soft-blue)" },
  { id: "d", x:  96, y: 180, label: "Glutamate",     tint: "var(--color-fresh-green)" },
  { id: "e", x: 232, y: 196, label: "Noradrenaline", tint: "var(--color-golden-yellow)" },
  { id: "f", x: 368, y: 216, label: "Acetylcholine", tint: "var(--color-warm-coral)" },
];

export default function NodeFocusDemo() {
  const [focused, setFocused] = useState<Node>(NODES[0]);
  const { x, y } = useNodeFocusSpring({ x: focused.x, y: focused.y });

  return (
    <div className="relative h-[280px] w-full overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 420 280" preserveAspectRatio="xMidYMid meet">
        {NODES.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={focused.id === n.id ? 10 : 7}
            fill={n.tint}
            stroke="var(--surface)"
            strokeWidth={2}
            style={{ cursor: "pointer", transition: "r 200ms ease-out" }}
            onMouseEnter={() => setFocused(n)}
          />
        ))}
      </svg>

      <motion.div
        className="pointer-events-none absolute left-0 top-0 rounded-[0.75rem] border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-md)]"
        style={{ x, y, translateX: "-50%", translateY: "calc(-100% - 16px)" }}
      >
        <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
          node
        </div>
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {focused.label}
        </div>
      </motion.div>
    </div>
  );
}
