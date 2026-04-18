"use client";
/**
 * D7 smoke test — GSAP ScrollTrigger fade via the official useGSAP hook.
 *
 * Uses `@gsap/react`'s useGSAP for StrictMode-safe cleanup and
 * dependency-based re-run semantics. Lazy-registers ScrollTrigger
 * inside the hook body so the plugin tree-shakes out of code paths
 * that never mount this component.
 *
 * Honors `gsap.matchMedia()` + `(prefers-reduced-motion: reduce)`
 * per the motion aesthetic — when users opt out, the animation is
 * skipped entirely (element is visible at rest) rather than shortened.
 */
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { getGsap } from "@/lib/gsap";

export default function ScrollFade() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    async () => {
      const gsap = getGsap();
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger, useGSAP);

      const mm = gsap.matchMedia();
      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
          isReduced: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { isMotion } = (ctx.conditions ?? {}) as { isMotion: boolean };
          if (!isMotion || !ref.current) return;
          gsap.from(ref.current, {
            opacity: 0,
            y: 32,
            duration: 0.6,
            ease: "power2.out",
            scrollTrigger: {
              trigger: ref.current,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          });
        },
      );
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="flex h-[280px] w-full items-center justify-center rounded-[1rem] bg-[var(--color-warm-coral)] p-6"
    >
      <span className="text-lg font-medium text-[var(--text-primary)]">
        Scroll to reveal
      </span>
    </div>
  );
}
