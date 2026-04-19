"use client";

import { motion } from "framer-motion";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { OverlayCard } from "@/features/graph/components/panels/PanelShell/OverlaySurface";
import {
  chromePillSurfaceStyle,
  panelSurfaceStyle,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import { smooth } from "@/lib/motion";
import type { AmbientFieldLandingSection } from "./ambient-field-landing-content";

interface AmbientFieldCtaSectionProps {
  graphReady: boolean;
  onOpenGraph: () => void;
  onReturnToTop: () => void;
  section: AmbientFieldLandingSection;
}

export function AmbientFieldCtaSection({
  graphReady,
  onOpenGraph,
  onReturnToTop,
  section,
}: AmbientFieldCtaSectionProps) {
  return (
    <section
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-section-id={section.id}
      className="flex min-h-[124svh] items-center justify-center px-4 py-[12vh] sm:px-6 sm:py-[14vh]"
    >
      <div className="mx-auto w-full max-w-[760px]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          viewport={{ once: true, amount: 0.35 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            y: smooth,
            opacity: { duration: 0.18, ease: "easeOut" },
          }}
        >
          <OverlayCard
            style={{
              ...panelSurfaceStyle,
              border:
                "1px solid color-mix(in srgb, var(--graph-panel-border) 86%, transparent)",
            }}
            className="px-6 py-6 sm:px-9 sm:py-9"
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <MetaPill mono>{section.eyebrow}</MetaPill>
              <MetaPill style={{ color: section.accentVar }}>
                {section.preset}
              </MetaPill>
            </div>

            <h2 className="mx-auto mt-5 max-w-[14ch] text-center text-[2.2rem] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[3rem]">
              {section.title}
            </h2>

            <p
              className="mx-auto mt-5 max-w-[50ch] text-center text-[15px] leading-7"
              style={{
                color:
                  "color-mix(in srgb, var(--graph-panel-text) 82%, transparent)",
              }}
            >
              {section.body}
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
                {graphReady ? "Go to graph" : "Graph still warming"}
              </button>
              <button
                type="button"
                onClick={onReturnToTop}
                className="rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
                style={{
                  ...chromePillSurfaceStyle,
                  color: "var(--graph-panel-text-dim)",
                }}
              >
                Return to top
              </button>
            </div>

            <div className="mt-7 flex flex-wrap justify-center gap-2">
              {section.bullets.map((bullet) => (
                <MetaPill key={bullet}>{bullet}</MetaPill>
              ))}
            </div>
          </OverlayCard>
        </motion.div>
      </div>
    </section>
  );
}
