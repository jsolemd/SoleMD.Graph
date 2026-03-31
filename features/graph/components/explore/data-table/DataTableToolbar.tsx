"use client";

import { ActionIcon, Group, Pagination, SegmentedControl, Text, Tooltip } from "@mantine/core";
import { Download } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, MapLayer } from "@/features/graph/types";
import { panelTextDimStyle, iconBtnStyles, PANEL_ACCENT } from "../../panels/PanelShell";

interface DataTableToolbarProps {
  resolvedTableView: "selection" | "dataset";
  queryTableView: "current" | "selected";
  selectionAvailable: boolean;
  totalPages: number;
  safePage: number;
  pageLoading: boolean;
  pageRefreshing: boolean;
  totalRows: number;
  queries: GraphBundleQueries;
  activeLayer: MapLayer;
  currentPointScopeSql: string | null;
}

export function DataTableToolbar({
  resolvedTableView,
  queryTableView,
  selectionAvailable,
  totalPages,
  safePage,
  pageLoading,
  pageRefreshing,
  totalRows,
  queries,
  activeLayer,
  currentPointScopeSql,
}: DataTableToolbarProps) {
  const setTablePage = useDashboardStore((s) => s.setTablePage);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const scopeLabel = resolvedTableView === "selection" ? "selection" : "all";
  const rowLabel = totalRows === 1 ? "row" : "rows";
  const rowCountLabel = pageLoading
    ? `Loading ${scopeLabel} rows...`
    : pageRefreshing
      ? `Updating ${scopeLabel}... ${totalRows.toLocaleString()} ${rowLabel}`
      : `${totalRows.toLocaleString()} ${scopeLabel} ${rowLabel}`;

  const handleExport = async () => {
    const csv = await queries.exportTableCsv({
      layer: activeLayer,
      view: queryTableView,
      currentPointScopeSql,
    });

    if (!csv) {
      return;
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "solemd-graph-data.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center justify-between px-2.5 py-1.5">
      <Group gap="sm">
        <SegmentedControl
          size="xs"
          color={PANEL_ACCENT}
          data={[
            {
              label: "Selection",
              value: "selection",
              disabled: !selectionAvailable,
            },
            {
              label: "All",
              value: "dataset",
            },
          ]}
          value={resolvedTableView}
          onChange={(value) => setTableView(value as "selection" | "dataset")}
          styles={{
            root: {
              height: 22,
              backgroundColor: "var(--graph-panel-input-bg)",
              border: "1px solid var(--graph-panel-border)",
              borderRadius: 6,
            },
            label: {
              fontSize: 9,
              padding: "2px 8px",
              color: "var(--graph-panel-text-dim)",
            },
            indicator: {
              borderRadius: 5,
              boxShadow: "none",
            },
          }}
        />
        <Text size="xs" style={panelTextDimStyle}>
          {rowCountLabel}
        </Text>
        <Tooltip label="Export table rows" position="bottom" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            radius="xl"
            onClick={() => void handleExport()}
            aria-label="Export graph data"
            styles={iconBtnStyles}
          >
            <Download size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Pagination
        size="xs"
        total={totalPages}
        value={safePage}
        onChange={setTablePage}
        className="table-pagination"
        styles={{
          control: {
            border: "none",
            backgroundColor: "transparent",
            color: "var(--graph-panel-text-dim)",
            minWidth: 20,
            height: 20,
            fontSize: 9,
          },
        }}
      />
    </div>
  );
}
