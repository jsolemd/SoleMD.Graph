"use client";

import { useRef } from "react";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import {
  fieldSequenceItems,
  type FieldLandingSection,
} from "./field-landing-content";

interface FieldSequenceSectionProps {
  section: FieldLandingSection;
}

export function FieldSequenceSection({
  section,
}: FieldSequenceSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "sequence");

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-scroll="sequence"
      data-section-id={section.id}
      className="px-4 py-[12vh] sm:px-6"
    >
      <div className="mx-auto max-w-[1240px]">
        <div
          data-sequence-main
          className="mx-auto max-w-[760px] text-center"
        >
          <h2 className="mx-auto mt-5 max-w-[14ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.9rem]">
            {section.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-[1040px] gap-10 lg:grid-cols-3">
          {fieldSequenceItems.map((item) => (
            <div key={item.id} className="space-y-3 text-left">
              <p
                className="text-[11px] uppercase tracking-[0.22em]"
                style={{
                  color:
                    "color-mix(in srgb, var(--graph-panel-text-dim) 88%, transparent)",
                }}
              >
                {item.number}
              </p>
              <h3 className="text-[20px] font-medium sm:text-[22px]">
                {item.title}
              </h3>
              <p className="text-[14px] leading-6 text-[var(--graph-panel-text-dim)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
