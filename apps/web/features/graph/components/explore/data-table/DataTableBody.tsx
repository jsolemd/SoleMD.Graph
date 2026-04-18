"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Table, Text } from "@mantine/core";
import { useGraphFocus } from "@/features/graph/cosmograph";
import { useGraphStore } from "@/features/graph/stores";
import { getTableColumnsForLayer, getColumnMetaForLayer } from "@/features/graph/lib/columns";
import { formatCellValue } from "@/features/graph/lib/helpers";
import { panelScaledPx, panelTableHeaderStyle, panelTextDimStyle, PanelInlineLoader } from "../../panels/PanelShell";
import type { GraphPointRecord, MapLayer } from "@/features/graph/types";

interface DataTableBodyProps {
  activeLayer: MapLayer;
  pageRows: GraphPointRecord[];
  startIdx: number;
  pageLoading: boolean;
  pageError: string | null;
  resolvedTableView: "selection" | "dataset";
}

export function DataTableBody({
  activeLayer,
  pageRows,
  startIdx,
  pageLoading,
  pageError,
  resolvedTableView,
}: DataTableBodyProps) {
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const { focusNode } = useGraphFocus();
  const focusedRowRef = useRef<HTMLTableRowElement>(null);

  const tableColumns = useMemo(() => getTableColumnsForLayer(activeLayer), [activeLayer]);

  // Scroll the focused row into view when the selected node changes
  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedNode?.id]);

  const handleRowClick = useCallback(
    (node: GraphPointRecord) => {
      // Focus + zoom only — never trigger Cosmograph's selectPoint here.
      // Selection is for multi-select tools (lasso, rect, filters), not
      // single-row navigation.  selectNode() inside focusNode already
      // sets the detail panel highlight and table row accent.
      focusNode(node, { zoomDuration: 250 });
    },
    [focusNode]
  );

  if (pageLoading) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6">
        <PanelInlineLoader label="Loading rows…" />
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6">
        <Text size="sm" style={panelTextDimStyle}>
          {pageError}
        </Text>
      </div>
    );
  }

  if (pageRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6">
        <Text size="sm" style={panelTextDimStyle}>
          {resolvedTableView === "selection"
            ? "No rows in the current selection."
            : "No rows available."}
        </Text>
      </div>
    );
  }

  return (
    <Table
      stickyHeader
      style={{ fontSize: panelScaledPx(10) }}
      styles={{
        thead: { backgroundColor: "var(--graph-bg)" },
        th: { backgroundColor: "var(--graph-bg)", borderColor: "var(--graph-panel-border)", padding: "4px 6px" },
        td: { borderColor: "var(--graph-panel-border)", padding: "3px 6px" },
        tr: { backgroundColor: "transparent" },
      }}
    >
      <Table.Thead>
        <Table.Tr style={{ backgroundColor: "var(--graph-bg)" }}>
          <Table.Th style={{ ...panelTableHeaderStyle, width: 28 }}>#</Table.Th>
          {tableColumns.map((key) => {
            const meta = getColumnMetaForLayer(key, activeLayer);
            return (
              <Table.Th key={key} style={panelTableHeaderStyle}>
                {meta?.label ?? key}
              </Table.Th>
            );
          })}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {pageRows.map((node, i) => {
          const isFocused = selectedNode?.id === node.id;
          const showSelectedState = isFocused;

          return (
            <Table.Tr
              key={node.id}
              ref={isFocused ? focusedRowRef : undefined}
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
                transition: "background-color 80ms ease-out",
                borderLeft: showSelectedState
                  ? "3px solid var(--mode-accent)"
                  : "3px solid transparent",
                backgroundColor:
                  showSelectedState
                    ? "var(--mode-accent-subtle)"
                    : undefined,
              }}
            >
              <Table.Td style={{ color: "var(--mode-accent)" }}>
                {startIdx + i + 1}
              </Table.Td>
              {tableColumns.map((key) => (
                <Table.Td
                  key={key}
                  style={{
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
  );
}
