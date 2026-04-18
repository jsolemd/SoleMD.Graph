"use client";
/**
 * Animated Beam template — a path-drawing SVG between two ref'd DOM
 * anchors with an animated gradient sweep.
 *
 * Two anchors A and B live inside a container. The AnimatedBeam
 * primitive measures their bounding rects, draws a cubic bezier
 * between their centers, and sweeps a brand-gradient stroke along
 * the curve on a loop. ResizeObserver keeps the path current.
 *
 * When to use: pipeline/flow diagrams (A → B), data-source → viz
 * connections, call-graph visualizations, any "this produces that"
 * story where motion direction matters.
 *
 * Primitive lives at `_thirdparty/magic-ui/animated-beam/AnimatedBeam.tsx`
 * (adapted from Magic UI, MIT).
 */
import { useRef } from "react";
import { AnimatedBeam } from "../_thirdparty/magic-ui/animated-beam/AnimatedBeam";

export function AnimatedBeamTemplate() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex h-[280px] w-full items-center justify-between px-12"
    >
      <div
        ref={fromRef}
        className="relative z-10 h-14 w-14 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]"
      >
        {/* TODO: put the source node icon / label here */}
      </div>
      <div
        ref={toRef}
        className="relative z-10 h-14 w-14 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]"
      >
        {/* TODO: put the target node icon / label here */}
      </div>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={fromRef}
        toRef={toRef}
        curvature={-60}
        duration={3}
      />
    </div>
  );
}
