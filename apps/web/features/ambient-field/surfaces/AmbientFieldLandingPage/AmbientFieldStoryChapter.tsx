"use client";

import { motion } from "framer-motion";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { OverlayCard } from "@/features/graph/components/panels/PanelShell/OverlaySurface";
import {
  panelAccentCardStyle,
  panelSurfaceStyle,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import { smooth } from "@/lib/motion";
import type {
  AmbientFieldLandingSection,
  AmbientFieldStoryBeat,
} from "./ambient-field-landing-content";
import { AmbientFieldStoryProgress } from "./AmbientFieldStoryProgress";

interface AmbientFieldStoryChapterProps {
  beats: readonly AmbientFieldStoryBeat[];
  section: AmbientFieldLandingSection;
}

/** Beat visual card — tinted by the beat's own accentVar so each step of the
 *  story is visibly branded. */
function buildVisualCardStyle(accentVar: string) {
  return {
    ...panelSurfaceStyle,
    backgroundColor: `color-mix(in srgb, ${accentVar} 8%, var(--graph-panel-bg))`,
    border: `1px solid color-mix(in srgb, ${accentVar} 22%, var(--graph-panel-border))`,
  } as const;
}

function StoryBeatVisual({ beat }: { beat: AmbientFieldStoryBeat }) {
  if (beat.id === "info-1") {
    return (
      <OverlayCard style={buildVisualCardStyle(beat.accentVar)} className="px-5 py-5">
        <div className="flex items-center gap-2">
          <MetaPill mono>Signal</MetaPill>
          <MetaPill style={{ color: beat.accentVar }}>Context narrows the field</MetaPill>
        </div>
        <div className="mt-5 space-y-3">
          {["Neighborhoods tighten", "Noise starts to fall away", "Center of gravity shifts"].map(
            (label) => (
              <div
                key={label}
                className="rounded-[0.95rem] px-4 py-3 text-[13px] leading-6"
                style={panelAccentCardStyle}
              >
                {label}
              </div>
            ),
          )}
        </div>
      </OverlayCard>
    );
  }

  return (
    <OverlayCard style={buildVisualCardStyle(beat.accentVar)} className="px-5 py-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Papers", "Filtered"],
          ["Entities", "Ranked"],
          ["Paths", "Ready"],
        ].map(([title, value]) => (
          <div
            key={title}
            className="rounded-[1rem] px-4 py-4"
            style={panelAccentCardStyle}
          >
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--graph-panel-text-dim)]">
              {title}
            </div>
            <div className="mt-2 text-sm font-medium">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[1rem] px-4 py-4" style={panelAccentCardStyle}>
        <p className="text-[13px] leading-6 text-[var(--graph-panel-text-dim)]">
          The blob should still be visible here, but it should already feel like the
          system has started to decide what matters.
        </p>
      </div>
    </OverlayCard>
  );
}

export function AmbientFieldStoryChapter({
  beats,
  section,
}: AmbientFieldStoryChapterProps) {
  return (
    <section
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
                <div className="lg:col-span-4 lg:col-start-1">
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
                <div className="lg:col-span-4 lg:col-start-9">
                  <StoryBeatVisual beat={beat} />
                </div>
              </motion.div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
