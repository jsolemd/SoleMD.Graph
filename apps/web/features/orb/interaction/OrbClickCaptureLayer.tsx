"use client";

import { useRef } from "react";

/**
 * Dedicated transparent overlay for orb pointer capture.
 *
 * Sits above the FieldCanvas (z:0) and the dashboard backdrop (z:-10),
 * below `OrbDetailPanel` (z:20) and the dev HUD (z:20). Catches clicks
 * on any empty area of the orb surface without relying on
 * `e.target === e.currentTarget` guards — any future child wrapping
 * `<main>` would break that pattern silently.
 *
 * Discriminates drag from click via a 4px threshold: pointer-down → up
 * with a movement delta > 4px is treated as a camera drag (once orbit
 * controls ship) and does not fire a click.
 *
 * `aria-hidden` keeps the overlay out of the a11y tree; future
 * a11y for orb selection will land as a keyboard-driven path on the
 * detail panel rather than through this invisible catch layer.
 */

const DRAG_THRESHOLD_PX = 4;

interface OrbClickCaptureLayerProps {
  onClick: (clientX: number, clientY: number) => void;
}

export function OrbClickCaptureLayer({ onClick }: OrbClickCaptureLayerProps) {
  const downRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      aria-hidden
      className="pointer-events-auto fixed inset-0 z-[5]"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onPointerDown={(e) => {
        downRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = downRef.current;
        downRef.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) return;
        onClick(e.clientX, e.clientY);
      }}
    />
  );
}
