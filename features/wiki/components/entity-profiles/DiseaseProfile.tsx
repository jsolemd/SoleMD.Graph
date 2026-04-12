"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Text } from "@mantine/core";
import { crisp } from "@/lib/motion";
import {
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelScaledPx,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { formatNumber } from "@/lib/helpers";
import { entityTypeCssColorByType } from "@/lib/theme/pastel-tokens";
import type { EntityProfileProps } from "./index";

const CHEMICAL_TYPES = new Set(["chemical"]);
const MOLECULAR_TYPES = new Set(["gene", "receptor"]);

/** Max width for the evidence scale bar. */
const SCALE_BAR_W = 120;

export default function DiseaseProfile({
  page,
  pageContext,
  bodyMatches,
  onNavigate,
}: EntityProfileProps) {
  const chemicalMentions = useMemo(
    () =>
      bodyMatches
        .filter((m) => CHEMICAL_TYPES.has(m.entity_type.toLowerCase()))
        .sort((a, b) => b.paper_count - a.paper_count)
        .filter(
          (m, i, arr) =>
            arr.findIndex((x) => x.canonical_name === m.canonical_name) === i,
        )
        .slice(0, 6),
    [bodyMatches],
  );

  const molecularMentions = useMemo(
    () =>
      bodyMatches
        .filter((m) => MOLECULAR_TYPES.has(m.entity_type.toLowerCase()))
        .sort((a, b) => b.paper_count - a.paper_count)
        .filter(
          (m, i, arr) =>
            arr.findIndex((x) => x.canonical_name === m.canonical_name) === i,
        )
        .slice(0, 6),
    [bodyMatches],
  );

  const corpusCount = pageContext?.total_corpus_paper_count ?? 0;
  const graphCount = pageContext?.total_graph_paper_count ?? 0;
  const hasScale = corpusCount > 0;

  if (
    chemicalMentions.length === 0 &&
    molecularMentions.length === 0 &&
    !hasScale
  )
    return null;

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
      {/* Evidence scale */}
      {hasScale && (
        <div className="flex items-center gap-3">
          <Text style={sectionLabelStyle}>Evidence</Text>
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <motion.div
                  className="rounded-sm"
                  style={{
                    height: panelScaledPx(6),
                    backgroundColor: "var(--entity-accent, var(--mode-accent))",
                    opacity: 0.7,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: SCALE_BAR_W }}
                  transition={crisp}
                />
                <Text style={{ ...panelTextDimStyle, fontSize: panelScaledPx(8) }}>
                  {formatNumber(corpusCount)} corpus
                </Text>
              </div>
              <div className="flex items-center gap-1.5">
                <motion.div
                  className="rounded-sm"
                  style={{
                    height: panelScaledPx(6),
                    backgroundColor: "var(--entity-accent, var(--mode-accent))",
                    opacity: 0.4,
                  }}
                  initial={{ width: 0 }}
                  animate={{
                    width:
                      corpusCount > 0
                        ? (graphCount / corpusCount) * SCALE_BAR_W
                        : 0,
                  }}
                  transition={crisp}
                />
                <Text style={{ ...panelTextDimStyle, fontSize: panelScaledPx(8) }}>
                  {formatNumber(graphCount)} in graph
                </Text>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Implicated chemicals */}
      {chemicalMentions.length > 0 && (
        <div className="mt-2">
          <Text style={sectionLabelStyle}>Implicated Chemicals</Text>
          <div className="mt-1 flex flex-wrap gap-1">
            {chemicalMentions.map((m) => (
              <button
                key={m.concept_id}
                type="button"
                className="rounded-full px-1.5 py-0.5 transition-colors hover:brightness-110"
                style={{
                  ...panelTextStyle,
                  fontSize: panelScaledPx(9),
                  backgroundColor:
                    `color-mix(in srgb, ${entityTypeCssColorByType.chemical} 20%, var(--graph-panel-bg))`,
                  border:
                    `1px solid color-mix(in srgb, ${entityTypeCssColorByType.chemical} 30%, var(--graph-panel-border))`,
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

      {/* Molecular targets */}
      {molecularMentions.length > 0 && (
        <div className="mt-2">
          <Text style={sectionLabelStyle}>Molecular Targets</Text>
          <div className="mt-1 flex flex-wrap gap-1">
            {molecularMentions.map((m) => (
              <button
                key={m.concept_id}
                type="button"
                className="rounded-full px-1.5 py-0.5 transition-colors hover:brightness-110"
                style={{
                  ...panelTextStyle,
                  fontSize: panelScaledPx(9),
                  backgroundColor:
                    `color-mix(in srgb, ${entityTypeCssColorByType.gene} 20%, var(--graph-panel-bg))`,
                  border:
                    `1px solid color-mix(in srgb, ${entityTypeCssColorByType.gene} 30%, var(--graph-panel-border))`,
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
