"use client";

import { useState } from "react";
import { Badge, Code, Collapse, Group, Text } from "@mantine/core";
import { panelTextMutedStyle, panelTextDimStyle } from "../../panels/PanelShell";
import type { GraphQueryResult } from "@/features/graph/types";
import { QueryResultTable } from "./QueryResultTable";

export function QueryResult({ result }: { result: GraphQueryResult }) {
  const [showSql, setShowSql] = useState(false);

  return (
    <>
      <Group justify="space-between" align="center">
        <Text size="xs" fw={600} style={panelTextMutedStyle}>
          Result
        </Text>
        <Badge
          variant="light"
          size="sm"
          styles={{
            root: {
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
              color: "var(--graph-panel-text)",
            },
          }}
        >
          {result.rowCount} rows in {result.durationMs.toFixed(1)} ms
        </Badge>
      </Group>

      {result.appliedLimit != null && (
        <Text style={panelTextDimStyle}>
          SELECT/WITH queries are wrapped with LIMIT {result.appliedLimit} to
          keep the browser responsive.
        </Text>
      )}

      <Text
        size="xs"
        className="cursor-pointer"
        style={{ color: "var(--mode-accent)" }}
        onClick={() => setShowSql((v) => !v)}
      >
        {showSql ? "Hide executed SQL" : "Show executed SQL"}
      </Text>
      <Collapse in={showSql}>
        <Code
          block
          style={{
            backgroundColor: "var(--graph-panel-input-bg)",
            border: "1px solid var(--graph-panel-border)",
            color: "var(--graph-panel-text-dim)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {result.executedSql}
        </Code>
      </Collapse>

      <QueryResultTable result={result} />
    </>
  );
}
