"use client";

import { useCallback, useRef, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { useReducedMotion } from "framer-motion";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { useChapterAdapter } from "../../scroll/chapter-adapters/useChapterAdapter";
import { setMobileMarqueePaused } from "../../scroll/chapter-adapters/mobile-carry-chapter";
import {
  fieldMobileCarryItems,
  type FieldLandingSection,
} from "./field-landing-content";

interface FieldMobileCarrySectionProps {
  section: FieldLandingSection;
}

export function FieldMobileCarrySection({
  section,
}: FieldMobileCarrySectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useChapterAdapter(sectionRef, "mobileCarry");

  const reducedMotion = useReducedMotion() ?? false;
  const isNarrowViewport = useMediaQuery("(max-width: 1023px)") ?? false;
  const marqueeAnimates = !reducedMotion && isNarrowViewport;

  const [paused, setPaused] = useState(false);
  const togglePaused = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      setMobileMarqueePaused(sectionRef.current, next);
      return next;
    });
  }, []);

  const buttonPaused = reducedMotion ? true : paused;
  const buttonLabel = buttonPaused ? "Play marquee" : "Pause marquee";

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
          <MetaPill mono>{section.eyebrow}</MetaPill>
          <h2 className="mx-auto mt-5 max-w-[15ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[2.8rem]">
            {section.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
            {section.body}
          </p>
        </div>

        <div
          data-mobile-carry-viewport
          className="mt-10 overflow-hidden rounded-full border px-4 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--graph-panel-border) 72%, transparent)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-bg) 84%, transparent), color-mix(in srgb, var(--graph-bg) 92%, transparent))",
          }}
        >
          <div
            data-mobile-carry-track
            className="flex w-max items-center gap-3 whitespace-nowrap"
          >
            {fieldMobileCarryItems.map((item) => (
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

        {marqueeAnimates ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              aria-pressed={paused}
              aria-label={buttonLabel}
              onClick={togglePaused}
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-medium uppercase tracking-[0.16em]"
              style={{
                background:
                  "color-mix(in srgb, var(--graph-panel-bg) 78%, transparent)",
                color: "var(--graph-panel-text)",
              }}
            >
              {paused ? "Play" : "Pause"}
            </button>
          </div>
        ) : reducedMotion ? (
          <div className="mt-4 flex justify-center">
            <span
              role="status"
              aria-label="Marquee paused for reduced motion"
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-medium uppercase tracking-[0.16em] opacity-70"
              style={{
                background:
                  "color-mix(in srgb, var(--graph-panel-bg) 78%, transparent)",
                color: "var(--graph-panel-text)",
              }}
            >
              Paused
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
