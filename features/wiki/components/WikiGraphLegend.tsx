"use client";

import { useCallback, useMemo, useState } from "react";
import {
  PanelSearchField,
  panelScaledPx,
  panelSelectStyles,
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
const LEGEND_SEARCH_WIDTH = panelScaledPx(94);
const LEGEND_PADDING = 8;
// Enough interior width for the expanded search input plus its padding
// gutter — keeps the right edge of the search aligned with the legend's
// right edge instead of spilling past it when opened. `panelScaledPx`
// returns a CSS `calc()` string that scales with the panel zoom, so we
// build the floor as a nested calc so it scales with the input itself.
const LEGEND_MIN_WIDTH = `calc(${LEGEND_SEARCH_WIDTH} + ${LEGEND_PADDING * 2}px)`;

const legendSearchStyles = {
  input: {
    ...panelSelectStyles.input,
    minHeight: panelScaledPx(22),
    height: panelScaledPx(22),
    fontSize: panelScaledPx(10),
    borderRadius: 6,
    paddingLeft: panelScaledPx(22),
    paddingRight: panelScaledPx(8),
  },
} as const;

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

  const handleSearchAction = useCallback(() => {
    if (searchOpen || hasAnyFilter) {
      clearAll();
      return;
    }

    setSearchOpen(true);
  }, [clearAll, hasAnyFilter, searchOpen]);

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
        padding: LEGEND_PADDING,
        // Bound to the graph surface so a large group list never overflows
        // past the panel edges — 12px bottom offset + 12px top breathing room.
        maxHeight: "calc(100% - 24px)",
        // Floor the legend's width at the expanded search width + padding so
        // the search input never overshoots the legend's right edge when it
        // opens. Labels are all short enough that this is the dominant width.
        minWidth: LEGEND_MIN_WIDTH,
      }}
      >
      {/* Search + clear row — sticky above the scrolling group list. */}
      <div className="flex w-full shrink-0 items-center">
        <PanelSearchField
          open={searchOpen}
          collapsible
          value={graphSearchQuery}
          onValueChange={setGraphSearchQuery}
          placeholder="Filter…"
          ariaLabel="Search wiki graph nodes"
          actionLabel={
            hasAnyFilter
              ? "Clear all filters"
              : searchOpen
                ? "Close search"
                : "Search nodes"
          }
          actionMode={searchOpen || hasAnyFilter ? "close" : "search"}
          onAction={handleSearchAction}
          styles={legendSearchStyles}
          width={LEGEND_SEARCH_WIDTH}
          collapsedActionSize={18}
          inputActionSize={16}
          actionPlacement="start"
          slotHeight={panelScaledPx(22)}
        />
      </div>

      {/* Semantic group items — internal scroll when the list would overflow. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
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
    </div>
  );
}
