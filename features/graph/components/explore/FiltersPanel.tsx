"use client";

import { CosmographBars, CosmographHistogram } from "@cosmograph/react";
import { CosmographWidgetBoundary } from "../canvas/CosmographWidgetBoundary";
import { FilterPanelShell } from "./FilterPanelShell";

const widgetStyle: React.CSSProperties = {
  width: "100%",
};

const cosmographFilterOverrides: React.CSSProperties = {
  "--cosmograph-histogram-bar-color": "var(--filter-bar-base)",
  "--cosmograph-histogram-highlighted-bar-color": "var(--filter-bar-active)",
  "--cosmograph-bars-background": "var(--filter-bar-base)",
  "--cosmograph-bars-highlighted-color": "var(--filter-bar-active)",
} as React.CSSProperties;

function CosmographFilterWidget({ filter }: { filter: { column: string; type: string } }) {
  return (
    <CosmographWidgetBoundary>
      {filter.type === "numeric" ? (
        <CosmographHistogram
          id={`filter:${filter.column}`}
          accessor={filter.column}
          preserveSelectionOnUnmount
          highlightSelectedData
          useQuantiles
          style={widgetStyle}
        />
      ) : (
        <CosmographBars
          id={`filter:${filter.column}`}
          accessor={filter.column}
          selectOnClick
          preserveSelectionOnUnmount
          highlightSelectedData
          showSearch
          showSortingBlock
          showTotalWhenFiltered
          sort="count"
          style={widgetStyle}
        />
      )}
    </CosmographWidgetBoundary>
  );
}

export function FiltersPanel() {
  return (
    <FilterPanelShell
      filterItemStyle={cosmographFilterOverrides}
      renderWidget={(filter) => <CosmographFilterWidget filter={filter} />}
    />
  );
}
