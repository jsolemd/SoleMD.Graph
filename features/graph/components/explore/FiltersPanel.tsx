"use client";

import { CosmographWidgetBoundary } from "../canvas/CosmographWidgetBoundary";
import { FilterBarWidget } from "@/features/graph/cosmograph/widgets/FilterBarWidget";
import { FilterHistogramWidget } from "@/features/graph/cosmograph/widgets/FilterHistogramWidget";
import { FilterPanelShell } from "./FilterPanelShell";

const cosmographFilterOverrides: React.CSSProperties = {
  "--cosmograph-histogram-bar-color": "var(--filter-bar-base)",
  "--cosmograph-histogram-highlighted-bar-color": "var(--filter-bar-active)",
  "--cosmograph-bars-background": "var(--filter-bar-base)",
  "--cosmograph-bars-highlighted-color": "var(--filter-bar-active)",
} as React.CSSProperties;

function AdapterFilterWidget({ filter }: { filter: { column: string; type: string } }) {
  return (
    <CosmographWidgetBoundary>
      {filter.type === "numeric" ? (
        <FilterHistogramWidget column={filter.column} />
      ) : (
        <FilterBarWidget column={filter.column} />
      )}
    </CosmographWidgetBoundary>
  );
}

export function FiltersPanel() {
  return (
    <FilterPanelShell
      filterItemStyle={cosmographFilterOverrides}
      renderWidget={(filter) => <AdapterFilterWidget filter={filter} />}
    />
  );
}
