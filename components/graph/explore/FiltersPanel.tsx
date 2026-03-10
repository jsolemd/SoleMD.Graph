"use client";

import { ActionIcon, Button, Select, Stack, Text } from "@mantine/core";
import { Plus, X } from "lucide-react";
import { CosmographBars, CosmographHistogram } from "@cosmograph/react";
import { useMemo, useState } from "react";
import { useDashboardStore } from "@/lib/graph/stores";
import { ALL_DATA_COLUMNS, getColumnMeta } from "@/lib/graph/columns";
import type { FilterableColumnKey } from "@/lib/graph/types";
import {
  ICON_BTN_STYLES,
  PANEL_ACCENT,
  PanelShell,
  panelSelectStyles,
  panelTextStyle,
} from "../PanelShell";
import { CosmographWidgetBoundary } from "../CosmographWidgetBoundary";

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

  const [showAddSelect, setShowAddSelect] = useState(false);

  const availableColumns = useMemo(
    () =>
      ALL_DATA_COLUMNS.filter(
        (col) =>
          col.type !== "text" &&
          !filterColumns.some((f) => f.column === col.key)
      ).map((col) => ({ value: col.key, label: col.label })),
    [filterColumns]
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
                    styles={ICON_BTN_STYLES}
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
