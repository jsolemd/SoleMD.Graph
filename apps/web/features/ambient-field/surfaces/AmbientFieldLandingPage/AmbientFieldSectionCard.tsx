"use client";

import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { OverlayCard } from "@/features/graph/components/panels/PanelShell/OverlaySurface";
import {
  panelAccentCardStyle,
  panelSurfaceStyle,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import { smooth } from "@/lib/motion";
import type { AmbientFieldLandingSection } from "./ambient-field-landing-content";

const sectionCardStyle: CSSProperties = {
  ...panelSurfaceStyle,
  border: "1px solid var(--graph-panel-border)",
};

interface AmbientFieldSectionCardProps {
  section: AmbientFieldLandingSection;
}

export function AmbientFieldSectionCard({
  section,
}: AmbientFieldSectionCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      viewport={{ once: true, amount: 0.35 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{
        y: smooth,
        opacity: { duration: 0.18, ease: "easeOut" },
      }}
    >
      <OverlayCard style={sectionCardStyle} className="px-5 py-5 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill mono>{section.eyebrow}</MetaPill>
          <MetaPill style={{ color: section.accentVar }}>{section.preset}</MetaPill>
        </div>

        <h2 className="mt-5 max-w-[14ch] text-[2rem] font-medium leading-[0.98] tracking-[-0.035em] sm:text-[2.55rem]">
          {section.title}
        </h2>

        <p
          className="mt-4 max-w-[48ch] text-[14px] leading-7 sm:text-[15px]"
          style={{
            color:
              "color-mix(in srgb, var(--graph-panel-text) 84%, transparent)",
          }}
        >
          {section.body}
        </p>

        <div className="mt-6 rounded-[1.1rem] p-4 sm:p-5" style={panelAccentCardStyle}>
          <p
            className="text-[13px] leading-6 sm:text-[14px] sm:leading-7"
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text) 78%, transparent)",
            }}
          >
            {section.detail}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {section.bullets.map((bullet) => (
            <MetaPill key={bullet}>{bullet}</MetaPill>
          ))}
        </div>
      </OverlayCard>
    </motion.article>
  );
}
