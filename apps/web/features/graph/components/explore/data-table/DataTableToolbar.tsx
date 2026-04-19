"use client";

import { ActionIcon, Group, Pagination, SegmentedControl, Text, Tooltip } from "@mantine/core";
import { Database, Download } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphLayer } from "@solemd/graph";
import {
  compactSegmentedControlStyles,
  panelIconBtnStyles,
  panelScaledPx,
  panelTextDimStyle,
  PANEL_ACCENT,
  PanelInlineLoader,
} from "../../panels/PanelShell";
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
  activeLayer: GraphLayer;
  currentPointScopeSql: string | null;
}

interface DataTableToolbarViewProps {
  resolvedTableView: "selection" | "dataset";
  selectionAvailable: boolean;
  totalPages: number;
  safePage: number;
  pageLoading: boolean;
  pageRefreshing: boolean;
  totalRows: number;
  isMobile: boolean;
  queryPanelOpen: boolean;
  onSetTableView: (value: "selection" | "dataset") => void;
  onSetTablePage: (value: number) => void;
  onToggleQueryPanel: () => void;
  onExport: () => void;
}

export function DataTableToolbarView({
  resolvedTableView,
  selectionAvailable,
  totalPages,
  safePage,
  pageLoading,
  pageRefreshing,
  totalRows,
  isMobile,
  queryPanelOpen,
  onSetTableView,
  onSetTablePage,
  onToggleQueryPanel,
  onExport,
}: DataTableToolbarViewProps) {
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
          onChange={(value) => onSetTableView(value as "selection" | "dataset")}
          styles={compactSegmentedControlStyles}
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
            onClick={onToggleQueryPanel}
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
            onClick={onExport}
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
          onChange={onSetTablePage}
          className="table-pagination"
          styles={{
            control: {
              border: "none",
              backgroundColor: "transparent",
              color: "var(--graph-panel-text-dim)",
              minWidth: 18,
              height: 18,
              fontSize: panelScaledPx(9),
            },
          }}
        />
      </Group>
    </div>
  );
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

  const handleToggleQueryPanel = () => {
    if (!isMobile) {
      togglePanel("query");
      return;
    }

    if (queryPanelOpen) {
      closePanel("query");
      return;
    }

    openOnlyPanel("query");
  };

  return (
    <DataTableToolbarView
      resolvedTableView={resolvedTableView}
      selectionAvailable={selectionAvailable}
      totalPages={totalPages}
      safePage={safePage}
      pageLoading={pageLoading}
      pageRefreshing={pageRefreshing}
      totalRows={totalRows}
      isMobile={isMobile}
      queryPanelOpen={queryPanelOpen}
      onSetTableView={setTableView}
      onSetTablePage={setTablePage}
      onToggleQueryPanel={handleToggleQueryPanel}
      onExport={() => { void handleExport(); }}
    />
  );
}
