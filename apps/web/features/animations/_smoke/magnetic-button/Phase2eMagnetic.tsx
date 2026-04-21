"use client";
/**
 * Phase2eMagnetic — magnetic-button scaffold.
 *
 * Pattern: magnetic-button. Tracks the pointer within a radius and pulls
 * the button toward it. Use sparingly — one per page, for primary CTAs.
 */
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { crisp } from "@/lib/motion";

export default function Phase2eMagnetic() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const [xy, setXy] = useState({ x: 0, y: 0 });

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = e.clientX - (rect.left + rect.width / 2);
    const my = e.clientY - (rect.top + rect.height / 2);
    // Magnetic pull strength — 0.25 is gentle, 0.6 is aggressive.
    setXy({ x: mx * 0.3, y: my * 0.3 });
  }

  function onPointerLeave() {
    setXy({ x: 0, y: 0 });
  }

  return (
    <div className="flex h-[280px] w-full items-center justify-center">
      <motion.button
        ref={ref}
        onPointerMove={reduced ? undefined : onPointerMove}
        onPointerLeave={reduced ? undefined : onPointerLeave}
        animate={xy}
        transition={crisp}
        className="rounded-xl bg-[color:var(--color-soft-pink)] px-6 py-3 font-semibold"
      >
        {/* TODO: replace with real CTA copy */}
        Magnetic CTA
      </motion.button>
    </div>
  );
}
