"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { useComputedColorScheme } from "@mantine/core";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import { useGraphStore } from "@/features/graph/stores";
import { loadingBreathe } from "@/lib/motion";
import {
  recolorLottie,
  resolveCssColor,
  type LottieRgba,
} from "./recolor-lottie";

type LottieJson = Record<string, unknown>;

const MODE_ACCENT_FALLBACK: LottieRgba = [0.4, 0.6, 1, 1];
const GRAPH_ICON_FALLBACK: LottieRgba = [0.102, 0.106, 0.118, 0.68];

let cached: Promise<LottieJson | null> | null = null;
function fetchLoaderJson() {
  if (!cached) {
    cached = fetch("/animations/_assets/lottie/loading.json")
      .then((r) => r.json() as Promise<LottieJson>)
      .catch(() => null);
  }
  return cached;
}

/**
 * Mode-accent-tinted Lottie loading spinner. 712×712 square asset,
 * matte (no glow/blur), recolored to `--mode-accent` via a shape walker.
 * Falls back to a breathing dot while JSON loads or on reduced-motion.
 */
export function LottiePulseLoader({
  size = 80,
  colorVar = "--mode-accent",
  fallbackColor,
}: {
  size?: number | string;
  colorVar?: string;
  fallbackColor?: LottieRgba;
}) {
  const reduced = useReducedMotion();
  const computedColorScheme = useComputedColorScheme("light");
  const mode = useGraphStore((s) => s.mode);
  const [raw, setRaw] = useState<LottieJson | null>(null);
  const [accent, setAccent] = useState<
    [number, number, number, number] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetchLoaderJson().then((d) => {
      if (!cancelled && d) setRaw(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const resolvedFallback =
      fallbackColor
      ?? (colorVar === "--graph-icon-color"
        ? GRAPH_ICON_FALLBACK
        : MODE_ACCENT_FALLBACK);
    const id = requestAnimationFrame(() =>
      setAccent(resolveCssColor(colorVar, resolvedFallback)),
    );
    return () => cancelAnimationFrame(id);
  }, [colorVar, computedColorScheme, fallbackColor, mode]);

  const recolored = useMemo(() => {
    if (!raw || !accent) return null;
    return recolorLottie(raw, accent);
  }, [raw, accent]);
  const colorOpacity = accent?.[3] ?? 1;

  if (!recolored || reduced) {
    return (
      <motion.span
        className="inline-block rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: `var(${colorVar})`,
        }}
        {...loadingBreathe}
      />
    );
  }

  return (
    <Lottie
      animationData={recolored}
      loop
      autoplay
      className="leading-none"
      style={{ width: size, height: size, opacity: colorOpacity }}
    />
  );
}
