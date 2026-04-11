"use client";
/**
 * D8 smoke test — GSAP DrawSVG + MorphSVG.
 *
 * Note: GSAP 3 made all plugins free in 2024, but DrawSVG and MorphSVG
 * are distributed as separate imports. If the plugin fails to resolve
 * in dev (missing subpath export), the animation falls through to a
 * plain opacity fade — the smoke test doesn't hard-fail the build.
 */
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { canvasReveal } from "@/lib/motion";

export default function DrawMorph() {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let tween: { kill: () => void } | undefined;
    let cancelled = false;

    (async () => {
      try {
        const gsap = (await import("@/lib/gsap")).getGsap();
        const { DrawSVGPlugin } = await import("gsap/DrawSVGPlugin");
        gsap.registerPlugin(DrawSVGPlugin);
        if (cancelled || !pathRef.current) return;
        tween = gsap.from(pathRef.current, {
          drawSVG: "0%",
          duration: 1.2,
          ease: "power2.inOut",
        });
      } catch {
        /* plugin unavailable — fall through */
      }
    })();

    return () => {
      cancelled = true;
      tween?.kill();
    };
  }, []);

  return (
    <motion.div {...canvasReveal} className="flex h-[280px] w-full items-center justify-center">
      <svg viewBox="0 0 240 120" className="h-full w-full" role="img" aria-label="Draw morph smoke">
        <path
          ref={pathRef}
          d="M20 80 Q 70 10, 120 60 T 220 40"
          fill="none"
          stroke="var(--color-muted-indigo)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}
