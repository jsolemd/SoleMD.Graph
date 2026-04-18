"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotionConfig as useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import { useGraphStore } from "@/features/graph/stores";
import { loadingBreathe } from "@/lib/motion";
import { recolorLottie, resolveAccentColor } from "./recolor-lottie";

type LottieJson = Record<string, unknown>;

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
export function LottiePulseLoader({ size = 80 }: { size?: number }) {
  const reduced = useReducedMotion();
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
    const id = requestAnimationFrame(() => setAccent(resolveAccentColor()));
    return () => cancelAnimationFrame(id);
  }, [mode]);

  const recolored = useMemo(() => {
    if (!raw || !accent) return null;
    return recolorLottie(raw, accent);
  }, [raw, accent]);

  if (!recolored || reduced) {
    return (
      <motion.span
        className="inline-block rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: "var(--mode-accent)",
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
      style={{ width: size, height: size }}
    />
  );
}
