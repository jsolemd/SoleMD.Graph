"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useComputedColorScheme } from "@mantine/core";
import { useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import scrollCueAnimation from "@/features/animations/_assets/lottie/field-scroll-cue.json";
import {
  recolorLottie,
  resolveCssColor,
  type LottieRgba,
} from "@/features/animations/lottie/recolor-lottie";
import { fieldLoopClock } from "@/features/field";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const SCROLL_CUE_FALLBACK_COLOR: LottieRgba = [0.102, 0.106, 0.118, 1];

export function FieldScrollCue() {
  const reducedMotion = useReducedMotion();
  const colorScheme = useComputedColorScheme("light");
  const [rgba, setRgba] = useState<LottieRgba | null>(null);

  useEffect(() => {
    const disposer = fieldLoopClock.subscribe("scroll-cue", 80, () => {
      setRgba(resolveCssColor("--graph-panel-text", SCROLL_CUE_FALLBACK_COLOR));
      disposer();
    });
    return disposer;
  }, [colorScheme]);

  const animationData = useMemo(() => {
    if (!rgba) return null;
    return recolorLottie(scrollCueAnimation, rgba);
  }, [rgba]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[12] flex -translate-x-1/2 items-center justify-center sm:bottom-8"
    >
      <div className="field-scroll-cue flex items-center justify-center">
        {reducedMotion || !animationData ? (
          <div className="flex h-12 w-12 items-center justify-center text-[var(--graph-icon-color)] sm:h-14 sm:w-14">
            <ChevronDown size={24} strokeWidth={1.8} />
          </div>
        ) : (
          <Lottie
            animationData={animationData}
            loop
            autoplay
            className="h-12 w-12 sm:h-14 sm:w-14"
          />
        )}
      </div>
    </div>
  );
}
