"use client";
/**
 * Canvas hook template — bridge D3 / Cosmograph values to Framer Motion.
 *
 * `useNodeFocusSpring` wires a graph-space coordinate (from D3 force or
 * Cosmograph `pointPositions`) into a Framer Motion spring so downstream
 * components can read `spring.get()` each RAF and drive DOM / canvas
 * without jitter.
 */
import { useEffect } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { smooth } from "@/lib/motion";

interface FocusArgs {
  x: number | null;
  y: number | null;
}

export function useNodeFocusSpring({ x, y }: FocusArgs) {
  const mvX = useMotionValue(x ?? 0);
  const mvY = useMotionValue(y ?? 0);
  const springX = useSpring(mvX, smooth);
  const springY = useSpring(mvY, smooth);

  useEffect(() => {
    if (x != null) mvX.set(x);
    if (y != null) mvY.set(y);
  }, [x, y, mvX, mvY]);

  return { x: springX, y: springY };
}
