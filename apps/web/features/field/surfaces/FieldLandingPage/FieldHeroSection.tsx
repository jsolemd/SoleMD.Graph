"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TextReveal } from "@/features/animations/text-reveal/TextReveal";
import { smooth } from "@/lib/motion";
import type { FieldLandingSection } from "./field-landing-content";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";

interface FieldHeroSectionProps {
  section: FieldLandingSection;
}

export function FieldHeroSection({ section }: FieldHeroSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "hero");
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-scroll="hero"
      data-section-id={section.id}
      className="flex min-h-[100svh] items-center justify-center px-4 pb-24 pt-24 sm:px-6 sm:pb-28 sm:pt-28"
    >
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-center">
        <div className="max-w-[760px] text-center">
          <motion.p
            className="text-[11px] uppercase tracking-[0.24em]"
            {...(reducedMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 12 },
                  animate: { opacity: 1, y: 0 },
                  transition: {
                    y: smooth,
                    opacity: { duration: 0.18, ease: "easeOut" },
                  },
                })}
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text-dim) 92%, transparent)",
            }}
          >
            {section.eyebrow}
          </motion.p>

          <TextReveal
            as="h1"
            className="mx-auto mt-5 max-w-[14ch] text-[2.9rem] font-medium leading-[0.9] tracking-[-0.05em] sm:text-[4.25rem] lg:text-[5.2rem]"
            grain="words"
            stagger={0.08}
            text={section.title}
            trigger="mount"
          />

          <TextReveal
            as="p"
            className="mx-auto mt-6 max-w-[42ch] text-[15px] leading-7 sm:text-[17px] sm:leading-8"
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
            }}
            grain="words"
            stagger={0.03}
            text={section.body}
            trigger="mount"
          />
        </div>
      </div>
    </section>
  );
}
