"use client";

import type { RefObject } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { chromePillSurfaceStyle } from "@/features/graph/components/panels/PanelShell/panel-styles";
import { PromptStageSurface } from "@/features/graph/components/panels/prompt/PromptStageSurface";
import type { AmbientFieldLandingSection } from "./ambient-field-landing-content";

interface AmbientFieldHeroSectionProps {
  graphReady: boolean;
  promptRef: RefObject<HTMLDivElement | null>;
  stagePromptWidth: number;
  warmupLabel: string;
  onExploreRuntime: () => void;
  onOpenGraph: () => void;
  section: AmbientFieldLandingSection;
}

export function AmbientFieldHeroSection({
  graphReady,
  promptRef,
  stagePromptWidth,
  warmupLabel,
  onExploreRuntime,
  onOpenGraph,
  section,
}: AmbientFieldHeroSectionProps) {
  return (
    <section
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-section-id={section.id}
      className="flex min-h-[108svh] items-center justify-center px-4 pb-20 pt-24 sm:px-6 sm:pb-24 sm:pt-28"
    >
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-center">
        <div className="max-w-[880px] text-center">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <MetaPill mono>{section.eyebrow}</MetaPill>
            <MetaPill style={{ color: section.accentVar }}>
              Shared ambient substrate
            </MetaPill>
            <MetaPill>{warmupLabel}</MetaPill>
          </div>

          <h1 className="mx-auto max-w-[13ch] text-[2.7rem] font-medium leading-[0.92] tracking-[-0.045em] sm:text-[4rem] lg:text-[4.6rem]">
            A living evidence field before the graph opens.
          </h1>

          <p
            className="mx-auto mt-5 max-w-[56ch] text-[15px] leading-7 sm:mt-6 sm:text-[18px] sm:leading-8"
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
            }}
          >
            {section.body}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {section.bullets.map((bullet) => (
              <MetaPill key={bullet}>{bullet}</MetaPill>
            ))}
          </div>
        </div>

        <div
          ref={promptRef}
          className="mt-9 w-full"
          style={{ maxWidth: `${stagePromptWidth}px` }}
        >
          <PromptStageSurface
            compact
            helperText={
              graphReady
                ? "The graph workspace is ready. Open it now or keep scrolling through the same world."
                : `${warmupLabel} while the ambient stage stays fully available.`
            }
            onPrimaryAction={graphReady ? onOpenGraph : undefined}
            placeholder="What does DRD2 connectivity suggest about psychosis-related pathways?"
            primaryActionDisabled={!graphReady}
          />
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onExploreRuntime}
            className="rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
            style={{
              ...chromePillSurfaceStyle,
              color: "var(--graph-panel-text)",
            }}
          >
            Explore the landing runtime
          </button>
          <button
            type="button"
            onClick={onOpenGraph}
            disabled={!graphReady}
            className="rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
            style={{
              ...chromePillSurfaceStyle,
              color: "var(--graph-panel-text)",
              opacity: graphReady ? 1 : 0.58,
            }}
          >
            {graphReady ? "Open graph now" : "Graph still warming"}
          </button>
        </div>
      </div>
    </section>
  );
}
