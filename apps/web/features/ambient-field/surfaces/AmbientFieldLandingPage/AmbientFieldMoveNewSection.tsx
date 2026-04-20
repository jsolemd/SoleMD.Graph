"use client";

import { useRef } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import {
  ambientFieldMoveNewItems,
  type AmbientFieldLandingSection,
} from "./ambient-field-landing-content";

interface AmbientFieldMoveNewSectionProps {
  section: AmbientFieldLandingSection;
}

export function AmbientFieldMoveNewSection({
  section,
}: AmbientFieldMoveNewSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "moveNew");

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-scroll="moveNew"
      data-section-id={section.id}
      className="px-4 py-[10vh] sm:px-6"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="mx-auto max-w-[760px] text-center">
          <MetaPill mono>{section.eyebrow}</MetaPill>
          <h2 className="mx-auto mt-5 max-w-[15ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.8rem]">
            {section.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>

        <div
          data-move-new-viewport
          className="mt-10 overflow-hidden rounded-full border px-4 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--graph-panel-border) 72%, transparent)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-bg) 84%, transparent), color-mix(in srgb, var(--graph-bg) 92%, transparent))",
          }}
        >
          <div
            data-move-new-track
            className="flex w-max items-center gap-3 whitespace-nowrap"
          >
            {ambientFieldMoveNewItems.map((item) => (
              <span
                key={item}
                className="inline-flex items-center rounded-full px-4 py-2 text-[12px] font-medium uppercase tracking-[0.16em]"
                style={{
                  background:
                    "color-mix(in srgb, var(--graph-panel-bg) 72%, transparent)",
                  color: "var(--graph-panel-text)",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
