"use client";

import { useRef } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import {
  ambientFieldEventItems,
  type AmbientFieldLandingSection,
} from "./ambient-field-landing-content";

interface AmbientFieldEventsSectionProps {
  section: AmbientFieldLandingSection;
}

export function AmbientFieldEventsSection({
  section,
}: AmbientFieldEventsSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "events");

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-scroll="events"
      data-section-id={section.id}
      className="px-4 py-[12vh] sm:px-6"
    >
      <div className="mx-auto max-w-[1240px]">
        <div
          data-events-main
          className="mx-auto max-w-[760px] text-center"
        >
          <MetaPill mono>{section.eyebrow}</MetaPill>
          <h2 className="mx-auto mt-5 max-w-[14ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.9rem]">
            {section.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-[1040px] gap-4 lg:grid-cols-3">
          {ambientFieldEventItems.map((item) => (
            <article
              key={item.id}
              data-event-subitem
              className="rounded-[1.5rem] border px-5 py-5"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--graph-panel-border) 72%, transparent)",
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-bg) 88%, transparent), color-mix(in srgb, var(--graph-bg) 92%, transparent))",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <p
                  data-event-number
                  className="text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: section.accentVar }}
                >
                  {item.number}
                </p>
                <svg
                  data-event-checkmark
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  viewBox="0 0 20 20"
                >
                  <path
                    data-event-checkmark-path
                    d="M4.5 10.5 8 14l7.5-8"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </div>
              <div data-event-text className="mt-5 space-y-3">
                <h3 className="text-[1rem] font-medium leading-6 text-[var(--graph-panel-text)]">
                  {item.title}
                </h3>
                <p className="text-[14px] leading-6 text-[var(--graph-panel-text-dim)]">
                  {item.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
