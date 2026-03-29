"use client";

import { Table, Text } from "@mantine/core";
import { formatCellValue } from "@/features/graph/lib/helpers";
import { panelTableHeaderStyle, panelTextDimStyle } from "../../panels/PanelShell";
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
        borderRadius: 12,
        maxHeight: 320,
        overflow: "auto",
      }}
    >
      <Table
        stickyHeader
        style={{ fontSize: "0.75rem" }}
        styles={{
          table: { borderColor: "transparent" },
          thead: { backgroundColor: "var(--graph-panel-bg)" },
          th: {
            backgroundColor: "var(--graph-panel-bg)",
            borderColor: "var(--graph-panel-border)",
          },
          td: { borderColor: "var(--graph-panel-border)" },
          tr: { backgroundColor: "transparent" },
        }}
      >
        <Table.Thead>
          <Table.Tr>
            {result.columns.map((column) => (
              <Table.Th key={column} style={panelTableHeaderStyle}>
                {column}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {result.rows.map((row, index) => (
            <Table.Tr key={index}>
              {result.columns.map((column) => (
                <Table.Td
                  key={`${index}:${column}`}
                  style={{
                    ...panelTextDimStyle,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {formatCellValue(row[column], { nullLabel: "NULL" })}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
