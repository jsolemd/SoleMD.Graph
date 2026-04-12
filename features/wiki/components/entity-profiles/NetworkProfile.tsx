"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import {
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelScaledPx,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { entityTypeCssColorByType } from "@/lib/theme/pastel-tokens";
import type { EntityProfileProps } from "./index";

export default function NetworkProfile({
  page,
  bodyMatches,
  onNavigate,
}: EntityProfileProps) {
  // All entity types that participate in this network/process
  const componentEntities = useMemo(() => {
    const seen = new Set<string>();
    return bodyMatches
      .sort((a, b) => b.paper_count - a.paper_count)
      .filter((m) => {
        if (seen.has(m.canonical_name)) return false;
        seen.add(m.canonical_name);
        return true;
      })
      .slice(0, 12);
  }, [bodyMatches]);

  // Group by entity type for visual clustering
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof componentEntities>();
    for (const m of componentEntities) {
      const type = m.entity_type.toLowerCase();
      const list = groups.get(type) ?? [];
      list.push(m);
      groups.set(type, list);
    }
    return groups;
  }, [componentEntities]);

  if (componentEntities.length === 0) return null;

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
      <Text style={sectionLabelStyle}>Component Entities</Text>

      <div className="mt-1.5 flex flex-col gap-1.5">
        {[...grouped.entries()].map(([type, entities]) => {
          const color = entityTypeCssColorByType[type] ?? "var(--mode-accent)";
          return (
            <div key={type} className="flex flex-wrap items-center gap-1">
              <Text
                component="span"
                style={{
                  fontSize: panelScaledPx(8),
                  color: "var(--graph-panel-text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  width: 52,
                  flexShrink: 0,
                }}
              >
                {type}
              </Text>
              {entities.map((m) => (
                <button
                  key={m.concept_id}
                  type="button"
                  className="rounded-full px-1.5 py-0.5 transition-colors hover:brightness-110"
                  style={{
                    ...panelTextStyle,
                    fontSize: panelScaledPx(9),
                    backgroundColor: `color-mix(in srgb, ${color} 20%, var(--graph-panel-bg))`,
                    border: `1px solid color-mix(in srgb, ${color} 30%, var(--graph-panel-border))`,
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
          );
        })}
      </div>
    </div>
  );
}
