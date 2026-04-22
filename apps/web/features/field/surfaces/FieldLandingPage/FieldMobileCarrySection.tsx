"use client";

import { useRef } from "react";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import type { FieldLandingSection } from "./field-landing-content";

interface FieldMobileCarrySectionProps {
  section: FieldLandingSection;
}

export function FieldMobileCarrySection({
  section,
}: FieldMobileCarrySectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "mobileCarry");

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-scroll="mobileCarry"
      data-section-id={section.id}
      className="px-4 py-[10vh] sm:px-6"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="mx-auto max-w-[760px] text-center">
          <h2 className="mx-auto mt-5 max-w-[15ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.8rem]">
            {section.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>
      </div>
    </section>
  );
}
