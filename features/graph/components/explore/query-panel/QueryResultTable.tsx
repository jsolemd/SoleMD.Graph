"use client";

import { Table, Text } from "@mantine/core";
import { formatCellValue } from "@/features/graph/lib/helpers";
import { panelTextDimStyle } from "../../panels/PanelShell";
import type { GraphQueryResult } from "@/features/graph/types";

export function QueryResultTable({ result }: { result: GraphQueryResult }) {
  if (result.columns.length === 0) {
    return (
      <Text size="xs" style={panelTextDimStyle}>
        Query completed with no tabular output.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer
      minWidth={200}
      style={{
        border: "1px solid var(--graph-panel-border)",
        borderRadius: 8,
        maxHeight: 280,
        overflow: "auto",
      }}
    >
      <Table
        stickyHeader
        styles={{
          table: { borderColor: "transparent" },
          thead: { backgroundColor: "var(--graph-panel-bg)" },
          th: {
            backgroundColor: "var(--graph-panel-bg)",
            borderColor: "var(--graph-panel-border)",
            fontSize: 9,
            fontWeight: 500,
            textTransform: "none",
            letterSpacing: 0,
            color: "var(--graph-panel-text-dim)",
            fontFamily: "var(--font-mono)",
            padding: "4px 8px",
            lineHeight: "13px",
            whiteSpace: "nowrap",
          },
          td: {
            borderColor: "var(--graph-panel-border)",
            fontSize: 10,
            padding: "4px 8px",
            lineHeight: "14px",
            color: "var(--graph-panel-text)",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
          tr: { backgroundColor: "transparent" },
        }}
      >
        <Table.Thead>
          <Table.Tr>
            {result.columns.map((column) => (
              <Table.Th key={column}>{column}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {result.rows.map((row, index) => (
            <Table.Tr key={index}>
              {result.columns.map((column) => {
                const rendered = formatCellValue(row[column], { nullLabel: "NULL" });
                return (
                  <Table.Td key={`${index}:${column}`} title={rendered}>
                    {rendered}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
