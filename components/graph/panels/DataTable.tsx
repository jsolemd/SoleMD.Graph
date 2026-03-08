"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  Table,
  Text,
  Pagination,
  SegmentedControl,
  Group,
} from "@mantine/core";
import { motion } from "framer-motion";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { useGraphStore } from "@/lib/graph/store";
import { TABLE_COLUMNS, getColumnMeta } from "@/lib/graph/columns";
import type { ChunkNode } from "@/lib/graph/types";
import { clamp } from "@/lib/helpers";

export function DataTable({ nodes }: { nodes: ChunkNode[] }) {
  const tablePage = useDashboardStore((s) => s.tablePage);
  const tablePageSize = useDashboardStore((s) => s.tablePageSize);
  const tableShowAllPoints = useDashboardStore((s) => s.tableShowAllPoints);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const setTablePage = useDashboardStore((s) => s.setTablePage);
  const setTableShowAllPoints = useDashboardStore((s) => s.setTableShowAllPoints);
  const setTableHeight = useDashboardStore((s) => s.setTableHeight);

  const selectedNode = useGraphStore((s) => s.selectedNode);
  const selectNode = useGraphStore((s) => s.selectNode);

  const displayedNodes = useMemo(() => {
    if (tableShowAllPoints) return nodes;
    if (!selectedNode) return [];
    return nodes.filter((n) => n.id === selectedNode.id);
  }, [nodes, tableShowAllPoints, selectedNode]);

  const totalPages = Math.max(1, Math.ceil(displayedNodes.length / tablePageSize));
  const safePage = clamp(tablePage, 1, totalPages);
  const startIdx = (safePage - 1) * tablePageSize;
  const pageNodes = displayedNodes.slice(startIdx, startIdx + tablePageSize);

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: tableHeight };

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        setTableHeight(clamp(dragRef.current.startHeight + delta, 120, 600));
      };

      const handleUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [tableHeight, setTableHeight]
  );

  const formatCell = (node: ChunkNode, key: keyof ChunkNode) => {
    const val = node[key];
    if (val == null) return "—";
    if (typeof val === "number") {
      if (key === "clusterProbability" || key === "outlierScore") return val.toFixed(3);
      if (key === "x" || key === "y") return val.toFixed(2);
      return String(val);
    }
    if (typeof val === "string" && val.length > 40) return val.slice(0, 37) + "...";
    return String(val);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col"
      style={{
        height: tableHeight,
        backgroundColor: "var(--graph-panel-bg)",
        borderTop: "1px solid var(--graph-panel-border)",
      }}
    >
      {/* Drag handle */}
      <div
        className="flex h-2 cursor-row-resize items-center justify-center"
        onMouseDown={handleDragStart}
      >
        <div
          className="h-0.5 w-8 rounded-full"
          style={{ backgroundColor: "var(--graph-panel-text-dim)" }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            data={[
              { label: "All Points", value: "all" },
              { label: "Selected", value: "selected" },
            ]}
            value={tableShowAllPoints ? "all" : "selected"}
            onChange={(v) => setTableShowAllPoints(v === "all")}
          />
          <Text size="xs" style={{ color: "var(--graph-panel-text-dim)" }}>
            {displayedNodes.length} rows
          </Text>
        </Group>
        <Pagination
          size="xs"
          total={totalPages}
          value={safePage}
          onChange={setTablePage}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-2">
        <Table
          highlightOnHover
          striped
          stickyHeader
          style={{ fontSize: "0.75rem" }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 40, fontSize: "0.7rem" }}>#</Table.Th>
              {TABLE_COLUMNS.map((key) => {
                const meta = getColumnMeta(key);
                return (
                  <Table.Th key={key} style={{ fontSize: "0.7rem" }}>
                    {meta?.label ?? key}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pageNodes.map((node, i) => (
              <Table.Tr
                key={node.id}
                onClick={() => selectNode(node)}
                style={{
                  cursor: "pointer",
                  backgroundColor:
                    selectedNode?.id === node.id
                      ? "var(--graph-panel-active)"
                      : undefined,
                }}
              >
                <Table.Td style={{ fontSize: "0.7rem", color: "var(--graph-panel-text-dim)" }}>
                  {startIdx + i + 1}
                </Table.Td>
                {TABLE_COLUMNS.map((key) => (
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
                    {formatCell(node, key)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </motion.div>
  );
}
