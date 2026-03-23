"use client";

import { type ReactNode, useMemo, useState } from "react";
import { ActionIcon, Button, Select, Stack, Text } from "@mantine/core";
import { Plus, X } from "lucide-react";
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

interface FilterPanelShellProps {
  /** Renders the per-filter widget (histogram, range slider, etc.) */
  renderWidget: (filter: { column: string; type: string }) => ReactNode;
  /** Optional style applied to each filter item wrapper. */
  filterItemStyle?: React.CSSProperties;
}

export function FilterPanelShell({
  renderWidget,
  filterItemStyle,
}: FilterPanelShellProps) {
  const filterColumns = useDashboardStore((s) => s.filterColumns);
  const addFilter = useDashboardStore((s) => s.addFilter);
  const removeFilter = useDashboardStore((s) => s.removeFilter);
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const [showAddSelect, setShowAddSelect] = useState(false);

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
              <div key={filter.column} style={filterItemStyle}>
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
                {renderWidget(filter)}
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
              Add Filter
              {availableColumns.length > 0 && ` · ${availableColumns.length}`}
            </Button>
          )}
        </Stack>
      </div>
    </PanelShell>
  );
}
