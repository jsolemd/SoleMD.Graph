"use client";

import { useRef } from "react";
import type { FieldLandingSection } from "./field-landing-content";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";

interface FieldStoryTwoSectionProps {
  section: FieldLandingSection;
}

export function FieldStoryTwoSection({
  section,
}: FieldStoryTwoSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "storyTwo");

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-scroll="storyTwo"
      data-section-id={section.id}
      className="flex min-h-[152svh] items-center px-4 py-[12vh] sm:px-6 sm:py-[14vh]"
    >
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="mx-auto max-w-[860px] text-center">
          <h2
            data-story-two-target="title"
            className="mx-auto mt-5 max-w-[13ch] text-[2.1rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[3rem]"
          >
            {section.title}
          </h2>

          <p
            data-story-two-target="body"
            className="mx-auto mt-5 max-w-[60ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]"
          >
            {section.body}
          </p>
        </div>
      </div>
    </section>
  );
}
