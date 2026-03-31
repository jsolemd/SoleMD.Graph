"use client";

import { useCallback, useMemo } from "react";
import { Loader, Stack, Table, Text } from "@mantine/core";
import { useGraphFocus } from "@/features/graph/cosmograph";
import { useGraphStore } from "@/features/graph/stores";
import { getTableColumnsForLayer, getColumnMetaForLayer } from "@/features/graph/lib/columns";
import { formatCellValue } from "@/features/graph/lib/helpers";
import { panelTableHeaderStyle, panelTextDimStyle } from "../../panels/PanelShell";
import type { GraphPointRecord, MapLayer } from "@/features/graph/types";

interface DataTableBodyProps {
  activeLayer: MapLayer;
  pageRows: GraphPointRecord[];
  startIdx: number;
  pageLoading: boolean;
  pageRefreshing: boolean;
  pageError: string | null;
  resolvedTableView: "selection" | "dataset";
}

export function DataTableBody({
  activeLayer,
  pageRows,
  startIdx,
  pageLoading,
  pageRefreshing,
  pageError,
  resolvedTableView,
}: DataTableBodyProps) {
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const { focusNode } = useGraphFocus();

  const tableColumns = useMemo(() => getTableColumnsForLayer(activeLayer), [activeLayer]);

  const handleRowClick = useCallback(
    (node: GraphPointRecord) => {
      if (resolvedTableView === "dataset") {
        focusNode(node, {
          zoomDuration: 250,
          selectPoint: true,
          addToSelection: false,
          expandLinks: false,
        });
        return;
      }

      focusNode(node, { zoomDuration: 250 });
    },
    [focusNode, resolvedTableView]
  );

  if (pageLoading) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-6">
        <Stack gap="xs" align="center">
          <Loader size="sm" color="var(--brand-accent)" />
          <Text size="sm" style={panelTextDimStyle}>
            Querying DuckDB for table rows…
          </Text>
        </Stack>
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
    <Stack gap="xs" h="100%">
      {pageRefreshing && (
        <Text size="xs" style={panelTextDimStyle}>
          Updating rows…
        </Text>
      )}
      <Table
        stickyHeader
        style={{ fontSize: "0.7rem" }}
        styles={{
          thead: { backgroundColor: "var(--graph-bg)" },
          th: { backgroundColor: "var(--graph-bg)", borderColor: "var(--graph-panel-border)" },
          td: { borderColor: "var(--graph-panel-border)" },
          tr: { backgroundColor: "transparent" },
        }}
      >
        <Table.Thead>
          <Table.Tr style={{ backgroundColor: "var(--graph-bg)" }}>
            <Table.Th style={{ ...panelTableHeaderStyle, width: 32 }}>#</Table.Th>
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
                <Table.Td style={{ fontSize: "0.7rem", color: "var(--mode-accent)" }}>
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
    </Stack>
  );
}
