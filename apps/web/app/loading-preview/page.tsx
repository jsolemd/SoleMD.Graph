"use client";

import { useMemo, useState } from "react";
import { ActionIcon, Button, Group, Paper, Select, Slider, Switch, Text } from "@mantine/core";
import { ChevronLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { GraphLoadingExperience } from "@/features/graph/components/shell/loading";
import type { GraphBundle, GraphBundleLoadProgress } from "@/features/graph/types";

const stageOptions: Array<{
  value: GraphBundleLoadProgress["stage"];
  label: string;
  defaultPercent: number;
}> = [
  { value: "resolving", label: "Resolving", defaultPercent: 8 },
  { value: "views", label: "Views", defaultPercent: 24 },
  { value: "points", label: "Points", defaultPercent: 46 },
  { value: "clusters", label: "Clusters", defaultPercent: 62 },
  { value: "facets", label: "Facets", defaultPercent: 78 },
  { value: "hydrating", label: "Hydrating", defaultPercent: 90 },
  { value: "ready", label: "Ready", defaultPercent: 100 },
];

const previewBundle: GraphBundle = {
  assetBaseUrl: "",
  bundleBytes: 0,
  bundleChecksum: "loading-preview",
  bundleFormat: "preview",
  bundleManifest: {
    bundleFormat: "preview",
    bundleProfile: "base",
    bundleVersion: "preview",
    contract: {
      artifactSets: {
        base: [],
        universe: [],
        evidence: [],
      },
      files: {},
    },
    createdAt: null,
    duckdbFile: null,
    graphName: "Biomedical Knowledge Graph",
    graphRunId: "loading-preview",
    nodeKind: "paper",
    tables: {},
  },
  bundleUri: "preview://loading",
  bundleVersion: "preview",
  graphName: "Biomedical Knowledge Graph",
  manifestUrl: "",
  nodeKind: "paper",
  qaSummary: null,
  runId: "loading-preview",
  tableUrls: {},
};

export default function LoadingPreviewPage() {
  const [stage, setStage] = useState<GraphBundleLoadProgress["stage"]>("hydrating");
  const [percent, setPercent] = useState(90);
  const [canvasReady, setCanvasReady] = useState(false);

  const progress = useMemo<GraphBundleLoadProgress>(
    () => ({
      stage,
      message: stage,
      percent,
    }),
    [percent, stage],
  );

  const resetPreview = () => {
    setStage("hydrating");
    setPercent(90);
    setCanvasReady(false);
  };

  return (
    <>
      <GraphLoadingExperience
        bundle={previewBundle}
        progress={progress}
        canvasReady={canvasReady}
      />

      <Paper
        className="fixed bottom-4 right-4 z-[90] w-[min(360px,calc(100vw-2rem))]"
        p="md"
        radius="xl"
        shadow="md"
        withBorder
        style={{
          backgroundColor: "var(--graph-panel-bg)",
          borderColor: "var(--graph-panel-border)",
        }}
      >
        <Group justify="space-between" align="flex-start" mb="sm">
          <div>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Loading Preview
            </Text>
            <Text size="sm" c="dimmed">
              `/loading-preview`
            </Text>
          </div>

          <Group gap="xs">
            <ActionIcon
              component={Link}
              href="/"
              variant="subtle"
              radius="xl"
              aria-label="Back to app"
            >
              <ChevronLeft size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              radius="xl"
              aria-label="Reset preview"
              onClick={resetPreview}
            >
              <RotateCcw size={16} />
            </ActionIcon>
          </Group>
        </Group>

        <div className="flex flex-col gap-4">
          <Select
            label="Stage"
            data={stageOptions}
            value={stage}
            onChange={(value) => {
              if (!value) return;
              const next = stageOptions.find((option) => option.value === value);
              setStage(value as GraphBundleLoadProgress["stage"]);
              if (next) setPercent(next.defaultPercent);
            }}
            allowDeselect={false}
          />

          <div>
            <Group justify="space-between" mb={6}>
              <Text size="sm">Progress</Text>
              <Text size="sm" c="dimmed">
                {percent}%
              </Text>
            </Group>
            <Slider
              min={0}
              max={100}
              step={1}
              value={percent}
              onChange={setPercent}
              label={(value) => `${value}%`}
            />
          </div>

          <Switch
            checked={canvasReady}
            onChange={(event) => setCanvasReady(event.currentTarget.checked)}
            label="Finalizing / handoff state"
          />

          <Group gap="xs">
            <Button
              variant="light"
              onClick={() => {
                setStage("ready");
                setPercent(100);
                setCanvasReady(false);
              }}
            >
              Show Ready Stage
            </Button>
            <Button
              variant="default"
              onClick={() => setCanvasReady((current) => !current)}
            >
              Toggle Handoff
            </Button>
          </Group>
        </div>
      </Paper>
    </>
  );
}
