"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotionConfig as useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import { useGraphStore } from "@/features/graph/stores";
import { recolorLottie, resolveAccentColor } from "./recolor-lottie";

type LottieJson = Record<string, unknown>;

const jsonCache = new Map<string, Promise<LottieJson | null>>();

function fetchLottieJson(src: string) {
  let p = jsonCache.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => r.json() as Promise<LottieJson>)
      .catch(() => null);
    jsonCache.set(src, p);
  }
  return p;
}

/**
 * Generic mode-accent-tinted Lottie renderer. Fetches from `src`, recolors
 * dark shapes to `--mode-accent`, renders at the given size. Handles
 * reduced-motion (returns null — caller decides the fallback).
 */
export function LottieAccent({
  src,
  size,
  loop = true,
  className,
  style,
}: {
  src: string;
  size: number;
  loop?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();
  const mode = useGraphStore((s) => s.mode);
  const [raw, setRaw] = useState<LottieJson | null>(null);
  const [accent, setAccent] = useState<
    [number, number, number, number] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetchLottieJson(src).then((d) => {
      if (!cancelled && d) setRaw(d);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAccent(resolveAccentColor()));
    return () => cancelAnimationFrame(id);
  }, [mode]);

  const recolored = useMemo(() => {
    if (!raw || !accent) return null;
    return recolorLottie(raw, accent);
  }, [raw, accent]);

  if (!recolored || reduced) return null;

  return (
    <Lottie
      animationData={recolored}
      loop={loop}
      autoplay
      className={className}
      style={{ width: size, height: size, ...style }}
    />
  );
}
