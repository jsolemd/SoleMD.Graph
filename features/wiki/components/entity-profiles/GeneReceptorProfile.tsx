"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Text } from "@mantine/core";
import { crisp } from "@/lib/motion";
import {
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import type { EntityProfileProps } from "./index";

const BAR_H = 14;
const BAR_GAP = 4;
const LABEL_W = 90;

export default function GeneReceptorProfile({
  page,
  bodyMatches,
  onNavigate,
}: EntityProfileProps) {
  // Chemicals that mention this receptor/gene (ligands, modulators)
  const ligandMentions = useMemo(() => {
    const mentions = bodyMatches
      .filter((m) => m.entity_type.toLowerCase() === "chemical")
      .sort((a, b) => b.paper_count - a.paper_count);
    const seen = new Set<string>();
    return mentions
      .filter((m) => {
        if (seen.has(m.canonical_name)) return false;
        seen.add(m.canonical_name);
        return true;
      })
      .slice(0, 8);
  }, [bodyMatches]);

  const diseaseMentions = useMemo(
    () =>
      bodyMatches
        .filter((m) => m.entity_type.toLowerCase() === "disease")
        .sort((a, b) => b.paper_count - a.paper_count)
        .filter(
          (m, i, arr) =>
            arr.findIndex((x) => x.canonical_name === m.canonical_name) === i,
        )
        .slice(0, 5),
    [bodyMatches],
  );

  if (ligandMentions.length === 0 && diseaseMentions.length === 0) return null;

  const maxCount = ligandMentions[0]?.paper_count ?? 1;

  return (
    <div
      className={panelAccentCardClassName}
      data-entity-type={page.entity_type?.toLowerCase()}
      style={{
        ...panelAccentCardStyle,
        backgroundColor:
          "color-mix(in srgb, var(--entity-accent, var(--mode-accent)) 12%, var(--graph-panel-bg))",
        border:
          "1px solid color-mix(in srgb, var(--entity-accent, var(--mode-accent)) 20%, var(--graph-panel-border))",
      }}
    >
      {/* Ligand / chemical mentions */}
      {ligandMentions.length > 0 && (
        <div>
          <Text style={sectionLabelStyle}>Ligands & Modulators</Text>
          <svg
            width="100%"
            height={ligandMentions.length * (BAR_H + BAR_GAP)}
            className="mt-1.5"
          >
            {ligandMentions.map((m, i) => {
              const fraction = m.paper_count / maxCount;
              const y = i * (BAR_H + BAR_GAP);

              return (
                <g key={m.canonical_name}>
                  <text
                    x={0}
                    y={y + BAR_H * 0.75}
                    style={{
                      fontSize: 9,
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
                    fill="var(--color-fresh-green)"
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
                      fontSize: 8,
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

      {/* Disease associations */}
      {diseaseMentions.length > 0 && (
        <div className="mt-2">
          <Text style={sectionLabelStyle}>Disease Associations</Text>
          <div className="mt-1 flex flex-wrap gap-1">
            {diseaseMentions.map((m) => (
              <button
                key={m.concept_id}
                type="button"
                className="rounded-full px-1.5 py-0.5 transition-colors hover:brightness-110"
                style={{
                  ...panelTextStyle,
                  fontSize: 9,
                  backgroundColor:
                    "color-mix(in srgb, var(--color-warm-coral) 20%, var(--graph-panel-bg))",
                  border:
                    "1px solid color-mix(in srgb, var(--color-warm-coral) 30%, var(--graph-panel-border))",
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
