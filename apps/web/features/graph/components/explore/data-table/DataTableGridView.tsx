"use client";

import { useEffect, useMemo, useRef } from "react";
import { Table, Text } from "@mantine/core";
import { getColumnMetaForLayer, getTableColumnsForLayer } from "@/features/graph/lib/columns";
import { formatCellValue } from "@/features/graph/lib/helpers";
import {
  panelScaledPx,
  panelTableHeaderStyle,
  panelTextDimStyle,
  PanelInlineLoader,
} from "../../panels/PanelShell";
import type { GraphLayer, GraphPointRecord } from "@solemd/graph";

export interface DataTableBodyProps {
  activeLayer: GraphLayer;
  pageRows: GraphPointRecord[];
  startIdx: number;
  pageLoading: boolean;
  pageError: string | null;
  resolvedTableView: "selection" | "dataset";
}

export interface DataTableGridViewProps extends DataTableBodyProps {
  selectedNodeId?: string | null;
  onRowActivate?: (node: GraphPointRecord) => void;
}

export function DataTableGridView({
  activeLayer,
  pageRows,
  startIdx,
  pageLoading,
  pageError,
  resolvedTableView,
  selectedNodeId,
  onRowActivate,
}: DataTableGridViewProps) {
  const focusedRowRef = useRef<HTMLTableRowElement>(null);

  const tableColumns = useMemo(() => getTableColumnsForLayer(activeLayer), [activeLayer]);

  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedNodeId]);

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
        thead: { backgroundColor: "var(--background)" },
        th: {
          backgroundColor: "var(--background)",
          borderColor: "var(--graph-panel-border)",
          padding: "4px 6px",
        },
        td: { borderColor: "var(--graph-panel-border)", padding: "3px 6px" },
        tr: { backgroundColor: "transparent" },
      }}
    >
      <Table.Thead>
        <Table.Tr style={{ backgroundColor: "var(--background)" }}>
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
          const isFocused = selectedNodeId === node.id;

          return (
            <Table.Tr
              key={node.id}
              ref={isFocused ? focusedRowRef : undefined}
              tabIndex={0}
              aria-selected={isFocused}
              onClick={() => onRowActivate?.(node)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowActivate?.(node);
                }
              }}
              style={{
                cursor: "pointer",
                transition: "background-color 80ms ease-out",
                borderLeft: isFocused
                  ? "3px solid var(--mode-accent)"
                  : "3px solid transparent",
                backgroundColor: isFocused ? "var(--mode-accent-subtle)" : undefined,
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
                  {formatCellValue((node as unknown as Record<string, unknown>)[key], {
                    columnKey: key,
                    truncate: 40,
                  })}
                </Table.Td>
              ))}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
