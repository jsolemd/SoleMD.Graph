"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { Play, RotateCcw } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphQueryResult,
} from "@/features/graph/types";
import {
  PANEL_ACCENT,
  PanelShell,
  panelErrorStyle,
  panelTextStyle,
  panelTextMutedStyle,
  panelTextDimStyle,
} from "../../panels/PanelShell";
import { QueryResult } from "./QueryResult";

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
    sql: "SELECT count(*) AS point_count FROM active_points_web",
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
FROM active_points_web
LIMIT 10`,
  },
] as const;

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
    () => ["active_points_web", "active_paper_points_web", ...Object.keys(bundle.bundleManifest.tables).sort()],
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
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="sm">
          <Text style={panelTextDimStyle}>
            Run SQL queries against the graph data loaded in your browser.
            Results stay local and never leave this device.
          </Text>

          <Text fw={600} style={panelTextMutedStyle}>
            Available Relations
          </Text>
          <Group gap={6}>
            {availableTables.map((tableName) => (
              <Badge
                key={tableName}
                variant="outline"
                styles={{
                  root: {
                    backgroundColor: "var(--mode-accent-subtle)",
                    borderColor: "var(--graph-panel-border)",
                    color: "var(--graph-panel-text-dim)",
                    fontWeight: 500,
                  },
                }}
              >
                {tableName}
              </Badge>
            ))}
          </Group>

          <Text fw={600} style={panelTextMutedStyle}>
            Quick Queries
          </Text>
          <Group gap={6}>
            {SAMPLE_QUERIES.map((sample) => (
              <Button
                key={sample.label}
                size="compact-xs"
                variant="light"
                color={PANEL_ACCENT}
                styles={{ label: { color: "var(--graph-panel-text)" } }}
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
                color={PANEL_ACCENT}
                leftSection={running ? <Loader size={12} /> : <Play size={14} />}
                onClick={handleRun}
                loading={running}
              >
                Run Query
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color={PANEL_ACCENT}
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

            <Text style={panelTextDimStyle}>
              `active_points_web` is the live canvas view. `active_paper_points_web`
              is the paper-layer projection of that same active set.
            </Text>
          </Group>

          {error && (
            <div className="rounded-xl p-3" style={panelErrorStyle}>
              <Text size="xs" style={panelTextStyle}>
                {error}
              </Text>
            </div>
          )}

          {result && <QueryResult result={result} />}
        </Stack>
      </div>
    </PanelShell>
  );
}
