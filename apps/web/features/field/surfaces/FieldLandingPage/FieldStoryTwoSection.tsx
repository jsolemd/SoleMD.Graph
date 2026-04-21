"use client";

import { useRef } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
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
          <div
            data-story-two-target="eyebrow"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            <MetaPill mono>{section.eyebrow}</MetaPill>
            <MetaPill style={{ color: section.accentVar }}>Story 2 overlap</MetaPill>
          </div>

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
          <p
            data-story-two-target="note"
            className="mx-auto mt-[12vh] max-w-[40ch] text-[12px] uppercase tracking-[0.22em]"
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text-dim) 78%, transparent)",
            }}
          >
            This chapter should stay mostly open so the field can reveal the
            module state directly.
          </p>
        </div>
      </div>
    </section>
  );
}
