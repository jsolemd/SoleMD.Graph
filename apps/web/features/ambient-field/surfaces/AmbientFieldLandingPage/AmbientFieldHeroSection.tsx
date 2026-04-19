"use client";

import { motion } from "framer-motion";
import { chromePillSurfaceStyle } from "@/features/graph/components/panels/PanelShell/panel-styles";
import { smooth } from "@/lib/motion";
import type { AmbientFieldLandingSection } from "./ambient-field-landing-content";

interface AmbientFieldHeroSectionProps {
  onExploreRuntime: () => void;
  section: AmbientFieldLandingSection;
}

export function AmbientFieldHeroSection({
  onExploreRuntime,
  section,
}: AmbientFieldHeroSectionProps) {
  return (
    <section
      id={section.id}
      data-ambient-section
      data-preset={section.preset}
      data-section-id={section.id}
      className="flex min-h-[100svh] items-center justify-center px-4 pb-24 pt-24 sm:px-6 sm:pb-28 sm:pt-28"
    >
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-center">
        <div className="max-w-[760px] text-center">
          <motion.p
            className="text-[11px] uppercase tracking-[0.24em]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: smooth,
              opacity: { duration: 0.18, ease: "easeOut" },
            }}
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text-dim) 92%, transparent)",
            }}
          >
            {section.eyebrow}
          </motion.p>

          <motion.h1
            className="mx-auto mt-5 max-w-[10ch] text-[2.9rem] font-medium leading-[0.9] tracking-[-0.05em] sm:text-[4.25rem] lg:text-[5.2rem]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: smooth,
              opacity: { duration: 0.18, ease: "easeOut" },
            }}
          >
            {section.title}
          </motion.h1>

          <motion.p
            className="mx-auto mt-6 max-w-[38ch] text-[15px] leading-7 sm:text-[17px] sm:leading-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: smooth,
              opacity: { duration: 0.18, ease: "easeOut", delay: 0.04 },
            }}
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
            }}
          >
            {section.body}
          </motion.p>
        </div>

        <motion.div
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            y: smooth,
            opacity: { duration: 0.18, ease: "easeOut", delay: 0.08 },
          }}
        >
          <button
            type="button"
            onClick={onExploreRuntime}
            className="rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
            style={{
              ...chromePillSurfaceStyle,
              color: "var(--graph-panel-text)",
            }}
          >
            Enter the field
          </button>
        </motion.div>
      </div>
    </section>
  );
}
