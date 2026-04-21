"use client";

import type { ReactNode } from "react";
import "./field-hotspot-ring.css";

// FieldHotspotRing — static Maze-parity template (SVG ring + dot).
// Mounted inside `FieldHotspotPool`; projection (transform + opacity)
// is applied imperatively by `BlobController.writeHotspotDom`.

export type FieldHotspotVariant = "cyan" | "red";

export type FieldHotspotPhase =
  | "idle"
  | "animating"
  | "only-reds"
  | "only-single"
  | "hidden";

export interface FieldHotspotProjection {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface FieldHotspotRingProps {
  variant?: FieldHotspotVariant;
  children?: ReactNode;
}

export function FieldHotspotRing({
  variant = "cyan",
  children,
}: FieldHotspotRingProps) {
  const classNames = ["afr-hotspot"];
  if (variant === "red") classNames.push("afr-hotspot--red");
  return (
    <div className={classNames.join(" ")}>
      <svg className="afr-svg-circle" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r="100" />
      </svg>
      {children ? <div className="afr-hotspot__ui">{children}</div> : null}
    </div>
  );
}
