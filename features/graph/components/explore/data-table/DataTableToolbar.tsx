"use client";

import { Group, Pagination, SegmentedControl, Text } from "@mantine/core";
import { useDashboardStore } from "@/features/graph/stores";
import { panelTextDimStyle } from "../../panels/PanelShell";

interface DataTableToolbarProps {
  resolvedTableView: string;
  selectedCount: number;
  totalPages: number;
  safePage: number;
  pageLoading: boolean;
  pageRefreshing: boolean;
  totalRows: number;
}

export function DataTableToolbar({
  resolvedTableView,
  selectedCount,
  totalPages,
  safePage,
  pageLoading,
  pageRefreshing,
  totalRows,
}: DataTableToolbarProps) {
  const setTablePage = useDashboardStore((s) => s.setTablePage);
  const setTableView = useDashboardStore((s) => s.setTableView);

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
          {pageLoading
            ? "Loading rows\u2026"
            : pageRefreshing
              ? `Updating\u2026 ${totalRows.toLocaleString()} rows`
              : `${totalRows.toLocaleString()} rows`}
        </Text>
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
