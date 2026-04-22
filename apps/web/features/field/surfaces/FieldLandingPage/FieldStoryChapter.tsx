"use client";

import { motion, type Transition, type Variants } from "framer-motion";
import { useRef, type RefObject } from "react";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import type { FieldChapterKey } from "../../scroll/chapter-adapters/types";
import type {
  FieldLandingSection,
  FieldStoryBeat,
} from "./field-landing-content";
import { FieldStoryProgress } from "./FieldStoryProgress";

interface FieldStoryChapterProps {
  beats: readonly FieldStoryBeat[];
  chapterKey: FieldChapterKey;
  section: FieldLandingSection;
  sectionRef?: RefObject<HTMLElement | null>;
}

// Scroll-in reveal shared across every landing beat. Title and body
// fade + rise as the beat enters the viewport and fade + sink when it
// leaves — matches the maze.co-style bidirectional text choreography.
// framer-motion's MotionConfig at the app root honors the OS
// reduced-motion preference, so no extra guard here.
const REVEAL_EASE: Transition["ease"] = [0.16, 1, 0.3, 1];
const BEAT_VIEWPORT = { once: false, margin: "-12% 0px -8% 0px" } as const;

const titleReveal: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: REVEAL_EASE },
  },
};

const bodyReveal: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: 0.08, ease: REVEAL_EASE },
  },
};

export function FieldStoryChapter({
  beats,
  chapterKey,
  section,
  sectionRef,
}: FieldStoryChapterProps) {
  const localRef = useRef<HTMLElement | null>(null);
  const ref = sectionRef ?? localRef;
  useChapterAdapter(ref, chapterKey);

  return (
    <section
      ref={ref}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-section-id={section.id}
      className="px-4 pb-[9.5rem] pt-[6vh] sm:px-6 sm:pt-[8vh]"
    >
      <div className="mx-auto w-full max-w-[1440px]">
        <FieldStoryProgress
          beatIds={beats.map((beat) => beat.id)}
          chapterKey={chapterKey}
        />

        <div className="space-y-[4vh]">
          {beats.map((beat) =>
            beat.variant === "centered" ? (
              <div
                key={beat.id}
                id={beat.id}
                data-story-beat
                className="mx-auto max-w-[860px] pb-[12vh] pt-[26vh] text-center"
              >
                <motion.h2
                  variants={titleReveal}
                  initial="hidden"
                  whileInView="visible"
                  viewport={BEAT_VIEWPORT}
                  className="text-[2.1rem] font-medium leading-[1] tracking-[-0.04em] sm:text-[3rem]"
                >
                  {beat.title}
                </motion.h2>
                {beat.body ? (
                  <motion.p
                    variants={bodyReveal}
                    initial="hidden"
                    whileInView="visible"
                    viewport={BEAT_VIEWPORT}
                    className="mx-auto mt-5 max-w-[54ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]"
                  >
                    {beat.body}
                  </motion.p>
                ) : null}
              </div>
            ) : (
              <div
                key={beat.id}
                id={beat.id}
                data-story-beat
                className="grid min-h-[72svh] grid-cols-1 gap-6 py-[20vh] lg:grid-cols-12 lg:items-center lg:gap-10"
              >
                <div className="max-w-[44ch] lg:col-span-4 lg:col-start-1">
                  <motion.h2
                    variants={titleReveal}
                    initial="hidden"
                    whileInView="visible"
                    viewport={BEAT_VIEWPORT}
                    className="text-[2rem] font-medium leading-[1.02] tracking-[-0.035em] sm:text-[2.7rem]"
                  >
                    {beat.title}
                  </motion.h2>
                  {beat.body ? (
                    <motion.p
                      variants={bodyReveal}
                      initial="hidden"
                      whileInView="visible"
                      viewport={BEAT_VIEWPORT}
                      className="mt-3 text-[15px] leading-7 text-[var(--graph-panel-text-dim)]"
                    >
                      {beat.body}
                    </motion.p>
                  ) : null}
                </div>
                <div aria-hidden="true" className="lg:col-span-7 lg:col-start-6" />
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
