"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table,
  Text,
  Pagination,
  SegmentedControl,
  Group,
  Loader,
  Stack,
} from "@mantine/core";
import { useGraphCamera, useGraphSelection } from "@/features/graph/cosmograph";
import { motion } from "framer-motion";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { panelTableHeaderStyle, panelTextDimStyle } from "../panels/PanelShell";
import { smooth } from "@/lib/motion";
import { getTableColumnsForLayer, getColumnMetaForLayer } from "@/features/graph/lib/columns";
import { useDragResize } from "@/features/graph/hooks/use-drag-resize";
import type { GraphBundleQueries, GraphNode } from "@/features/graph/types";
import { clamp } from "@/lib/helpers";
import { formatCellValue } from "@/features/graph/lib/helpers";

export function DataTable({ queries }: { queries: GraphBundleQueries }) {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const tablePage = useDashboardStore((s) => s.tablePage);
  const tablePageSize = useDashboardStore((s) => s.tablePageSize);
  const tableView = useDashboardStore((s) => s.tableView);
  const tableColumns = useMemo(() => getTableColumnsForLayer(activeLayer), [activeLayer]);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const currentPointIndices = useDashboardStore((s) => s.currentPointIndices);
  const currentPointScopeSql = useDashboardStore((s) => s.currentPointScopeSql);
  const highlightedPointIndices = useDashboardStore(
    (s) => s.highlightedPointIndices
  );
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const setTablePage = useDashboardStore((s) => s.setTablePage);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const setTableHeight = useDashboardStore((s) => s.setTableHeight);

  const selectedNode = useGraphStore((s) => s.selectedNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const { zoomToPoint } = useGraphCamera();
  const { setFocusedPoint } = useGraphSelection();

  const [pageRows, setPageRows] = useState<GraphNode[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const resolvedTableView =
    tableView === "selected" && selectedPointIndices.length === 0
      ? "current"
      : tableView;
  const selectedIndexSet = useMemo(
    () => new Set(selectedPointIndices),
    [selectedPointIndices]
  );
  const highlightedIndexSet = useMemo(
    () => new Set(highlightedPointIndices),
    [highlightedPointIndices]
  );

  const totalPages = Math.max(1, Math.ceil(totalRows / tablePageSize));
  const safePage = clamp(tablePage, 1, totalPages);
  const startIdx = (safePage - 1) * tablePageSize;
  const currentScopeKey = useMemo(
    () =>
      currentPointScopeSql ?? {
        currentCount: currentPointIndices?.length ?? null,
        currentFirst: currentPointIndices?.[0] ?? null,
        currentLast:
          currentPointIndices && currentPointIndices.length > 0
            ? currentPointIndices[currentPointIndices.length - 1]
            : null,
      },
    [currentPointIndices, currentPointScopeSql],
  );
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        resolvedTableView,
        safePage,
        tablePageSize,
        currentScope: currentScopeKey,
        selectedCount: selectedPointIndices.length,
        selectedFirst: selectedPointIndices[0] ?? null,
        selectedLast:
          selectedPointIndices.length > 0
            ? selectedPointIndices[selectedPointIndices.length - 1]
            : null,
      }),
    [
      activeLayer,
      currentScopeKey,
      resolvedTableView,
      safePage,
      selectedPointIndices,
      tablePageSize,
    ]
  );
  const pageLoading = lastResolvedKey !== requestKey;

  const { onMouseDown: handleDragStart } = useDragResize({
    height: tableHeight,
    min: 120,
    max: 600,
    onResize: setTableHeight,
  });

  useEffect(() => {
    if (tablePage !== safePage) {
      setTablePage(safePage);
    }
  }, [safePage, setTablePage, tablePage]);

  useEffect(() => {
    if (tableView === "selected" && selectedPointIndices.length === 0) {
      setTableView("current");
    }
  }, [selectedPointIndices.length, setTableView, tableView]);

  useEffect(() => {
    let cancelled = false;

    queries
      .getTablePage({
        layer: activeLayer,
        view: resolvedTableView,
        page: safePage,
        pageSize: tablePageSize,
        currentPointIndices,
        currentPointScopeSql,
        selectedPointIndices,
      })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setPageRows(result.rows);
        setTotalRows(result.totalRows);
        setLastResolvedKey(requestKey);
        setPageError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setPageRows([]);
        setTotalRows(0);
        setLastResolvedKey(requestKey);
        setPageError(
          error instanceof Error ? error.message : "Failed to load table rows"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeLayer,
    currentPointIndices,
    currentPointScopeSql,
    queries,
    resolvedTableView,
    requestKey,
    safePage,
    selectedPointIndices,
    tablePageSize,
  ]);

  const handleRowClick = useCallback(
    (node: GraphNode) => {
      selectNode(node);
      if (activeLayer !== "geo") {
        setFocusedPoint(node.index);
        zoomToPoint(node.index, 250);
      }
    },
    [activeLayer, selectNode, setFocusedPoint, zoomToPoint]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={smooth}
      className="absolute left-0 right-0 z-20 flex flex-col"
      style={{
        bottom: showTimeline ? 44 : 0,
        height: tableHeight,
        backgroundColor: "var(--graph-bg)",
      }}
    >
      <div
        className="flex h-3 cursor-row-resize items-center justify-center transition-colors hover:bg-[var(--interactive-hover)]"
        onMouseDown={handleDragStart}
      >
        <div
          className="h-1 w-10 rounded-full"
          style={{ backgroundColor: "var(--graph-panel-text-dim)" }}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-1.5">
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            data={[
              { label: "Current", value: "current" },
              {
                label: "Selected",
                value: "selected",
                disabled: selectedPointIndices.length === 0,
              },
            ]}
            value={resolvedTableView}
            onChange={(value) => setTableView(value as typeof tableView)}
          />
          <Text size="xs" style={panelTextDimStyle}>
            {pageLoading ? "Loading rows…" : `${totalRows.toLocaleString()} rows`}
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

      <div className="flex-1 overflow-auto px-2">
        {pageLoading ? (
          <div className="flex h-full items-center justify-center px-4 py-6">
            <Stack gap="xs" align="center">
              <Loader size="sm" color="var(--brand-accent)" />
              <Text size="sm" style={panelTextDimStyle}>
                Querying DuckDB for table rows…
              </Text>
            </Stack>
          </div>
        ) : pageError ? (
          <div className="flex h-full items-center justify-center px-4 py-6">
            <Text size="sm" style={panelTextDimStyle}>
              {pageError}
            </Text>
          </div>
        ) : (
          <Table
            stickyHeader
            style={{ fontSize: "0.75rem" }}
            styles={{
              table: { borderColor: "transparent" },
              thead: { backgroundColor: "var(--graph-bg)" },
              th: { backgroundColor: "var(--graph-bg)", borderColor: "var(--graph-panel-border)" },
              td: { borderColor: "var(--graph-panel-border)" },
              tr: { backgroundColor: "transparent" },
            }}
          >
            <Table.Thead>
              <Table.Tr
                style={{
                  backgroundColor: "var(--graph-bg)",
                }}
              >
                <Table.Th
                  style={{ ...panelTableHeaderStyle, width: 40 }}
                >
                  #
                </Table.Th>
                {tableColumns.map((key) => {
                  const meta = getColumnMetaForLayer(key, activeLayer);
                  return (
                    <Table.Th
                      key={key}
                      style={panelTableHeaderStyle}
                    >
                      {meta?.label ?? key}
                    </Table.Th>
                  );
                })}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pageRows.map((node, i) => {
                const isIntentSelected = selectedIndexSet.has(node.index);
                const isHighlighted = highlightedIndexSet.has(node.index);
                const isFocused = selectedNode?.id === node.id;
                const showSelectedState =
                  resolvedTableView === "selected"
                    ? isIntentSelected || isFocused
                    : isHighlighted || isFocused;

                return (
                  <Table.Tr
                    key={node.id}
                    tabIndex={0}
                    aria-selected={showSelectedState}
                    onClick={() => handleRowClick(node)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(node);
                      }
                    }}
                    style={{
                      cursor: "pointer",
                      borderLeft: showSelectedState
                        ? "3px solid var(--mode-accent)"
                        : "3px solid transparent",
                      backgroundColor:
                        isHighlighted || isFocused
                          ? "var(--mode-accent-subtle)"
                          : undefined,
                    }}
                  >
                    <Table.Td
                      style={{ fontSize: "0.7rem", color: "var(--mode-accent)" }}
                    >
                      {startIdx + i + 1}
                    </Table.Td>
                    {tableColumns.map((key) => (
                      <Table.Td
                        key={key}
                        style={{
                          fontSize: "0.7rem",
                          maxWidth: key === "paperTitle" ? 200 : 120,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--graph-panel-text)",
                        }}
                      >
                        {formatCellValue(
                          (node as unknown as Record<string, unknown>)[key],
                          { columnKey: key, truncate: 40 }
                        )}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </div>
    </motion.div>
  );
}
