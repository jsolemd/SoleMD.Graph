"use client";

import { Table, Text } from "@mantine/core";
import { formatCellValue } from "@/features/graph/lib/helpers";
import {
  insetTableFrameStyle,
  panelScaledPx,
  panelTextDimStyle,
} from "../../panels/PanelShell";
import type { GraphQueryResult } from "@solemd/graph";

export function QueryResultTable({ result }: { result: GraphQueryResult }) {
  if (result.columns.length === 0) {
    return (
      <Text size="xs" style={panelTextDimStyle}>
        Query completed with no tabular output.
      </Text>
    );
  }

  return (
    <div
      style={{
        ...insetTableFrameStyle,
        maxHeight: 280,
      }}
    >
      <Table.ScrollContainer
        minWidth={200}
        style={{ maxHeight: "100%", overflow: "auto" }}
      >
        <Table
          stickyHeader
          styles={{
            table: { borderColor: "transparent" },
            thead: { backgroundColor: "var(--graph-panel-bg)" },
            th: {
              backgroundColor: "var(--graph-panel-bg)",
              borderColor: "var(--graph-panel-border)",
              fontSize: panelScaledPx(9),
              fontWeight: 500,
              textTransform: "none",
              letterSpacing: 0,
              color: "var(--graph-panel-text-dim)",
              fontFamily: "var(--font-mono)",
              padding: `${panelScaledPx(4)} ${panelScaledPx(8)}`,
              lineHeight: panelScaledPx(13),
              whiteSpace: "nowrap",
            },
            td: {
              borderColor: "var(--graph-panel-border)",
              fontSize: panelScaledPx(10),
              padding: `${panelScaledPx(4)} ${panelScaledPx(8)}`,
              lineHeight: panelScaledPx(14),
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
    </div>
  );
}
