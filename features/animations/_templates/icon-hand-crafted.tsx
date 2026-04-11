"use client";
/**
 * Hand-crafted SVG icon template — GSAP DrawSVG + MorphSVG.
 *
 * For Dribbble-quality icon animations: a stroke draws itself, then
 * morphs through a couple of shapes. GSAP plugins import lazily so
 * they tree-shake out of unused code paths.
 */
import { useEffect, useRef } from "react";

export function IconHandCraftedTemplate() {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const gsap = (await import("@/lib/gsap")).getGsap();
      const { DrawSVGPlugin } = await import("gsap/DrawSVGPlugin");
      gsap.registerPlugin(DrawSVGPlugin);

      if (cancelled || !pathRef.current) return;

      const tween = gsap.from(pathRef.current, {
        drawSVG: "0%",
        duration: 0.8,
        ease: "power2.out",
      });
      cleanup = () => tween.kill();
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <svg
      viewBox="0 0 120 120"
      className="h-24 w-24"
      role="img"
      aria-label="Icon animation"
    >
      <path
        ref={pathRef}
        d="M20 60 Q60 10 100 60 T180 60"
        fill="none"
        stroke="var(--color-muted-indigo)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
