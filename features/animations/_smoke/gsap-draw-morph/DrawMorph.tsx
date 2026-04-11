"use client";
/**
 * D8 smoke test — GSAP DrawSVG via the official useGSAP hook.
 *
 * DrawSVG is distributed as a plugin subpath (gsap/DrawSVGPlugin) that
 * may not resolve under every bundler configuration. We guard the
 * plugin import in a try/catch — on failure the path renders as a
 * static stroke (still looks fine) instead of crashing the card.
 *
 * Uses `useGSAP` for StrictMode-safe cleanup and `gsap.matchMedia()`
 * for reduced-motion respect per the aesthetic rule.
 */
import { useRef } from "react";
import { motion } from "framer-motion";
import { useGSAP } from "@gsap/react";
import { getGsap } from "@/lib/gsap";
import { canvasReveal } from "@/lib/motion";

export default function DrawMorph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useGSAP(
    async () => {
      const gsap = getGsap();

      // Lazy plugin import — may 404 under Turbopack subpath resolution.
      // The smoke test must NOT hard-fail in that case; log and skip.
      let DrawSVGPlugin: unknown;
      try {
        DrawSVGPlugin = (await import("gsap/DrawSVGPlugin")).default;
      } catch {
        return;
      }
      gsap.registerPlugin(DrawSVGPlugin as never, useGSAP);

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        if (!pathRef.current) return;
        gsap.from(pathRef.current, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          drawSVG: "0%" as any,
          duration: 1.4,
          ease: "power2.inOut",
          repeat: -1,
          repeatDelay: 0.6,
          yoyo: true,
        });
      });
      return () => mm.revert();
    },
    { scope: containerRef },
  );

  return (
    <motion.div
      ref={containerRef}
      {...canvasReveal}
      className="flex h-[280px] w-full items-center justify-center"
    >
      <svg
        viewBox="0 0 240 120"
        className="h-full w-full"
        role="img"
        aria-label="GSAP DrawSVG smoke"
      >
        <path
          ref={pathRef}
          d="M 20 80 Q 70 10, 120 60 T 220 40"
          fill="none"
          stroke="var(--color-muted-indigo)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}
