"use client";
/**
 * Adapted from Magic UI — Animated Beam
 * Original: https://magicui.design/docs/components/animated-beam
 * License: MIT (magicuidesign/magicui)
 *
 * Modifications:
 *   - Rebranded gradient stops to SoleMD brand tokens.
 *   - Honors `useReducedMotion` — static stroke when disabled.
 *   - Observes container + both anchor rects for responsive re-layout.
 */
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { motion, useReducedMotionConfig as useReducedMotion } from "framer-motion";

export interface AnimatedBeamProps {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  /** Curvature of the cubic bezier — positive arcs above, negative below. */
  curvature?: number;
  /** Start of the gradient (first color). Defaults to brand soft-pink. */
  gradientStart?: string;
  /** Middle of the gradient. Defaults to brand muted-indigo. */
  gradientMiddle?: string;
  /** End of the gradient. Defaults to brand soft-blue. */
  gradientEnd?: string;
  /** Offset both anchors horizontally so the beam terminates inside the edge. */
  startXOffset?: number;
  endXOffset?: number;
  startYOffset?: number;
  endYOffset?: number;
  /** Seconds for one full sweep along the path. */
  duration?: number;
}

type Point = { x: number; y: number };

export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = -60,
  gradientStart = "var(--color-soft-pink)",
  gradientMiddle = "var(--color-muted-indigo)",
  gradientEnd = "var(--color-soft-blue)",
  startXOffset = 0,
  endXOffset = 0,
  startYOffset = 0,
  endYOffset = 0,
  duration = 4,
}: AnimatedBeamProps) {
  const reduced = useReducedMotion();
  const id = useId();
  const pathRef = useRef<SVGPathElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [path, setPath] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!container || !from || !to) return;

    const measure = () => {
      const c = container.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const ax = a.left - c.left + a.width / 2 + startXOffset;
      const ay = a.top - c.top + a.height / 2 + startYOffset;
      const bx = b.left - c.left + b.width / 2 + endXOffset;
      const by = b.top - c.top + b.height / 2 + endYOffset;
      const midY = (ay + by) / 2 + curvature;
      const midX = (ax + bx) / 2;
      setBox({ w: c.width, h: c.height });
      setPath(`M ${ax},${ay} Q ${midX},${midY} ${bx},${by}`);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(from);
    ro.observe(to);
    return () => ro.disconnect();
  }, [containerRef, fromRef, toRef, curvature, startXOffset, endXOffset, startYOffset, endYOffset]);

  const gradId = `beam-gradient-${id}`;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w || 1} ${box.h || 1}`}
      fill="none"
    >
      <defs>
        <motion.linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: "0%", y1: "0%", x2: "0%", y2: "0%" }}
          animate={
            reduced
              ? { x1: "0%", y1: "0%", x2: "100%", y2: "0%" }
              : { x1: ["0%", "100%"], y1: ["0%", "0%"], x2: ["10%", "110%"], y2: ["0%", "0%"] }
          }
          transition={
            reduced
              ? { duration: 0.1 }
              : { duration, ease: "linear", repeat: Infinity, repeatDelay: 0 }
          }
        >
          <stop stopColor={gradientStart} stopOpacity={0} />
          <stop offset="0.32" stopColor={gradientStart} />
          <stop offset="0.55" stopColor={gradientMiddle} />
          <stop offset="0.78" stopColor={gradientEnd} />
          <stop offset="1" stopColor={gradientEnd} stopOpacity={0} />
        </motion.linearGradient>
      </defs>
      <path
        d={path}
        stroke="var(--border-subtle)"
        strokeOpacity={0.4}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        ref={pathRef}
        d={path}
        stroke={`url(#${gradId})`}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}
