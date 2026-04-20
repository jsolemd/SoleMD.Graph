"use client";

import { useRef } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import type { AmbientFieldLandingSection } from "./ambient-field-landing-content";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";

interface AmbientFieldGraphSectionProps {
  section: AmbientFieldLandingSection;
}

export function AmbientFieldGraphSection({
  section,
}: AmbientFieldGraphSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "graphRibbon");

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-scroll="graphRibbon"
      data-section-id={section.id}
      className="flex min-h-[152svh] items-center px-4 py-[12vh] sm:px-6 sm:py-[14vh]"
    >
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="mx-auto max-w-[860px] text-center">
          <div
            data-graph-chapter-target="eyebrow"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            <MetaPill mono>{section.eyebrow}</MetaPill>
            <MetaPill style={{ color: section.accentVar }}>Sticky stream owner</MetaPill>
          </div>

          <h2
            data-graph-chapter-target="title"
            className="mx-auto mt-5 max-w-[13ch] text-[2.1rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[3rem]"
          >
            {section.title}
          </h2>

          <p
            data-graph-chapter-target="body"
            className="mx-auto mt-5 max-w-[60ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]"
          >
            {section.body}
          </p>
          <p
            data-graph-chapter-target="note"
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
