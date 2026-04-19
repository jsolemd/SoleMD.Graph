"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./ambient-field-hotspot-ring.css";

// AmbientFieldHotspotRing — Maze-parity hotspot primitive.
// Source keyframes + rules extracted in ledger §13. This component renders
// the SVG ring + inner dot + authored card seat, plus a `seedKey` prop
// that, when bumped, restarts the CSS animation by reflow-forcing the DOM.
// Lifecycle (per-hotspot animationend -> reseed) is owned by
// `createHotspotLifecycleController`.

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
  phase?: AmbientFieldHotspotPhase;
  delayMs?: number;
  durationMs?: number;
  easing?: string;
  seedKey?: number;
  cardOffset?: { left?: string; top?: string };
  projection: AmbientFieldHotspotProjection;
  onAnimationEnd?: () => void;
  children?: ReactNode;
}

export function AmbientFieldHotspotRing({
  variant = "cyan",
  phase = "idle",
  delayMs = 0,
  durationMs = 2000,
  easing = "ease-in-out",
  seedKey = 0,
  cardOffset,
  projection,
  onAnimationEnd,
  children,
}: AmbientFieldHotspotRingProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  // Maze resets the animation by: remove class -> reset --delay -> force
  // reflow (`el.offsetWidth`) -> setTimeout(add class, 1). In React we
  // trigger the same path whenever seedKey changes so the per-hotspot
  // animationend handler stays the source of reseed truth.
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    el.classList.remove("is-animating");
    // Force reflow so the removed animation plays from its initial state
    // on the next class addition.
    void el.offsetWidth;
    if (phase === "animating" || phase === "only-single") {
      const handle = window.setTimeout(() => {
        el.classList.add("is-animating");
      }, 1);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [seedKey, phase]);

  const style = useMemo<CSSProperties>(() => {
    const vars: Record<string, string> = {
      "--afr-delay": `${delayMs}ms`,
      "--afr-duration": `${durationMs}ms`,
      "--afr-easing": easing,
    };
    const opacity = projection.opacity;
    const display = phase === "hidden" || opacity <= 0 ? "none" : "block";
    return {
      ...(vars as CSSProperties),
      transform: `translate3d(${projection.x}px, ${projection.y}px, 0) scale(${projection.scale})`,
      opacity,
      display,
    };
  }, [
    delayMs,
    durationMs,
    easing,
    phase,
    projection.opacity,
    projection.scale,
    projection.x,
    projection.y,
  ]);

  const cardStyle = useMemo<CSSProperties | undefined>(() => {
    if (!cardOffset) return undefined;
    return {
      ...(cardOffset.left ? { left: cardOffset.left } : {}),
      ...(cardOffset.top ? { top: cardOffset.top } : {}),
    };
  }, [cardOffset]);

  const classNames = ["afr-hotspot"];
  if (variant === "red") classNames.push("afr-hotspot--red");

  return (
    <div
      ref={elementRef}
      className={classNames.join(" ")}
      style={style}
      onAnimationEnd={() => onAnimationEnd?.()}
    >
      <svg className="afr-svg-circle" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r="100" />
      </svg>
      {children ? (
        <div className="afr-hotspot__ui" style={cardStyle}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
