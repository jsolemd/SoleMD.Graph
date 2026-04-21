"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type MutableRefObject,
} from "react";
import type { FieldHotspotFrame } from "../../controller/BlobController";
import type { FieldSceneState } from "../../scene/visual-presets";
import { fieldConnectionPairs } from "./field-connection-pairs";
import { getFieldChapterProgress } from "../../scroll/field-scroll-state";

export interface FieldConnectionOverlayHandle {
  updateFrames(frames: readonly FieldHotspotFrame[]): void;
}

interface FieldConnectionOverlayProps {
  chapterId: string;
  sceneStateRef: MutableRefObject<FieldSceneState>;
}

const MAX_OPACITY_BY_KIND: Record<"intra" | "bridge", number> = {
  intra: 0.38,
  bridge: 0.26,
};

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

/**
 * SVG-over-canvas connection layer for the synthesis beat. Mirrors the
 * hybrid DOM+SVG+WebGL pattern Maze uses for its stream chapter: the ambient
 * field keeps rendering underneath, and connection rails live as DOM `<path>`
 * elements driven imperatively each hotspot frame. Position updates bypass
 * React re-renders — same contract as `handleHotspotFrame` in the landing
 * shell.
 */
export const FieldConnectionOverlay = forwardRef<
  FieldConnectionOverlayHandle,
  FieldConnectionOverlayProps
>(function FieldConnectionOverlay(
  { chapterId, sceneStateRef },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const dotRefs = useRef<Array<SVGCircleElement | null>>([]);
  const framesRef = useRef<readonly FieldHotspotFrame[] | null>(null);

  const renderPaths = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const progress = getFieldChapterProgress(sceneStateRef.current, chapterId);
    const reveal = smoothstep(0.24, 0.5, progress);
    const fade = 1 - smoothstep(0.66, 0.9, progress);
    const visibility = reveal * fade;

    svg.style.opacity = visibility.toFixed(3);
    if (visibility <= 0.001) return;

    const frames = framesRef.current;
    if (!frames) return;

    const nowSeconds =
      typeof performance === "undefined" ? 0 : performance.now() / 1000;

    fieldConnectionPairs.forEach((pair, i) => {
      const pathEl = pathRefs.current[i];
      const dotEl = dotRefs.current[i];
      if (!pathEl) return;

      const a = frames[pair.from];
      const b = frames[pair.to];
      if (!a || !b || !a.visible || !b.visible) {
        pathEl.style.opacity = "0";
        if (dotEl) dotEl.style.opacity = "0";
        return;
      }

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const chord = Math.max(1, Math.hypot(dx, dy));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const nx = -dy / chord;
      const ny = dx / chord;
      const archMagnitude = pair.arch ?? Math.min(120, chord * 0.22);
      const direction = pair.direction ?? 1;
      const cx = mx + nx * archMagnitude * direction;
      const cy = my + ny * archMagnitude * direction;

      pathEl.setAttribute(
        "d",
        `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
      );

      pathEl.style.strokeDashoffset = (1 - visibility).toFixed(3);

      // Per-pair slow pulse so the rails feel alive rather than static.
      // Phase-offset by index keeps the field from breathing in lockstep.
      const pulse = 0.78 + Math.sin(nowSeconds * 1.1 + i * 0.73) * 0.22;
      const ceiling = MAX_OPACITY_BY_KIND[pair.kind];
      pathEl.style.opacity = (pulse * visibility * ceiling).toFixed(3);

      if (dotEl) {
        // Midpoint marker rides the curve's apex so it tracks the arch.
        // t=0.5 on a quadratic Bézier is (A + 2C + B) / 4.
        const midX = (a.x + 2 * cx + b.x) * 0.25;
        const midY = (a.y + 2 * cy + b.y) * 0.25;
        dotEl.setAttribute("cx", midX.toFixed(2));
        dotEl.setAttribute("cy", midY.toFixed(2));
        dotEl.style.opacity = (pulse * visibility * ceiling * 1.3).toFixed(3);
      }
    });
  }, [chapterId, sceneStateRef]);

  useImperativeHandle(
    ref,
    () => ({
      updateFrames(frames) {
        framesRef.current = frames;
        renderPaths();
      },
    }),
    [renderPaths],
  );

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] h-full w-full"
      style={{ opacity: 0, willChange: "opacity" }}
    >
      {fieldConnectionPairs.map((pair, i) => (
        <path
          key={`path-${pair.from}-${pair.to}-${i}`}
          ref={(node) => {
            pathRefs.current[i] = node;
          }}
          pathLength={1}
          fill="none"
          strokeWidth={pair.kind === "bridge" ? 1.1 : 1.5}
          strokeLinecap="round"
          style={{
            stroke: pair.color,
            strokeDasharray: 1,
            strokeDashoffset: 1,
            opacity: 0,
            willChange: "stroke-dashoffset, opacity",
          }}
        />
      ))}
      {fieldConnectionPairs.map((pair, i) => (
        <circle
          key={`dot-${pair.from}-${pair.to}-${i}`}
          ref={(node) => {
            dotRefs.current[i] = node;
          }}
          r={pair.kind === "bridge" ? 1.6 : 2.1}
          style={{
            fill: pair.color,
            opacity: 0,
            willChange: "opacity",
          }}
        />
      ))}
    </svg>
  );
});
