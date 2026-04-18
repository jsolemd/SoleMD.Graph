"use client";

import { memo, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { ArrowUp, Play, Sparkles } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import { useTypewriter } from "@/features/graph/hooks/use-typewriter";
import type { GraphBundleQueries } from "@/features/graph/types";
import {
  PANEL_ACCENT,
  PanelDivider,
  panelErrorStyle,
  panelScaledPx,
  panelTextStyle,
} from "../../panels/PanelShell";
import { QueryResult } from "./QueryResult";

const SAMPLE_QUERIES = [
  {
    label: "Top Clusters",
    sql: `SELECT cluster_id, label, member_count, paper_count
FROM graph_clusters
ORDER BY member_count DESC
LIMIT 10`,
  },
  {
    label: "Year Trends",
    sql: `SELECT year, count(*) AS papers
FROM current_points_web
WHERE year IS NOT NULL
GROUP BY year
ORDER BY year DESC
LIMIT 20`,
  },
  {
    label: "Recent",
    sql: `SELECT id, paperTitle, year, clusterLabel
FROM current_points_web
WHERE year >= 2020
ORDER BY year DESC
LIMIT 20`,
  },
  {
    label: "Random Sample",
    sql: `SELECT id, paperTitle, year, clusterLabel
FROM current_points_web
USING SAMPLE 10 ROWS`,
  },
  {
    label: "Cluster Sizes",
    sql: `SELECT clusterLabel, count(*) AS n
FROM current_points_web
WHERE clusterLabel IS NOT NULL
GROUP BY clusterLabel
ORDER BY n DESC
LIMIT 20`,
  },
  {
    label: "Schema",
    sql: "DESCRIBE current_points_web",
  },
  {
    label: "Count Points",
    sql: "SELECT count(*) AS point_count FROM current_points_web",
  },
  {
    label: "Show Tables",
    sql: "SHOW TABLES",
  },
] as const;

const NL_EXAMPLES = [
  "Papers about depression…",
  "Biggest clusters by member count…",
  "Recent papers from 2023…",
  "Count papers per year…",
  "Authors with the most papers…",
  "Anything about dopamine…",
];

interface SqlExplorerContentProps {
  runReadOnlyQuery: GraphBundleQueries["runReadOnlyQuery"];
}

function SqlExplorerContentComponent({
  runReadOnlyQuery,
}: SqlExplorerContentProps) {
  const sql = useDashboardStore((s) => s.sqlExplorerQuery);
  const result = useDashboardStore((s) => s.sqlExplorerResult);
  const error = useDashboardStore((s) => s.sqlExplorerError);
  const setSql = useDashboardStore((s) => s.setSqlExplorerQuery);
  const setResult = useDashboardStore((s) => s.setSqlExplorerResult);
  const setError = useDashboardStore((s) => s.setSqlExplorerError);
  const resetExplorer = useDashboardStore((s) => s.resetSqlExplorer);
  const [running, setRunning] = useState(false);
  const [nlPrompt, setNlPrompt] = useState("");
  const { text: typedPlaceholder } = useTypewriter(NL_EXAMPLES, {
    enabled: nlPrompt.length === 0,
  });

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const next = await runReadOnlyQuery(sql);
      setResult(next);
    } catch (nextError) {
      setResult(null);
      setError(
        nextError instanceof Error ? nextError.message : "Query execution failed.",
      );
    } finally {
      setRunning(false);
    }
  };

  const handleGenerate = () => {
    const prompt = nlPrompt.trim();
    if (!prompt) return;
    const stub = `-- ${prompt}
SELECT id, paperTitle, year, clusterLabel
FROM current_points_web
LIMIT 10`;
    setSql(stub);
    setNlPrompt("");
  };

  return (
    <Stack gap="sm">
      <Group gap={6} wrap="nowrap" align="stretch">
        <TextInput
          placeholder={typedPlaceholder}
          leftSection={<Sparkles size={12} />}
          size="xs"
          value={nlPrompt}
          onChange={(event) => setNlPrompt(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleGenerate();
            }
          }}
          style={{ flex: 1 }}
          styles={{
            input: {
              backgroundColor: "var(--graph-panel-input-bg)",
              borderColor: "var(--graph-panel-border)",
              color: "var(--graph-panel-text)",
              fontSize: panelScaledPx(10),
            },
            section: { color: "var(--mode-accent)" },
          }}
        />
        <ActionIcon
          size={30}
          radius="xl"
          variant="light"
          color={PANEL_ACCENT}
          onClick={handleGenerate}
          disabled={!nlPrompt.trim()}
          aria-label="Generate SQL from prompt"
        >
          <ArrowUp size={14} />
        </ActionIcon>
      </Group>

      <SimpleGrid cols={4} spacing={6} verticalSpacing={6}>
        {SAMPLE_QUERIES.map((sample) => (
          <Button
            key={sample.label}
            size="compact-xs"
            variant="light"
            color={PANEL_ACCENT}
            onClick={() => setSql(sample.sql)}
            fullWidth
            styles={{ label: { fontWeight: 400, fontSize: panelScaledPx(10) } }}
          >
            {sample.label}
          </Button>
        ))}
      </SimpleGrid>

      <Textarea
        minRows={5}
        maxRows={14}
        autosize
        value={sql}
        onChange={(event) => setSql(event.currentTarget.value)}
        styles={{
          input: {
            backgroundColor: "var(--graph-panel-input-bg)",
            borderColor: "var(--graph-panel-border)",
            color: "var(--graph-panel-text)",
            fontFamily: "var(--font-mono)",
            fontSize: panelScaledPx(10),
            lineHeight: panelScaledPx(14),
            padding: `${panelScaledPx(6)} ${panelScaledPx(8)}`,
          },
        }}
      />

      <Group gap="xs">
        <Button
          size="xs"
          color={PANEL_ACCENT}
          leftSection={<Play size={12} />}
          onClick={handleRun}
          loading={running}
          styles={{ section: { marginInlineEnd: 4 } }}
        >
          Run
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color={PANEL_ACCENT}
          onClick={resetExplorer}
        >
          Reset
        </Button>
      </Group>

      {error && (
        <div className="rounded-md px-2 py-1.5" style={panelErrorStyle}>
          <Text style={panelTextStyle}>{error}</Text>
        </div>
      )}

      {result && (
        <>
          <PanelDivider />
          <QueryResult result={result} />
        </>
      )}
    </Stack>
  );
}

export const SqlExplorerContent = memo(SqlExplorerContentComponent);
SqlExplorerContent.displayName = "SqlExplorerContent";
