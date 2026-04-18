"use client";
/**
 * Lottie asset from LottieFiles free tier — LottieFiles Simple License.
 * Source: https://assets10.lottiefiles.com/packages/lf20_usmfx6bp.json
 * Published to: /public/animations/_assets/lottie/pulse.json
 *
 * Proves the lottie-react consumption path for real third-party assets
 * (distinct from hand-authored JSON, which the Phase 1 research
 * concluded is the wrong medium for organic shapes).
 */
import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { motion, useReducedMotionConfig as useReducedMotion } from "framer-motion";
import { canvasReveal } from "@/lib/motion";

type LottieJson = Record<string, unknown>;

export default function LottieFilesSmoke() {
  const reduced = useReducedMotion();
  const [data, setData] = useState<LottieJson | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/animations/_assets/lottie/pulse.json")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      {...canvasReveal}
      className="flex h-[280px] w-full items-center justify-center"
    >
      {data ? (
        <Lottie
          animationData={data}
          loop={!reduced}
          autoplay={!reduced}
          className="h-full w-auto max-h-[240px]"
        />
      ) : (
        <div
          className="h-[200px] w-[200px] animate-pulse rounded-[0.75rem]"
          style={{ background: "var(--surface-alt)" }}
        />
      )}
    </motion.div>
  );
}
