"use client";

import type { ReactNode } from "react";
import { promptSurfaceStyle } from "../panels/PanelShell";

type FloatingHoverCardPlacement = "above-start" | "below-start";

interface FloatingHoverCardProps {
  x: number;
  y: number;
  children: ReactNode;
  placement?: FloatingHoverCardPlacement;
  minWidth?: number;
  maxWidth?: number;
  zIndex?: number;
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  "data-entity-type"?: string;
}

export function FloatingHoverCard({
  x,
  y,
  children,
  placement = "above-start",
  minWidth = 220,
  maxWidth = 320,
  zIndex = 5,
  className,
  onPointerEnter,
  onPointerLeave,
  "data-entity-type": entityType,
}: FloatingHoverCardProps) {
  return (
    <div
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={className}
      data-entity-type={entityType}
      style={{
        position: "absolute",
        top: y,
        left: x,
        transform: getFloatingHoverCardTransform(placement),
        minWidth,
        maxWidth,
        zIndex,
        pointerEvents: "auto",
        ...promptSurfaceStyle,
      }}
    >
      {children}
    </div>
  );
}

function getFloatingHoverCardTransform(
  placement: FloatingHoverCardPlacement,
) {
  switch (placement) {
    case "below-start":
      return "translateY(0)";
    case "above-start":
    default:
      return "translateY(-100%)";
  }
}
