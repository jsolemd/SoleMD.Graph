"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  Table,
  Text,
  Pagination,
  SegmentedControl,
  Group,
} from "@mantine/core";
import { useCosmograph } from "@cosmograph/react";
import { motion } from "framer-motion";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { panelTableHeaderStyle, panelTextDimStyle } from "../panels/PanelShell";
import { smooth } from "@/lib/motion";
import { getTableColumnsForLayer, getColumnMetaForLayer } from "@/features/graph/lib/columns";
import { useDragResize } from "@/features/graph/hooks/use-drag-resize";
import type { GraphNode } from "@/features/graph/types";
import { clamp } from "@/lib/helpers";
import { formatCellValue } from "@/features/graph/lib/helpers";

export function DataTable({ nodes }: { nodes: GraphNode[] }) {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const tablePage = useDashboardStore((s) => s.tablePage);
  const tablePageSize = useDashboardStore((s) => s.tablePageSize);
  const tableView = useDashboardStore((s) => s.tableView);
  const tableColumns = useMemo(() => getTableColumnsForLayer(activeLayer), [activeLayer]);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const currentPointIndices = useDashboardStore((s) => s.currentPointIndices);
  const highlightedPointIndices = useDashboardStore(
    (s) => s.highlightedPointIndices
  );
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const setTablePage = useDashboardStore((s) => s.setTablePage);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const setTableHeight = useDashboardStore((s) => s.setTableHeight);

  const selectedNode = useGraphStore((s) => s.selectedNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const { cosmograph } = useCosmograph();

  const currentNodes = useMemo(() => {
    if (currentPointIndices === null) {
      return nodes;
    }

    const currentSet = new Set(currentPointIndices);
    return nodes.filter((node) => currentSet.has(node.index));
  }, [currentPointIndices, nodes]);

  const selectedNodes = useMemo(() => {
    if (selectedPointIndices.length > 0) {
      const selectedSet = new Set(selectedPointIndices);
      return nodes.filter((node) => selectedSet.has(node.index));
    }
    return [];
  }, [nodes, selectedPointIndices]);

  const resolvedTableView =
    tableView === "selected" && selectedPointIndices.length === 0
      ? "current"
      : tableView;
  const displayedNodes =
    resolvedTableView === "current" ? currentNodes : selectedNodes;
  const selectedIndexSet = useMemo(
    () => new Set(selectedPointIndices),
    [selectedPointIndices]
  );
  const highlightedIndexSet = useMemo(
    () => new Set(highlightedPointIndices),
    [highlightedPointIndices]
  );

  const totalPages = Math.max(1, Math.ceil(displayedNodes.length / tablePageSize));
  const safePage = clamp(tablePage, 1, totalPages);
  const startIdx = (safePage - 1) * tablePageSize;
  const pageNodes = displayedNodes.slice(startIdx, startIdx + tablePageSize);

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

  const handleRowClick = useCallback(
    (node: GraphNode) => {
      selectNode(node);
      cosmograph?.setFocusedPoint(node.index);
      cosmograph?.zoomToPoint(node.index, 250);
    },
    [cosmograph, selectNode]
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
      {/* Drag handle */}
      <div
        className="flex h-3 cursor-row-resize items-center justify-center transition-colors hover:bg-[var(--interactive-hover)]"
        onMouseDown={handleDragStart}
      >
        <div
          className="h-1 w-10 rounded-full"
          style={{ backgroundColor: "var(--graph-panel-text-dim)" }}
        />
      </div>

      {/* Toolbar */}
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
            {displayedNodes.length} of {nodes.length} rows
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

      {/* Table */}
      <div className="flex-1 overflow-auto px-2">
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
            {pageNodes.map((node, i) => {
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
      </div>
    </motion.div>
  );
}
