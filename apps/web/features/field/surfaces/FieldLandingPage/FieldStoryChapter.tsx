"use client";

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
                <h2 className="text-[2.1rem] font-medium leading-[1] tracking-[-0.04em] sm:text-[3rem]">
                  {beat.title}
                </h2>
                <p className="mx-auto mt-5 max-w-[54ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
                  {beat.body}
                </p>
              </div>
            ) : (
              <div
                key={beat.id}
                id={beat.id}
                data-story-beat
                className="grid min-h-[72svh] grid-cols-1 gap-6 py-[20vh] lg:grid-cols-12 lg:items-center lg:gap-10"
              >
                <div className="max-w-[44ch] lg:col-span-4 lg:col-start-1">
                  <h2 className="text-[2rem] font-medium leading-[1.02] tracking-[-0.035em] sm:text-[2.7rem]">
                    {beat.title}
                  </h2>
                  {beat.body ? (
                    <p className="mt-3 text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
                      {beat.body}
                    </p>
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
