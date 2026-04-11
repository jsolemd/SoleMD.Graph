"use client";
/**
 * D7 smoke test — GSAP ScrollTrigger fade. Proves GSAP + Framer
 * Motion coexistence + lazy plugin import.
 */
import { useEffect, useRef } from "react";

export default function ScrollFade() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const gsap = (await import("@/lib/gsap")).getGsap();
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      if (cancelled || !ref.current) return;
      ctx = gsap.context(() => {
        gsap.from(ref.current, {
          opacity: 0,
          y: 32,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: { trigger: ref.current, start: "top 80%" },
        });
      });
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

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
