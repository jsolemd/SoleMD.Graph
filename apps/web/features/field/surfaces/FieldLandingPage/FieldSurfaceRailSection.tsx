"use client";

import { useRef } from "react";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import {
  fieldSurfaceRailItems,
  type FieldLandingSection,
} from "./field-landing-content";

interface FieldSurfaceRailSectionProps {
  section: FieldLandingSection;
}

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
          <h2 className="mx-auto mt-5 max-w-[16ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.8rem]">
            {section.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-[960px] gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {fieldSurfaceRailItems.map((name) => (
            <p
              key={name}
              className="text-center text-[20px] font-medium tracking-[-0.01em] sm:text-[24px]"
            >
              {name}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
