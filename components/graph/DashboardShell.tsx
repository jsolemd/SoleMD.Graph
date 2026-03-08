"use client";

import { AnimatePresence } from "framer-motion";
import {
  CosmographProvider,
  CosmographRangeColorLegend,
  CosmographSizeLegend,
  CosmographTypeColorLegend,
} from "@cosmograph/react";
import {
  Button,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { getModeConfig } from "@/lib/graph/modes";
import { useGraphBundle } from "@/lib/graph/use-graph-bundle";
import { formatNumber } from "@/lib/helpers";
import { GraphCanvas } from "./GraphCanvas";
import { Wordmark } from "./Wordmark";
import { PromptBox } from "./PromptBox";
import { TimelineBar } from "./TimelineBar";
import { StatsBar } from "./StatsBar";
import { LeftToolbar } from "./explore/LeftToolbar";
import { CanvasControls } from "./explore/CanvasControls";
import { ConfigPanel } from "./explore/ConfigPanel";
import { FiltersPanel } from "./explore/FiltersPanel";
import { InfoPanel } from "./explore/InfoPanel";
import { DataTable } from "./explore/DataTable";
import { DetailPanel } from "./DetailPanel";
import type { GraphBundle } from "@/lib/graph/types";

const legendStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--graph-panel-border)",
  backgroundColor: "var(--graph-panel-bg)",
  boxShadow: "var(--graph-panel-shadow)",
  padding: 8,
};

/**
 * Cosmograph injects :root CSS vars with dark defaults AFTER our stylesheet.
 * Inline styles on the shell container override them for all child widgets.
 */
const cosmographTheme: Record<string, string> = {
  "--cosmograph-ui-background": "var(--surface)",
  "--cosmograph-ui-text": "var(--text-primary)",
  "--cosmograph-ui-element-color": "var(--border-default)",
  "--cosmograph-ui-highlighted-element-color": "var(--brand-accent)",
  "--cosmograph-ui-selection-control-color": "var(--brand-accent)",
  "--cosmograph-ui-font-family": "Inter, sans-serif",
};

function formatBundleBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function GraphBundleLoadingState({ bundle }: { bundle: GraphBundle }) {
  const qaPointCount =
    typeof bundle.qaSummary?.["point_count"] === "number"
      ? bundle.qaSummary["point_count"]
      : undefined;
  const qaClusterCount =
    typeof bundle.qaSummary?.["cluster_count"] === "number"
      ? bundle.qaSummary["cluster_count"]
      : undefined;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: "var(--graph-bg)" }}
    >
      <div
        className="w-[min(540px,92vw)] rounded-3xl px-6 py-7"
        style={{
          backgroundColor: "var(--graph-panel-bg)",
          border: "1px solid var(--graph-panel-border)",
          boxShadow: "var(--graph-panel-shadow)",
        }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text
                size="xs"
                fw={700}
                style={{
                  color: "var(--graph-panel-text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Graph Bundle
              </Text>
              <Text
                mt={4}
                size="lg"
                fw={600}
                style={{ color: "var(--graph-panel-text)" }}
              >
                Loading {bundle.graphName} / {bundle.nodeKind}
              </Text>
            </div>
            <Loader size="sm" color="var(--brand-accent)" />
          </Group>

          <Text size="sm" style={{ color: "var(--graph-panel-text-dim)" }}>
            PostgreSQL resolved the active run. The browser is now mounting the
            checksum-scoped bundle into DuckDB-Wasm.
          </Text>

          <div className="grid grid-cols-2 gap-3">
            <BundleStat label="Run" value={bundle.runId.slice(0, 8)} />
            <BundleStat
              label="Checksum"
              value={bundle.bundleChecksum.slice(0, 12)}
            />
            <BundleStat
              label="Bundle Size"
              value={formatBundleBytes(bundle.bundleBytes)}
            />
            <BundleStat
              label="Tables"
              value={formatNumber(
                Object.keys(bundle.bundleManifest.tables).length
              )}
            />
            <BundleStat
              label="Points"
              value={
                qaPointCount != null
                  ? formatNumber(qaPointCount)
                  : "Loading..."
              }
            />
            <BundleStat
              label="Clusters"
              value={
                qaClusterCount != null
                  ? formatNumber(qaClusterCount)
                  : "Loading..."
              }
            />
          </div>
        </Stack>
      </div>
    </div>
  );
}

function GraphBundleErrorState({ error }: { error: Error }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ backgroundColor: "var(--graph-bg)" }}
    >
      <div
        className="w-[min(520px,92vw)] rounded-3xl px-6 py-7"
        style={{
          backgroundColor: "var(--graph-panel-bg)",
          border: "1px solid var(--graph-panel-border)",
          boxShadow: "var(--graph-panel-shadow)",
        }}
      >
        <Stack gap="md">
          <div>
            <Text
              size="xs"
              fw={700}
              style={{
                color: "var(--graph-panel-text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Graph Bundle
            </Text>
            <Text
              mt={4}
              size="lg"
              fw={600}
              style={{ color: "var(--graph-panel-text)" }}
            >
              Bundle load failed
            </Text>
          </div>

          <Text size="sm" style={{ color: "var(--graph-panel-text-dim)" }}>
            {error.message}
          </Text>

          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            styles={{
              root: {
                alignSelf: "flex-start",
                borderColor: "var(--brand-accent)",
                color: "var(--graph-panel-text)",
              },
            }}
          >
            Reload
          </Button>
        </Stack>
      </div>
    </div>
  );
}

function BundleStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-3 py-3"
      style={{
        backgroundColor: "var(--graph-panel-input-bg)",
        border: "1px solid var(--graph-panel-border)",
      }}
    >
      <Text
        size="xs"
        fw={600}
        style={{
          color: "var(--graph-panel-text-muted)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        mt={4}
        size="sm"
        fw={600}
        style={{ color: "var(--graph-panel-text)" }}
      >
        {value}
      </Text>
    </div>
  );
}

export function DashboardShell({ bundle }: { bundle: GraphBundle }) {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const showSizeLegend = useDashboardStore((s) => s.showSizeLegend);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const { canvas, data, error, loading, queries } = useGraphBundle(bundle);

  const { layout } = getModeConfig(mode);
  const isContinuousColor = pointColorStrategy === "continuous";

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  if (loading || !canvas || !data || !queries) {
    return <GraphBundleLoadingState bundle={bundle} />;
  }

  return (
    <CosmographProvider>
      <div
        className="fixed inset-0 flex flex-col"
        style={{
          backgroundColor: "var(--graph-bg)",
          ...cosmographTheme,
        } as React.CSSProperties}
      >
        <div className="flex flex-1 overflow-hidden">
          <AnimatePresence>
            {layout.showToolbar && <LeftToolbar />}
          </AnimatePresence>

          <div className="relative flex-1">
            <GraphCanvas canvas={canvas} data={data} />
            <Wordmark />

            <AnimatePresence>
              {layout.availablePanels.includes("config") &&
                activePanel === "config" && <ConfigPanel />}
            </AnimatePresence>
            <AnimatePresence>
              {layout.availablePanels.includes("filters") &&
                activePanel === "filters" && <FiltersPanel facets={data.facets} />}
            </AnimatePresence>
            <AnimatePresence>
              {layout.availablePanels.includes("info") &&
                activePanel === "info" && <InfoPanel stats={data.stats} />}
            </AnimatePresence>
            <AnimatePresence>
              <DetailPanel queries={queries} />
            </AnimatePresence>

            {layout.showLegends && showColorLegend && (
              <div className="absolute bottom-4 left-4 z-30">
                {isContinuousColor ? (
                  <CosmographRangeColorLegend style={legendStyle} />
                ) : (
                  <CosmographTypeColorLegend
                    selectOnClick
                    style={legendStyle}
                  />
                )}
              </div>
            )}

            {layout.showLegends && showSizeLegend && (
              <div className="absolute bottom-20 right-4 z-30">
                <CosmographSizeLegend selectOnClick style={legendStyle} />
              </div>
            )}

            <AnimatePresence>
              {layout.showCanvasControls && <CanvasControls />}
            </AnimatePresence>
          </div>
        </div>

        {layout.showTimeline && showTimeline && <TimelineBar />}

        <AnimatePresence>
          {layout.showDataTable && tableOpen && <DataTable nodes={data.nodes} />}
        </AnimatePresence>

        <PromptBox />
        {layout.showStatsBar && <StatsBar stats={data.stats} />}
      </div>
    </CosmographProvider>
  );
}
