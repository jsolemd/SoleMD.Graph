"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Text } from "@mantine/core";
import { crisp } from "@/lib/motion";
import {
  panelAccentCardEntityClassName,
  panelAccentCardEntityStyle,
  panelScaledPx,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { entityTypeCssColorByType } from "@/lib/theme/pastel-tokens";
import type { EntityProfileProps } from "./index";

const RECEPTOR_TYPES = new Set(["gene", "receptor"]);

/** Bar height and gap for the receptor affinity chart. */
const BAR_H = 14;
const BAR_GAP = 4;
const LABEL_W = 90;

export default function ChemicalProfile({
  page,
  bodyMatches,
  onNavigate,
}: EntityProfileProps) {
  // Extract receptor/gene mentions as proxy for receptor affinity
  const receptorMentions = useMemo(() => {
    const mentions = bodyMatches
      .filter((m) => RECEPTOR_TYPES.has(m.entity_type.toLowerCase()))
      .sort((a, b) => b.paper_count - a.paper_count);

    // Deduplicate by canonical_name
    const seen = new Set<string>();
    return mentions.filter((m) => {
      if (seen.has(m.canonical_name)) return false;
      seen.add(m.canonical_name);
      return true;
    });
  }, [bodyMatches]);

  const diseaseMentions = useMemo(
    () =>
      bodyMatches
        .filter((m) => m.entity_type.toLowerCase() === "disease")
        .sort((a, b) => b.paper_count - a.paper_count)
        .slice(0, 5),
    [bodyMatches],
  );

  if (receptorMentions.length === 0 && diseaseMentions.length === 0)
    return null;

  const maxCount = receptorMentions[0]?.paper_count ?? 1;
  const visibleReceptors = receptorMentions.slice(0, 8);

  return (
    <div
      className={panelAccentCardEntityClassName}
      data-entity-type={page.entity_type?.toLowerCase()}
      style={panelAccentCardEntityStyle}
    >
      {/* Receptor affinity bars */}
      {visibleReceptors.length > 0 && (
        <div>
          <Text style={sectionLabelStyle}>Receptor / Gene Mentions</Text>
          <svg
            width="100%"
            height={visibleReceptors.length * (BAR_H + BAR_GAP)}
            className="mt-1.5"
          >
            {visibleReceptors.map((m, i) => {
              const fraction = m.paper_count / maxCount;
              const y = i * (BAR_H + BAR_GAP);

              return (
                <g key={m.canonical_name}>
                  <text
                    x={0}
                    y={y + BAR_H * 0.75}
                    style={{
                      ...panelTextDimStyle,
                      fontSize: panelScaledPx(9),
                      fill: "var(--graph-panel-text-muted)",
                    }}
                  >
                    {m.canonical_name.length > 14
                      ? `${m.canonical_name.slice(0, 13)}...`
                      : m.canonical_name}
                  </text>
                  <motion.rect
                    x={LABEL_W}
                    y={y + 1}
                    height={BAR_H - 2}
                    rx={3}
                    fill="var(--entity-accent, var(--mode-accent))"
                    opacity={0.6}
                    initial={{ width: 0 }}
                    animate={{
                      width: `calc((100% - ${LABEL_W + 30}px) * ${fraction})`,
                    }}
                    transition={{ ...crisp, delay: i * 0.06 }}
                  />
                  <text
                    x="100%"
                    y={y + BAR_H * 0.75}
                    textAnchor="end"
                    style={{
                      fontSize: panelScaledPx(8),
                      fill: "var(--graph-panel-text-dim)",
                    }}
                  >
                    {m.paper_count}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Disease indications */}
      {diseaseMentions.length > 0 && (
        <div className="mt-2">
          <Text style={sectionLabelStyle}>Indications</Text>
          <div className="mt-1 flex flex-wrap gap-1">
            {diseaseMentions.map((m) => (
              <button
                key={m.concept_id}
                type="button"
                className="rounded-full px-1.5 py-0.5 transition-colors hover:brightness-110"
                style={{
                  ...panelTextStyle,
                  fontSize: panelScaledPx(9),
                  backgroundColor:
                    `color-mix(in srgb, ${entityTypeCssColorByType.disease} 20%, var(--graph-panel-bg))`,
                  border:
                    `1px solid color-mix(in srgb, ${entityTypeCssColorByType.disease} 30%, var(--graph-panel-border))`,
                  cursor: "pointer",
                }}
                onClick={() => {
                  const slug = `entities/${m.canonical_name.toLowerCase().replace(/\s+/g, "-")}`;
                  onNavigate(slug);
                }}
              >
                {m.canonical_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
