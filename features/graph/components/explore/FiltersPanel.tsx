"use client";

import { CosmographWidgetBoundary } from "../canvas/CosmographWidgetBoundary";
import { FilterBarWidget } from "@/features/graph/cosmograph/widgets/FilterBarWidget";
import { FilterHistogramWidget } from "@/features/graph/cosmograph/widgets/FilterHistogramWidget";
import type { GraphBundleQueries } from "@/features/graph/types";
import { FilterPanelShell } from "./FilterPanelShell";

const cosmographFilterOverrides: React.CSSProperties = {
  "--cosmograph-histogram-bar-color": "var(--filter-bar-base)",
  "--cosmograph-histogram-highlighted-bar-color": "var(--filter-bar-active)",
  "--cosmograph-bars-background": "var(--filter-bar-base)",
  "--cosmograph-bars-highlighted-color": "var(--filter-bar-active)",
} as React.CSSProperties;

function AdapterFilterWidget({
  filter,
  queries,
}: {
  filter: { column: string; type: string };
  queries: GraphBundleQueries;
}) {
  return (
    <CosmographWidgetBoundary>
      {filter.type === "numeric" ? (
        <FilterHistogramWidget column={filter.column} queries={queries} />
      ) : (
        <FilterBarWidget column={filter.column} queries={queries} />
      )}
    </CosmographWidgetBoundary>
  );
}

export function FiltersPanel({ queries }: { queries: GraphBundleQueries }) {
  return (
    <FilterPanelShell
      filterItemStyle={cosmographFilterOverrides}
      renderWidget={(filter) => (
        <AdapterFilterWidget filter={filter} queries={queries} />
      )}
    />
  );
}
