"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useComputedColorScheme } from "@mantine/core";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import scrollCueAnimation from "@/features/animations/_assets/lottie/ambient-field-scroll-cue.json";
import {
  recolorLottie,
  resolveCssColor,
  type LottieRgba,
} from "@/features/animations/lottie/recolor-lottie";
import { smooth } from "@/lib/motion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const SCROLL_CUE_FALLBACK_COLOR: LottieRgba = [0.102, 0.106, 0.118, 1];

export function AmbientFieldScrollCue({ visible }: { visible: boolean }) {
  const reducedMotion = useReducedMotion();
  const colorScheme = useComputedColorScheme("light");
  const [rgba, setRgba] = useState<LottieRgba | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setRgba(
        resolveCssColor(
          "--graph-panel-text",
          SCROLL_CUE_FALLBACK_COLOR,
        ),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [colorScheme]);

  const animationData = useMemo(() => {
    if (!rgba) return null;
    return recolorLottie(scrollCueAnimation, rgba);
  }, [rgba]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[12] flex -translate-x-1/2 items-center justify-center sm:bottom-8"
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : 10,
      }}
      transition={{
        y: smooth,
        opacity: { duration: 0.14, ease: "easeOut" },
      }}
      style={{ willChange: "transform, opacity" }}
    >
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
    </motion.div>
  );
}
