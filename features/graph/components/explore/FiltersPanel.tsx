"use client";

import { ActionIcon, Button, Select, Stack, Text } from "@mantine/core";
import { Plus, X } from "lucide-react";
import { CosmographBars, CosmographHistogram } from "@cosmograph/react";
import { useMemo, useState } from "react";
import { useDashboardStore } from "@/features/graph/stores";
import { getColumnsForLayer, getColumnMeta } from "@/features/graph/lib/columns";
import type { FilterableColumnKey } from "@/features/graph/types";
import {
  iconBtnStyles,
  PANEL_ACCENT,
  PanelShell,
  panelSelectStyles,
  panelTextStyle,
} from "../panels/PanelShell";
import { CosmographWidgetBoundary } from "../canvas/CosmographWidgetBoundary";

const widgetStyle: React.CSSProperties = {
  width: "100%",
};

const cosmographFilterOverrides: React.CSSProperties = {
  "--cosmograph-histogram-bar-color": "var(--filter-bar-base)",
  "--cosmograph-histogram-highlighted-bar-color": "var(--filter-bar-active)",
  "--cosmograph-bars-background": "var(--filter-bar-base)",
  "--cosmograph-bars-highlighted-color": "var(--filter-bar-active)",
} as React.CSSProperties;

export function FiltersPanel() {
  const filterColumns = useDashboardStore((s) => s.filterColumns);
  const addFilter = useDashboardStore((s) => s.addFilter);
  const removeFilter = useDashboardStore((s) => s.removeFilter);
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const [showAddSelect, setShowAddSelect] = useState(false);

  const layerDataColumns = useMemo(() => getColumnsForLayer(activeLayer), [activeLayer]);

  const availableColumns = useMemo(
    () =>
      layerDataColumns.filter(
        (col) =>
          col.type !== "text" &&
          !filterColumns.some((f) => f.column === col.key)
      ).map((col) => ({ value: col.key, label: col.label })),
    [filterColumns, layerDataColumns]
  );

  return (
    <PanelShell
      title="Filters"
      side="left"
      onClose={() => setActivePanel(null)}
    >
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="lg">
          {filterColumns.map((filter) => {
            const meta = getColumnMeta(filter.column);
            if (!meta) return null;

            return (
              <div key={filter.column} style={cosmographFilterOverrides}>
                <div className="mb-1 flex items-center justify-between">
                  <Text size="xs" fw={600} style={panelTextStyle}>
                    {meta.label}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    size={18}
                    radius="sm"
                    onClick={() => removeFilter(filter.column)}
                    aria-label={`Remove ${meta.label} filter`}
                    styles={iconBtnStyles}
                  >
                    <X size={10} />
                  </ActionIcon>
                </div>
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
              </div>
            );
          })}

          {showAddSelect ? (
            <Select
              size="xs"
              placeholder="Select column..."
              data={availableColumns}
              onChange={(v) => {
                if (v) {
                  addFilter(v as FilterableColumnKey);
                  setShowAddSelect(false);
                }
              }}
              onBlur={() => setShowAddSelect(false)}
              autoFocus
              searchable
              styles={panelSelectStyles}
            />
          ) : (
            <Button
              size="xs"
              variant="subtle"
              color={PANEL_ACCENT}
              leftSection={<Plus size={14} />}
              onClick={() => setShowAddSelect(true)}
              disabled={availableColumns.length === 0}
            >
              Add Filter{availableColumns.length > 0 && ` · ${availableColumns.length}`}
            </Button>
          )}
        </Stack>
      </div>
    </PanelShell>
  );
}
