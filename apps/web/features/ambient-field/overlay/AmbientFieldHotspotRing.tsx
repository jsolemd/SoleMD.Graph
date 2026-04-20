"use client";

import type { ReactNode } from "react";
import "./ambient-field-hotspot-ring.css";

// AmbientFieldHotspotRing — static Maze-parity template (SVG ring + dot).
// Mounted inside `AmbientFieldHotspotPool`; projection (transform + opacity)
// is applied imperatively by `BlobController.writeHotspotDom`.

export type AmbientFieldHotspotVariant = "cyan" | "red";

export type AmbientFieldHotspotPhase =
  | "idle"
  | "animating"
  | "only-reds"
  | "only-single"
  | "hidden";

export interface AmbientFieldHotspotProjection {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface AmbientFieldHotspotRingProps {
  variant?: AmbientFieldHotspotVariant;
  children?: ReactNode;
}

export function AmbientFieldHotspotRing({
  variant = "cyan",
  children,
}: AmbientFieldHotspotRingProps) {
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
