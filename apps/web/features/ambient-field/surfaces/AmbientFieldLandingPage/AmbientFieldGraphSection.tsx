"use client";

import type { RefObject } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import type {
  AmbientFieldGraphStep,
  AmbientFieldLandingSection,
} from "./ambient-field-landing-content";
import { AmbientFieldProcessStage } from "./AmbientFieldProcessStage";

interface AmbientFieldGraphSectionProps {
  isMobile: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  pathRefs: Array<RefObject<SVGPathElement | null>>;
  pointRefs: Array<RefObject<HTMLDivElement | null>>;
  section: AmbientFieldLandingSection;
  steps: readonly AmbientFieldGraphStep[];
}

export function AmbientFieldGraphSection({
  isMobile,
  panelRef,
  pathRefs,
  pointRefs,
  section,
  steps,
}: AmbientFieldGraphSectionProps) {
  return (
    <section
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-section-id={section.id}
      className="flex min-h-[112svh] items-center px-4 py-16 sm:px-6 sm:py-20"
    >
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="mx-auto max-w-[860px] text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <MetaPill mono>{section.eyebrow}</MetaPill>
            <MetaPill style={{ color: section.accentVar }}>Sticky stream owner</MetaPill>
          </div>

          <h2 className="mx-auto mt-5 max-w-[13ch] text-[2.1rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[3rem]">
            {section.title}
          </h2>

          <p className="mx-auto mt-5 max-w-[60ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.id}
              className="rounded-[1rem] border px-4 py-4"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--graph-panel-border) 76%, transparent)",
                background:
                  "color-mix(in srgb, var(--graph-panel-bg) 82%, transparent)",
              }}
            >
              <div className="text-[12px] font-medium tracking-[0.2em] text-[var(--graph-panel-text-dim)]">
                {step.number}
              </div>
              <p className="mt-3 text-[14px] leading-6">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <AmbientFieldProcessStage
            isMobile={isMobile}
            panelRef={panelRef}
            pathRefs={pathRefs}
            pointRefs={pointRefs}
          />
        </div>
      </div>
    </section>
  );
}
