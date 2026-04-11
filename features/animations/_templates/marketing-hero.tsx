"use client";
/**
 * Marketing hero template — scroll-driven Framer Motion.
 *
 * Use `useScroll` + `useTransform` to map scroll progress to an
 * entrance. Never auto-play — wait for scroll.
 */
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export function MarketingHeroTemplate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);

  return (
    <section
      ref={ref}
      className="relative min-h-[60vh] overflow-hidden rounded-[1rem] bg-[var(--surface)]"
    >
      <motion.div style={{ y, opacity }} className="flex h-full items-center justify-center p-12">
        {children}
      </motion.div>
    </section>
  );
}
