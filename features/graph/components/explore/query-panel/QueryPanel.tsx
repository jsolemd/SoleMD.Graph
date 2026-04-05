"use client";

import { memo, useMemo, useState } from "react";
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
  PANEL_BODY_CLASS,
  PanelDivider,
  PanelShell,
  badgeOutlineStyles,
  panelErrorStyle,
  panelTextStyle,
  panelTextDimStyle,
  sectionLabelStyle,
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
    sql: "SELECT count(*) AS point_count FROM current_points_web",
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
FROM current_points_web
LIMIT 10`,
  },
] as const;

function QueryPanelComponent({
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
    () => ["current_points_canvas_web", "current_points_web", "current_paper_points_web", "current_links_web", ...Object.keys(bundle.bundleManifest.tables).sort()],
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
      <div className={PANEL_BODY_CLASS}>
        <Stack gap="sm">
          {(
            [
              /* Description */
              <Text key="desc" style={panelTextDimStyle}>
                Run SQL queries against the graph data loaded in your browser.
                Results stay local and never leave this device.
              </Text>,

              /* Available relations */
              <div key="tables">
                <Text fw={600} mb={4} style={sectionLabelStyle}>
                  Available Relations
                </Text>
                <Group gap={6}>
                  {availableTables.map((tableName) => (
                    <Badge key={tableName} size="xs" styles={badgeOutlineStyles}>
                      {tableName}
                    </Badge>
                  ))}
                </Group>
              </div>,

              /* Quick queries */
              <div key="quick">
                <Text fw={600} mb={4} style={sectionLabelStyle}>
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
              </div>,

              /* SQL editor + run/reset */
              <div key="editor">
                <Textarea
                  label="SQL"
                  minRows={8}
                  autosize
                  value={sql}
                  onChange={(event) => setSql(event.currentTarget.value)}
                  styles={{
                    label: sectionLabelStyle,
                    input: {
                      backgroundColor: "var(--graph-panel-input-bg)",
                      borderColor: "var(--graph-panel-border)",
                      color: "var(--graph-panel-text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      lineHeight: "14px",
                    },
                  }}
                />

                <Group gap="xs" mt="xs">
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
              </div>,

              /* Help text */
              <Text key="help" style={{ ...panelTextDimStyle, lineHeight: "16px" }}>
                current_points_canvas_web is the canonical live render table read
                by Cosmograph. current_points_web and current_paper_points_web are
                the query-facing active views for widgets, selection, and table
                access.
              </Text>,

              /* Error */
              error ? (
                <div key="error" className="rounded-xl p-3" style={panelErrorStyle}>
                  <Text style={panelTextStyle}>{error}</Text>
                </div>
              ) : null,

              /* Result */
              result ? <QueryResult key="result" result={result} /> : null,
            ] as (React.ReactNode | null)[]
          )
            .filter(Boolean)
            .flatMap((section, i) =>
              i > 0
                ? [<PanelDivider key={`div-${i}`} />, section]
                : [section],
            )}
        </Stack>
      </div>
    </PanelShell>
  );
}

export const QueryPanel = memo(QueryPanelComponent);
QueryPanel.displayName = "QueryPanel";
