"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ActionIcon, Button, Select, Stack, Text } from "@mantine/core";
import { useGraphInstance } from "@/features/graph/cosmograph";
import { Plus, X } from "lucide-react";
import {
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { getColumnsForLayer, getColumnMeta } from "@/features/graph/lib/columns";
import type { FilterableColumnKey } from "@/features/graph/types";
import {
  iconBtnStyles,
  PANEL_ACCENT,
  PanelBody,
  PanelDivider,
  PanelShell,
  panelSelectStyles,
  panelTextStyle,
} from "../panels/PanelShell";

const DEFAULT_VISIBLE_FILTERS = 4;

interface FilterPanelShellProps {
  /** Renders the per-filter widget (histogram, range slider, etc.) */
  renderWidget: (filter: { column: string; type: string }) => ReactNode;
  /** Optional style applied to each filter item wrapper. */
  filterItemStyle?: React.CSSProperties;
  onVisibleFiltersChange?: (
    filters: Array<{ column: string; type: string }>,
  ) => void;
}

export function FilterPanelShell({
  renderWidget,
  filterItemStyle,
  onVisibleFiltersChange,
}: FilterPanelShellProps) {
  const cosmograph = useGraphInstance();
  const filterColumns = useDashboardStore((s) => s.filterColumns);
  const addFilter = useDashboardStore((s) => s.addFilter);
  const removeFilter = useDashboardStore((s) => s.removeFilter);
  const closePanel = useDashboardStore((s) => s.closePanel);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const clearVisibilityFocus = useDashboardStore((s) => s.clearVisibilityFocus);
  const selectNode = useGraphStore((s) => s.selectNode);
  const setActiveSelectionSourceId = useDashboardStore((s) => s.setActiveSelectionSourceId);
  const setCurrentPointScopeSql = useDashboardStore((s) => s.setCurrentPointScopeSql);
  const setSelectedPointCount = useDashboardStore((s) => s.setSelectedPointCount);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const unlockSelection = useDashboardStore((s) => s.unlockSelection);
  const [showAddSelect, setShowAddSelect] = useState(false);
  const [showAllFilters, setShowAllFilters] = useState(false);

  const layerDataColumns = useMemo(
    () => getColumnsForLayer(activeLayer),
    [activeLayer],
  );

  const availableColumns = useMemo(
    () =>
      layerDataColumns
        .filter(
          (col) =>
            col.type !== "text" &&
            !filterColumns.some((f) => f.column === col.key),
        )
        .map((col) => ({ value: col.key, label: col.label })),
    [filterColumns, layerDataColumns],
  );
  const visibleFilters = useMemo(
    () =>
      showAllFilters
        ? filterColumns
        : filterColumns.slice(0, DEFAULT_VISIBLE_FILTERS),
    [filterColumns, showAllFilters],
  );
  const hiddenFilterCount = filterColumns.length - visibleFilters.length;

  useEffect(() => {
    onVisibleFiltersChange?.(visibleFilters);
  }, [onVisibleFiltersChange, visibleFilters]);

  const handleResetAll = () => {
    cosmograph?.pointsSelection?.reset();
    cosmograph?.linksSelection?.reset();
    selectNode(null);
    clearVisibilityFocus();
    setCurrentPointScopeSql(null);
    setSelectedPointCount(0);
    setActiveSelectionSourceId(null);
    setTimelineSelection(undefined);
    setTableView("selection");
    unlockSelection();
  };

  return (
    <PanelShell
      id="filters"
      title="Filters"
      headerActions={(
        <Button
          size="compact-xs"
          variant="subtle"
          color={PANEL_ACCENT}
          onClick={handleResetAll}
        >
          Reset All
        </Button>
      )}
      onClose={() => closePanel("filters")}
    >
      <PanelBody panelId="filters">
        <Stack gap="sm">
          {visibleFilters.flatMap((filter, i) => {
            const meta = getColumnMeta(filter.column);
            if (!meta) return [];

            const item = (
              <div key={filter.column} style={filterItemStyle}>
                <div className="mb-1 flex items-center justify-between">
                  <Text size="xs" fw={600} style={panelTextStyle}>
                    {meta.label}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    size={18}
                    radius="sm"
                    onClick={() => {
                      clearSelectionClause(
                        cosmograph?.pointsSelection,
                        createSelectionSource(`filter:${filter.column}`),
                      );
                      removeFilter(filter.column);
                    }}
                    aria-label={`Remove ${meta.label} filter`}
                    styles={iconBtnStyles}
                  >
                    <X size={10} />
                  </ActionIcon>
                </div>
                {renderWidget(filter)}
              </div>
            );

            return i > 0
              ? [<PanelDivider key={`div-${filter.column}`} />, item]
              : [item];
          })}

          {hiddenFilterCount > 0 && !showAllFilters && (
            <Button
              size="xs"
              variant="subtle"
              color={PANEL_ACCENT}
              onClick={() => setShowAllFilters(true)}
            >
              Show {hiddenFilterCount} More Filters
            </Button>
          )}

          {showAllFilters && filterColumns.length > DEFAULT_VISIBLE_FILTERS && (
            <Button
              size="xs"
              variant="subtle"
              color={PANEL_ACCENT}
              onClick={() => setShowAllFilters(false)}
            >
              Show Fewer Filters
            </Button>
          )}

          {visibleFilters.length > 0 && <PanelDivider />}

          {showAddSelect ? (
            <Select
              size="xs"
              placeholder="Select column..."
              data={availableColumns}
              onChange={(v) => {
                if (v) {
                  addFilter(v as FilterableColumnKey);
                  setShowAllFilters(true);
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
              Add Filter
              {availableColumns.length > 0 && ` · ${availableColumns.length}`}
            </Button>
          )}
        </Stack>
      </PanelBody>
    </PanelShell>
  );
}
