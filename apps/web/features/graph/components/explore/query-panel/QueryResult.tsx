"use client";

import { useState } from "react";
import { Button, Code, Collapse, Group, Stack, Text } from "@mantine/core";
import { ChevronDown } from "lucide-react";
import {
  insetCodeBlockStyle,
  PANEL_ACCENT,
  panelTextDimStyle,
} from "../../panels/PanelShell";
import type { GraphQueryResult } from "@solemd/graph";
import { QueryResultTable } from "./QueryResultTable";

export function QueryResult({ result }: { result: GraphQueryResult }) {
  const [showSql, setShowSql] = useState(false);

  return (
    <Stack gap={6}>
      <Group justify="space-between" align="center" gap="xs">
        <Text style={panelTextDimStyle}>
          {result.rowCount} rows · {result.durationMs.toFixed(1)} ms
          {result.appliedLimit != null && ` · limit ${result.appliedLimit}`}
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          color={PANEL_ACCENT}
          rightSection={
            <ChevronDown
              size={12}
              style={{
                transform: showSql ? "rotate(180deg)" : undefined,
                transition: "transform 120ms ease",
              }}
            />
          }
          onClick={() => setShowSql((v) => !v)}
          styles={{ label: { fontWeight: 400 } }}
        >
          SQL
        </Button>
      </Group>

      <Collapse in={showSql}>
        <Code block style={insetCodeBlockStyle}>
          {result.executedSql}
        </Code>
      </Collapse>

      <QueryResultTable result={result} />
    </Stack>
  );
}
