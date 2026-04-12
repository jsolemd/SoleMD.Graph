"use client";

import { useCallback, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  panelSurfaceStyle,
  panelTextMutedStyle,
} from "@/features/graph/components/panels/PanelShell";
import {
  SEMANTIC_GROUP_LABELS,
  SEMANTIC_GROUP_CSS_COLOR,
  resolveNodeColorKey,
  type SemanticColorKey,
} from "@/features/wiki/graph-runtime/theme";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import type { WikiGraphResponse } from "@/lib/engine/wiki-types";

interface WikiGraphLegendProps {
  graphData: WikiGraphResponse;
}

/** Ordered list of groups to display (most clinical first). */
const GROUP_ORDER: SemanticColorKey[] = [
  "diso", "chem", "gene", "anat", "phys", "proc",
  "section", "paper", "module", "default",
];

export function WikiGraphLegend({ graphData }: WikiGraphLegendProps) {
  const highlightGroups = useWikiStore((s) => s.graphHighlightGroups);
  const toggleGroup = useWikiStore((s) => s.toggleGraphHighlightGroup);
  const setGraphHighlightGroups = useWikiStore((s) => s.setGraphHighlightGroups);
  const graphSearchQuery = useWikiStore((s) => s.graphSearchQuery);
  const setGraphSearchQuery = useWikiStore((s) => s.setGraphSearchQuery);

  const [searchOpen, setSearchOpen] = useState(false);
  const hasAnyFilter = highlightGroups !== null || graphSearchQuery.length > 0;

  const clearAll = useCallback(() => {
    setGraphHighlightGroups(null);
    setGraphSearchQuery("");
    setSearchOpen(false);
  }, [setGraphHighlightGroups, setGraphSearchQuery]);

  // Compute which groups have nodes in the current data
  const presentGroups = useMemo(() => {
    const groups = new Set<SemanticColorKey>();
    for (const node of graphData.nodes) {
      groups.add(
        resolveNodeColorKey({
          kind: node.kind,
          tags: node.tags,
          semanticGroup: node.semantic_group ?? null,
          entityType: node.entity_type,
        }),
      );
    }
    return GROUP_ORDER.filter((g) => groups.has(g));
  }, [graphData.nodes]);

  const hasHighlight = highlightGroups !== null;

  return (
    <div
      className="absolute bottom-3 left-4 z-10 flex w-fit flex-col gap-1.5"
      style={{
        ...panelSurfaceStyle,
        borderRadius: 12,
        padding: 8,
      }}
    >
      {/* Search + clear row */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            if (searchOpen) {
              setGraphSearchQuery("");
            }
            setSearchOpen(!searchOpen);
          }}
          className="flex shrink-0 items-center justify-center"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: "var(--text-tertiary)",
          }}
          aria-label="Search nodes"
        >
          <Search size={10} />
        </button>
        {searchOpen && (
          <input
            type="text"
            value={graphSearchQuery}
            onChange={(e) => setGraphSearchQuery(e.target.value)}
            placeholder="Filter…"
            autoFocus
            style={{
              ...panelTextMutedStyle,
              background: "var(--graph-panel-input-bg)",
              border: "1px solid var(--graph-panel-border)",
              borderRadius: 4,
              padding: "1px 4px",
              outline: "none",
              width: 72,
              color: "var(--graph-panel-text)",
            }}
          />
        )}
        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="flex shrink-0 items-center justify-center"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "var(--text-tertiary)",
              marginLeft: "auto",
            }}
            aria-label="Clear all filters"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Semantic group items */}
      {presentGroups.map((key) => {
        const isActive = hasHighlight && highlightGroups.has(key);
        const isDimmed = hasHighlight && !isActive;
        return (
          <button
            key={key}
            onClick={() => toggleGroup(key)}
            className="flex items-center gap-1.5"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "1px 0",
              opacity: isDimmed ? 0.35 : 1,
              transition: "opacity 150ms ease-out",
            }}
          >
            <span
              style={{
                background: SEMANTIC_GROUP_CSS_COLOR[key],
                width: 8,
                height: 8,
                borderRadius: "50%",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ ...panelTextMutedStyle, whiteSpace: "nowrap" }}>
              {SEMANTIC_GROUP_LABELS[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
