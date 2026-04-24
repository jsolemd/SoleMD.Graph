"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import {
  chromePillSurfaceStyle,
  panelSurfaceStyle,
} from "@/features/graph/components/panels/PanelShell";
import { canvasReveal } from "@/lib/motion";
import type { LottieRgba } from "@/features/animations/lottie/recolor-lottie";

type RouteStatusTone = "primary" | "neutral";

interface RouteStatusAction {
  href?: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  tone?: RouteStatusTone;
}

interface RouteStatusSurfaceProps {
  statusLabel?: string;
  eyebrow?: string;
  title: string;
  description: string;
  renderMedia?: (context: { accent: LottieRgba; scheme: "dark" | "light" }) => ReactNode;
  primaryAction: RouteStatusAction;
  secondaryAction?: RouteStatusAction;
}

const fallbackAccent: LottieRgba = [0.4, 0.6, 1, 1];

const surfaceStyle = {
  ...panelSurfaceStyle,
  border: "1px solid var(--graph-panel-border)",
} as const;

function createActionStyle(tone: RouteStatusTone) {
  return {
    ...chromePillSurfaceStyle,
    color:
      tone === "primary"
        ? "var(--graph-panel-text)"
        : "var(--graph-panel-text-dim)",
  };
}

function RouteStatusActionButton({
  action,
}: {
  action: RouteStatusAction;
}) {
  const tone = action.tone ?? "neutral";
  const className =
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium leading-none no-underline transition-[filter] hover:brightness-110";
  const style = createActionStyle(tone);

  if (action.href) {
    return (
      <Link
        href={action.href}
        className={className}
        style={{
          ...style,
          textDecoration: "none",
        }}
      >
        {action.icon}
        <span className="whitespace-nowrap leading-none">{action.label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      className={className}
      style={style}
    >
      {action.icon}
      <span className="whitespace-nowrap leading-none">{action.label}</span>
    </button>
  );
}

function resolveScopedCssColor(
  host: HTMLElement | null,
  variableName: string,
  fallback: LottieRgba,
): LottieRgba {
  if (!host) return fallback;

  try {
    const el = document.createElement("div");
    el.style.color = `var(${variableName})`;
    host.appendChild(el);
    const rgb = getComputedStyle(el).color;
    el.remove();
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return fallback;
    return [
      parseInt(match[1], 10) / 255,
      parseInt(match[2], 10) / 255,
      parseInt(match[3], 10) / 255,
      1,
    ];
  } catch {
    return fallback;
  }
}

export function RouteStatusSurface({
  statusLabel,
  eyebrow,
  title,
  description,
  renderMedia,
  primaryAction,
  secondaryAction,
}: RouteStatusSurfaceProps) {
  const [scheme, setScheme] = useState<"dark" | "light">("dark");
  const [accent, setAccent] = useState<LottieRgba>(fallbackAccent);
  const hostRef = useRef<HTMLDivElement>(null);
  const isDark = scheme === "dark";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAccent(resolveScopedCssColor(hostRef.current, "--mode-accent", fallbackAccent));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [scheme]);

  return (
    <div
      ref={hostRef}
      className={isDark ? "dark" : undefined}
    >
      <main
        className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-6"
        style={{ backgroundColor: "var(--background)" }}
      >
        <div className="absolute right-4 top-4 sm:right-5 sm:top-5">
          <button
            type="button"
            onClick={() => setScheme(isDark ? "light" : "dark")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[filter] hover:brightness-110"
            style={{
              ...chromePillSurfaceStyle,
              color: "var(--graph-panel-text)",
            }}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <motion.section
          className="w-full max-w-[32rem] rounded-[1.5rem] px-5 py-6 sm:px-7 sm:py-7"
          style={surfaceStyle}
          {...canvasReveal}
        >
          {renderMedia ? (
            <div className="flex items-center justify-center">
              {renderMedia({ accent, scheme })}
            </div>
          ) : null}

          <div className={renderMedia ? "mt-4 text-center" : "text-center"}>
            {statusLabel || eyebrow ? (
              <p
                className="text-[11px] font-medium uppercase tracking-[0.14em]"
                style={{ color: "var(--graph-panel-text-dim)" }}
              >
                {statusLabel}
                {statusLabel && eyebrow ? " · " : ""}
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={`${statusLabel || eyebrow ? "mt-4" : ""} text-[1.65rem] font-medium leading-[0.96] tracking-[-0.05em] sm:text-[2rem]`}
              style={{ color: "var(--graph-panel-text)" }}
            >
              {title}
            </h1>

            <p
              className="mx-auto mt-4 max-w-[42ch] text-[0.95rem] leading-7"
              style={{
                color:
                  "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
              }}
            >
              {description}
            </p>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <RouteStatusActionButton action={primaryAction} />
            {secondaryAction ? (
              <RouteStatusActionButton action={secondaryAction} />
            ) : null}
          </div>
        </motion.section>
      </main>
    </div>
  );
}
