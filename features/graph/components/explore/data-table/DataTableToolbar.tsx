"use client";

import { ActionIcon, Group, Pagination, SegmentedControl, Text, Tooltip } from "@mantine/core";
import { Database, Download } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, MapLayer } from "@/features/graph/types";
import { panelIconBtnStyles, panelTextDimStyle, PANEL_ACCENT, PanelInlineLoader } from "../../panels/PanelShell";
import { formatNumber } from "@/lib/helpers";
import { useShellVariantContext } from "../../shell/ShellVariantContext";

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
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const setTablePage = useDashboardStore((s) => s.setTablePage);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const openOnlyPanel = useDashboardStore((s) => s.openOnlyPanel);
  const closePanel = useDashboardStore((s) => s.closePanel);
  const queryPanelOpen = useDashboardStore((s) => s.openPanels.query);

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
    <div className="flex items-center justify-between px-2.5 pb-1">
      <Group gap={6}>
        <SegmentedControl
          size="xs"
          color={PANEL_ACCENT}
          className="table-scope-toggle"
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
              backgroundColor: "var(--graph-panel-input-bg)",
              border: "1px solid var(--graph-panel-border)",
              borderRadius: 6,
              padding: 2,
              gap: 2,
            },
            label: {
              fontSize: 9,
              lineHeight: 1,
              padding: "3px 6px",
            },
            indicator: {
              borderRadius: 4,
              boxShadow: "none",
            },
          }}
        />
        {!pageLoading && (
          <Text style={panelTextDimStyle}>
            {formatNumber(totalRows)}
          </Text>
        )}
      </Group>
      <Group gap={4}>
        {(pageLoading || pageRefreshing) && <PanelInlineLoader />}
        <Tooltip
          label={queryPanelOpen ? "Close SQL Explorer" : "Open SQL Explorer"}
          position="bottom"
          withArrow
          disabled={isMobile}
        >
          <ActionIcon
            variant="transparent"
            size={isMobile ? 28 : 18}
            radius="xl"
            onClick={() => {
              if (!isMobile) {
                togglePanel("query");
                return;
              }

              if (queryPanelOpen) {
                closePanel("query");
                return;
              }

              openOnlyPanel("query");
            }}
            aria-label={queryPanelOpen ? "Close SQL Explorer" : "Open SQL Explorer"}
            aria-pressed={queryPanelOpen}
            className="panel-icon-btn"
            styles={panelIconBtnStyles}
          >
            <Database size={11} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Export CSV" position="bottom" withArrow disabled={isMobile}>
          <ActionIcon
            variant="transparent"
            size={isMobile ? 28 : 18}
            radius="xl"
            onClick={() => void handleExport()}
            aria-label="Export graph data"
            className="panel-icon-btn"
            styles={panelIconBtnStyles}
          >
            <Download size={11} />
          </ActionIcon>
        </Tooltip>
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
              minWidth: 18,
              height: 18,
              fontSize: 9,
            },
          }}
        />
      </Group>
    </div>
  );
}
