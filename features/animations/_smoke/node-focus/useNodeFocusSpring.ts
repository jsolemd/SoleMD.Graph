"use client";
/**
 * D4 smoke test — bridges D3 / Cosmograph coordinates to a Framer
 * Motion spring.
 *
 * Usage:
 *   const { x, y } = useNodeFocusSpring({ x: pointX, y: pointY })
 *   const motionValue = x.get()  // read during RAF to drive an overlay
 */
import { useEffect } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { smooth } from "@/lib/motion";

export function useNodeFocusSpring({
  x,
  y,
}: {
  x: number | null;
  y: number | null;
}) {
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
