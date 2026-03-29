"use client";

import { Group, Loader, Stack, Text } from "@mantine/core";
import { motion } from "framer-motion";
import { formatBytes, formatNumber } from "@/lib/helpers";
import { panelCardClassName, panelCardStyle, panelTextStyle, panelTextDimStyle } from "../../panels/PanelShell";
import type { GraphBundle, GraphBundleLoadProgress } from "@/features/graph/types";

function getUserFriendlyMessage(
  stage: GraphBundleLoadProgress["stage"] | undefined,
  canvasReady: boolean,
  loadedRows?: number,
  totalRows?: number,
): string {
  if (canvasReady) return "Rendering your visualization...";
  switch (stage) {
    case "resolving":
      return "Connecting to graph dataset...";
    case "views":
      return "Preparing data tables...";
    case "points":
      if (loadedRows != null && totalRows != null) {
        return `Loading points (${formatNumber(loadedRows)} of ${formatNumber(totalRows)})...`;
      }
      return "Loading graph points...";
    case "clusters":
      return "Organizing clusters...";
    case "facets":
      return "Building facets...";
    case "hydrating":
      return "Preparing graph layout...";
    case "ready":
      return "Rendering your visualization...";
    default:
      return "Loading knowledge graph...";
  }
}

function BundleStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={panelCardClassName}
      style={panelCardStyle}
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
        style={panelTextStyle}
      >
        {value}
      </Text>
    </div>
  );
}

export function GraphBundleLoadingOverlay({
  bundle,
  progress,
  canvasReady,
}: {
  bundle: GraphBundle;
  progress: GraphBundleLoadProgress | null;
  canvasReady: boolean;
}) {
  const basePointCount =
    bundle.bundleManifest.tables.base_points?.rowCount ??
    (typeof bundle.qaSummary?.["base_count"] === "number"
      ? bundle.qaSummary["base_count"]
      : undefined);
  const qaClusterCount =
    typeof bundle.qaSummary?.["cluster_count"] === "number"
      ? bundle.qaSummary["cluster_count"]
      : undefined;
  const baseBytes =
    (bundle.bundleManifest.tables.base_points?.bytes ?? 0) +
    (bundle.bundleManifest.tables.base_clusters?.bytes ?? 0);
  const rawPercent = progress?.percent ?? 0;
  const percent = canvasReady
    ? Math.max(rawPercent, 95)
    : Math.max(0, Math.min(100, rawPercent));

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: "var(--graph-bg)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
    >
      <div
        className="w-[min(420px,90vw)] rounded-3xl px-6 py-7"
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
                Knowledge Graph
              </Text>
              <Text mt={4} size="lg" fw={600} style={panelTextStyle}>
                {bundle.graphName}
              </Text>
            </div>
            <Loader size="sm" color="var(--brand-accent)" />
          </Group>

          <Text size="sm" style={panelTextDimStyle}>
            {getUserFriendlyMessage(
              progress?.stage,
              canvasReady,
              progress?.loadedRows,
              progress?.totalRows,
            )}
          </Text>

          <div
            className="overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--graph-panel-border)", height: 8 }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                backgroundColor: "var(--brand-accent)",
                transition: "width 300ms ease",
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <BundleStat
              label="Base Points"
              value={
                basePointCount != null
                  ? formatNumber(basePointCount)
                  : "..."
              }
            />
            <BundleStat
              label="Clusters"
              value={
                qaClusterCount != null
                  ? formatNumber(qaClusterCount)
                  : "..."
              }
            />
            <BundleStat
              label="Base Size"
              value={formatBytes(baseBytes || bundle.bundleBytes)}
            />
          </div>
        </Stack>
      </div>
    </motion.div>
  );
}
