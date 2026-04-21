"use client";

import { useRef } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
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
          <MetaPill mono>{section.eyebrow}</MetaPill>
          <h2 className="mx-auto mt-5 max-w-[16ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.8rem]">
            {section.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {fieldSurfaceRailItems.map((item, index) => (
            <article
              key={item.id}
              data-surface-rail-item
              className="rounded-[1.5rem] border px-5 py-5"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--graph-panel-border) 72%, transparent)",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-bg) 88%, transparent), color-mix(in srgb, var(--graph-bg) 92%, transparent))",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className="text-[11px] uppercase tracking-[0.18em]"
                  style={{
                    color:
                      "color-mix(in srgb, var(--graph-panel-text-dim) 88%, transparent)",
                  }}
                >
                  {item.label}
                </p>
                <MetaPill style={{ color: index % 2 === 0 ? section.accentVar : "var(--color-teal)" }}>
                  0{index + 1}
                </MetaPill>
              </div>
              <p className="mt-4 text-[1rem] font-medium leading-6 text-[var(--graph-panel-text)]">
                {item.name}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
