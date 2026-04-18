"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import {
  panelAccentCardEntityClassName,
  panelAccentCardEntityStyle,
  panelScaledPx,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { entityTypeCssColorByType } from "@/lib/pastel-tokens";
import type { EntityProfileProps } from "./index";

const DISEASE_TYPES = new Set(["disease"]);
const NETWORK_TYPES = new Set(["network", "biological process"]);

export default function AnatomyProfile({
  page,
  bodyMatches,
  onNavigate,
}: EntityProfileProps) {
  const diseaseMentions = useMemo(
    () =>
      bodyMatches
        .filter((m) => DISEASE_TYPES.has(m.entity_type.toLowerCase()))
        .sort((a, b) => b.paper_count - a.paper_count)
        .filter(
          (m, i, arr) =>
            arr.findIndex((x) => x.canonical_name === m.canonical_name) === i,
        )
        .slice(0, 6),
    [bodyMatches],
  );

  const networkMentions = useMemo(
    () =>
      bodyMatches
        .filter((m) => NETWORK_TYPES.has(m.entity_type.toLowerCase()))
        .sort((a, b) => b.paper_count - a.paper_count)
        .filter(
          (m, i, arr) =>
            arr.findIndex((x) => x.canonical_name === m.canonical_name) === i,
        )
        .slice(0, 6),
    [bodyMatches],
  );

  if (diseaseMentions.length === 0 && networkMentions.length === 0)
    return null;

  return (
    <div
      className={panelAccentCardEntityClassName}
      data-entity-type={page.entity_type?.toLowerCase()}
      style={panelAccentCardEntityStyle}
    >
      {/* Associated disorders */}
      {diseaseMentions.length > 0 && (
        <div>
          <Text style={sectionLabelStyle}>Associated Disorders</Text>
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

      {/* Connected networks / processes */}
      {networkMentions.length > 0 && (
        <div className={diseaseMentions.length > 0 ? "mt-2" : ""}>
          <Text style={sectionLabelStyle}>Connected Pathways</Text>
          <div className="mt-1 flex flex-wrap gap-1">
            {networkMentions.map((m) => (
              <button
                key={m.concept_id}
                type="button"
                className="rounded-full px-1.5 py-0.5 transition-colors hover:brightness-110"
                style={{
                  ...panelTextStyle,
                  fontSize: panelScaledPx(9),
                  backgroundColor:
                    `color-mix(in srgb, ${entityTypeCssColorByType.network} 20%, var(--graph-panel-bg))`,
                  border:
                    `1px solid color-mix(in srgb, ${entityTypeCssColorByType.network} 30%, var(--graph-panel-border))`,
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
