"use client";

import { ActionIcon, Group, Pagination, SegmentedControl, Text, Tooltip } from "@mantine/core";
import { Download } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, MapLayer } from "@/features/graph/types";
import { panelTextDimStyle } from "../../panels/PanelShell";
import { iconBtnStyles } from "../../panels/PanelShell";

interface DataTableToolbarProps {
  resolvedTableView: string;
  selectedCount: number;
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
  selectedCount,
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
  const rowCountLabel = pageLoading
    ? "Loading rows..."
    : pageRefreshing
      ? `Updating... ${totalRows.toLocaleString()} rows`
      : `${totalRows.toLocaleString()} rows`;

  const handleExport = async () => {
    const csv = await queries.exportTableCsv({
      layer: activeLayer,
      view: resolvedTableView as "current" | "selected",
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
    <div className="flex items-center justify-between px-4 py-1.5">
      <Group gap="sm">
        <SegmentedControl
          size="xs"
          data={[
            { label: "Current", value: "current" },
            {
              label: "Selected",
              value: "selected",
              disabled: selectedCount === 0,
            },
          ]}
          value={resolvedTableView}
          onChange={(value) => setTableView(value as "current" | "selected")}
        />
        <Text size="xs" style={panelTextDimStyle}>
          {rowCountLabel}
        </Text>
        <Tooltip label="Export visible graph data" position="bottom" withArrow>
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
          },
        }}
      />
    </div>
  );
}
