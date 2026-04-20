"use client";

import type { RefObject } from "react";
import { motion } from "framer-motion";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { smooth } from "@/lib/motion";
import type {
  AmbientFieldLandingSection,
  AmbientFieldStoryBeat,
} from "./ambient-field-landing-content";
import { AmbientFieldStoryProgress } from "./AmbientFieldStoryProgress";

interface AmbientFieldStoryChapterProps {
  beats: readonly AmbientFieldStoryBeat[];
  section: AmbientFieldLandingSection;
  sectionRef?: RefObject<HTMLElement | null>;
}

function StoryBeatDetail({ beat }: { beat: AmbientFieldStoryBeat }) {
  if (beat.id === "info-1") {
    return (
      <div className="space-y-3 lg:pl-6">
        <p
          className="text-[11px] uppercase tracking-[0.22em]"
          style={{
            color:
              "color-mix(in srgb, var(--graph-panel-text-dim) 88%, transparent)",
          }}
        >
          Signal
        </p>
        <p className="text-[14px] font-medium leading-6" style={{ color: beat.accentVar }}>
          Context narrows the field
        </p>
        <div
          className="space-y-2 text-[13px] leading-6"
          style={{
            color:
              "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
          }}
        >
          {["Neighborhoods tighten", "Noise starts to fall away", "Center of gravity shifts"].map(
            (label) => (
              <p key={label}>{label}</p>
            ),
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:pl-6">
      <div
        className="space-y-2 text-[13px] leading-6"
        style={{
          color:
            "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
        }}
      >
        {[
          ["Papers", "Filtered"],
          ["Entities", "Ranked"],
          ["Paths", "Ready"],
        ].map(([title, value]) => (
          <p key={title}>
            <span
              className="mr-2 text-[11px] uppercase tracking-[0.18em]"
              style={{
                color:
                  "color-mix(in srgb, var(--graph-panel-text-dim) 88%, transparent)",
              }}
            >
              {title}
            </span>
            <span className="text-sm font-medium">{value}</span>
          </p>
        ))}
      </div>
      <p
        className="text-[13px] leading-6"
        style={{
          color:
            "color-mix(in srgb, var(--graph-panel-text-dim) 92%, transparent)",
        }}
      >
        The blob should still be visible here, but it should already feel like the
        system has started to decide what matters.
      </p>
    </div>
  );
}

export function AmbientFieldStoryChapter({
  beats,
  section,
  sectionRef,
}: AmbientFieldStoryChapterProps) {
  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-section-id={section.id}
      className="px-4 pb-[9.5rem] pt-[6vh] sm:px-6 sm:pt-[8vh]"
    >
      <div className="mx-auto w-full max-w-[1440px]">
        <AmbientFieldStoryProgress beatIds={beats.map((beat) => beat.id)} />

        <div className="space-y-[4vh]">
          {beats.map((beat) =>
            beat.variant === "centered" ? (
              <motion.div
                key={beat.id}
                id={beat.id}
                initial={{ opacity: 0, y: 18 }}
                viewport={{ once: true, amount: 0.35 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  y: smooth,
                  opacity: { duration: 0.18, ease: "easeOut" },
                }}
                className="mx-auto max-w-[860px] pb-[12vh] pt-[26vh] text-center"
              >
                <div className="mb-5 flex justify-center">
                  <MetaPill style={{ color: beat.accentVar }}>
                    Beat {beat.progressLabel}
                  </MetaPill>
                </div>
                <h2 className="text-[2.1rem] font-medium leading-[1] tracking-[-0.04em] sm:text-[3rem]">
                  {beat.title}
                </h2>
                <p className="mx-auto mt-5 max-w-[54ch] text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
                  {beat.body}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={beat.id}
                id={beat.id}
                initial={{ opacity: 0, y: 18 }}
                viewport={{ once: true, amount: 0.35 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  y: smooth,
                  opacity: { duration: 0.18, ease: "easeOut" },
                }}
                className="grid min-h-[72svh] grid-cols-1 gap-6 py-[20vh] lg:grid-cols-12 lg:items-center lg:gap-10"
              >
                <div className="lg:col-span-5 lg:col-start-1">
                  <div className="flex items-center gap-2">
                    <MetaPill mono>Beat {beat.progressLabel}</MetaPill>
                    <MetaPill style={{ color: beat.accentVar }}>{section.eyebrow}</MetaPill>
                  </div>
                  <h2 className="mt-5 text-[2rem] font-medium leading-[0.98] tracking-[-0.035em] sm:text-[2.7rem]">
                    {beat.title}
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-[var(--graph-panel-text-dim)]">
                    {beat.body}
                  </p>
                </div>
                <div className="lg:col-span-3 lg:col-start-9">
                  <StoryBeatDetail beat={beat} />
                </div>
              </motion.div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
