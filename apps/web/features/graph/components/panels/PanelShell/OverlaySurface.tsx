"use client";

import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { densityCssPx } from "@/lib/density";
import {
  overlayCardSurfaceStyle,
  overlayScrimStyle,
  overlayStrongScrimStyle,
} from "./surface-styles";

interface OverlaySurfaceProps {
  children: ReactNode;
  onBackdropClick?: MouseEventHandler<HTMLDivElement>;
  scrimVariant?: "default" | "strong";
  position?: "fixed" | "absolute";
  blurPx?: number;
  className?: string;
  style?: CSSProperties;
}

export function OverlaySurface({
  children,
  onBackdropClick,
  scrimVariant = "default",
  position = "fixed",
  blurPx,
  className,
  style,
}: OverlaySurfaceProps) {
  const blur = typeof blurPx === "number" ? `blur(${densityCssPx(blurPx)})` : undefined;
  const scrimStyle = scrimVariant === "strong" ? overlayStrongScrimStyle : overlayScrimStyle;

  return (
    <div
      className={[
        position === "fixed" ? "fixed" : "absolute",
        "inset-0 z-[9998] flex items-center justify-center",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        ...scrimStyle,
        ...(blur
          ? {
              backdropFilter: blur,
              WebkitBackdropFilter: blur,
            }
          : null),
        ...style,
      }}
      onClick={onBackdropClick}
    >
      {children}
    </div>
  );
}

interface OverlayCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function OverlayCard({
  children,
  className,
  style,
  onClick,
}: OverlayCardProps) {
  return (
    <div
      className={["relative overflow-hidden rounded-[1rem]", className].filter(Boolean).join(" ")}
      style={{
        ...overlayCardSurfaceStyle,
        ...style,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children}
    </div>
  );
}
