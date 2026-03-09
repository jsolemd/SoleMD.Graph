"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Code,
  Collapse,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { Play, RotateCcw } from "lucide-react";
import { useDashboardStore } from "@/lib/graph/stores";
import { formatCellValue } from "@/lib/helpers";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphQueryResult,
} from "@/lib/graph/types";
import {
  PanelShell,
  panelBodyTextClassName,
  panelErrorStyle,
  panelMetaTextClassName,
  panelTableHeaderStyle,
  panelTextStyle,
  panelTextMutedStyle,
  panelTextDimStyle,
} from "../PanelShell";

const DEFAULT_QUERY = `SELECT
  cluster_id,
  label,
  member_count,
  paper_count
FROM graph_clusters
ORDER BY member_count DESC
LIMIT 10`;

const SAMPLE_QUERIES = [
  {
    label: "Show Tables",
    sql: "SHOW TABLES",
  },
  {
    label: "Count Points",
    sql: "SELECT count(*) AS point_count FROM graph_points",
  },
  {
    label: "Top Clusters",
    sql: DEFAULT_QUERY,
  },
  {
    label: "Point View",
    sql: `SELECT
  id,
  paperTitle,
  clusterLabel,
  year
FROM graph_points_web
LIMIT 10`,
  },
] as const;

function QueryResultTable({ result }: { result: GraphQueryResult }) {
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
      className="scrollbar-thin"
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
              <Table.Th
                key={column}
                style={panelTableHeaderStyle}
              >
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

function QueryResult({ result }: { result: GraphQueryResult }) {
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
              backgroundColor: "var(--interactive-active)",
              color: "var(--graph-panel-text)",
            },
          }}
        >
          {result.rowCount} rows in {result.durationMs.toFixed(1)} ms
        </Badge>
      </Group>

      {result.appliedLimit != null && (
        <Text className={panelMetaTextClassName} style={panelTextDimStyle}>
          SELECT/WITH queries are wrapped with LIMIT {result.appliedLimit} to
          keep the browser responsive.
        </Text>
      )}

      <Text
        size="xs"
        className="cursor-pointer"
        style={{ color: "var(--brand-accent)" }}
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

export function QueryPanel({
  bundle,
  runReadOnlyQuery,
}: {
  bundle: GraphBundle;
  runReadOnlyQuery: GraphBundleQueries["runReadOnlyQuery"];
}) {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);
  const [sql, setSql] = useState(DEFAULT_QUERY);
  const [result, setResult] = useState<GraphQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const availableTables = useMemo(
    () => ["graph_points_web", ...Object.keys(bundle.bundleManifest.tables).sort()],
    [bundle.bundleManifest.tables]
  );

  const handleRun = async () => {
    setRunning(true);
    setError(null);

    try {
      const nextResult = await runReadOnlyQuery(sql);
      setResult(nextResult);
    } catch (nextError) {
      setResult(null);
      setError(
        nextError instanceof Error ? nextError.message : "Query execution failed."
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <PanelShell
      title="SQL Explorer"
      side="left"
      width={420}
      onClose={() => setActivePanel(null)}
    >
      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="sm">
          <Text className={panelBodyTextClassName} style={panelTextDimStyle}>
            Run SQL queries against the graph data loaded in your browser.
            Results stay local and never leave this device.
          </Text>

          <Text
            fw={600}
            className={panelMetaTextClassName}
            style={panelTextMutedStyle}
          >
            Available Relations
          </Text>
          <Group gap={6}>
            {availableTables.map((tableName) => (
              <Badge
                key={tableName}
                variant="outline"
                styles={{
                  root: {
                    borderColor: "var(--graph-panel-border)",
                    color: "var(--graph-panel-text-dim)",
                  },
                }}
              >
                {tableName}
              </Badge>
            ))}
          </Group>

          <Text
            fw={600}
            className={panelMetaTextClassName}
            style={panelTextMutedStyle}
          >
            Quick Queries
          </Text>
          <Group gap={6}>
            {SAMPLE_QUERIES.map((sample) => (
              <Button
                key={sample.label}
                size="compact-xs"
                variant="light"
                onClick={() => setSql(sample.sql)}
              >
                {sample.label}
              </Button>
            ))}
          </Group>

          <Textarea
            label="SQL"
            minRows={8}
            autosize
            value={sql}
            onChange={(event) => setSql(event.currentTarget.value)}
            styles={{
              label: {
                color: "var(--graph-panel-text-muted)",
                fontSize: "0.75rem",
              },
              input: {
                backgroundColor: "var(--graph-panel-input-bg)",
                borderColor: "var(--graph-panel-border)",
                color: "var(--graph-panel-text)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                lineHeight: 1.5,
              },
            }}
          />

          <Group justify="space-between" align="center">
            <Group gap="xs">
              <Button
                size="xs"
                leftSection={running ? <Loader size={12} /> : <Play size={14} />}
                onClick={handleRun}
                loading={running}
              >
                Run Query
              </Button>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<RotateCcw size={14} />}
                onClick={() => {
                  setSql(DEFAULT_QUERY);
                  setResult(null);
                  setError(null);
                }}
              >
                Reset
              </Button>
            </Group>

            <Text className={panelMetaTextClassName} style={panelTextDimStyle}>
              `graph_points_web` exposes the Cosmograph-ready camelCase view.
            </Text>
          </Group>

          {error && (
            <div
              className="rounded-xl p-3"
              style={panelErrorStyle}
            >
              <Text size="xs" style={panelTextStyle}>
                {error}
              </Text>
            </div>
          )}

          {result && (
            <QueryResult result={result} />
          )}
        </Stack>
      </div>
    </PanelShell>
  );
}
