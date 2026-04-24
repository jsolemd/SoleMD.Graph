"use client";

import { motion, type Transition, type Variants } from "framer-motion";
import { useRef } from "react";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import {
  fieldSurfaceRailItems,
  type FieldLandingSection,
} from "./field-landing-content";

interface FieldSurfaceRailSectionProps {
  section: FieldLandingSection;
}

const REVEAL_EASE: Transition["ease"] = [0.16, 1, 0.3, 1];
const REVEAL_VIEWPORT = { once: false, amount: 0.2 } as const;

const titleReveal: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: REVEAL_EASE } },
};

const bodyReveal: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: 0.08, ease: REVEAL_EASE },
  },
};

const railGridReveal: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.16 } },
};

const railItemReveal: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: REVEAL_EASE } },
};

export function FieldSurfaceRailSection({
  section,
}: FieldSurfaceRailSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "surfaceRail");

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-center
      data-preset={section.preset}
      data-scroll="surfaceRail"
      data-section-id={section.id}
      className="px-4 py-[10vh] sm:px-6"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="mx-auto max-w-[760px] text-center">
          <motion.h2
            variants={titleReveal}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
            className="mx-auto max-w-[16ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.8rem]"
          >
            {section.title}
          </motion.h2>
          <motion.p
            variants={bodyReveal}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
            className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]"
          >
            {section.body}
          </motion.p>
        </div>

        <motion.div
          variants={railGridReveal}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mx-auto mt-14 grid max-w-[960px] gap-8 sm:grid-cols-2 lg:grid-cols-4"
        >
          {fieldSurfaceRailItems.map((name) => (
            <motion.p
              key={name}
              variants={railItemReveal}
              className="text-center text-[20px] font-medium tracking-[-0.01em] sm:text-[24px]"
            >
              {name}
            </motion.p>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
