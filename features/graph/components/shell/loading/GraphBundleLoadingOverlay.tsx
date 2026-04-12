"use client";

import { Text } from "@mantine/core";
import { motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";
import type { GraphBundle, GraphBundleLoadProgress } from "@/features/graph/types";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import { panelSurfaceStyle } from "@/features/graph/components/panels/PanelShell";
import { LottiePulseLoader } from "@/features/animations/lottie/LottiePulseLoader";
import ConnectomeLoader from "@/features/animations/canvas/connectome-loader/ConnectomeLoader";

function getUserFriendlyMessage(
  stage: GraphBundleLoadProgress["stage"] | undefined,
  canvasReady: boolean,
): string {
  if (canvasReady) return "Rendering...";
  switch (stage) {
    case "resolving":
      return "Connecting...";
    case "views":
      return "Preparing tables...";
    case "points":
      return "Loading points...";
    case "clusters":
      return "Organizing clusters...";
    case "facets":
      return "Building facets...";
    case "hydrating":
      return "Preparing layout...";
    case "ready":
      return "Rendering...";
    default:
      return "Loading...";
  }
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
  const rawPercent = progress?.percent ?? 0;
  const percent = canvasReady
    ? Math.max(rawPercent, 95)
    : Math.max(0, Math.min(100, rawPercent));

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5"
      style={{ backgroundColor: "var(--graph-bg)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
    >
      {/* Connectome particle field — entity-colored nodes drifting in fog */}
      <ConnectomeLoader />

      {/* Wordmark — same position as post-load Wordmark (top-left) */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--mode-accent)" }}
        >
          <BrainCircuit size={16} color="white" />
        </div>
        <span
          className="text-lg font-semibold select-none"
          style={{ color: "var(--graph-wordmark-text)" }}
        >
          Sole
          <span style={{ color: "var(--mode-accent)" }}>MD</span>
        </span>
      </div>

      {/* Theme toggle — top-right corner */}
      <div
        className="absolute right-3 top-3 z-10"
        data-graph-control-contrast="1"
      >
        <ThemeToggle />
      </div>

      {/* Floating panel card — shared surface tokens with the rest of the
          app's panels (see panelSurfaceStyle in PanelShell.tsx). */}
      <div
        className="relative z-10 flex w-[min(340px,85vw)] flex-col items-center gap-5 rounded-2xl px-8 py-7"
        style={panelSurfaceStyle}
      >
        {/* Branding + graph name */}
        <div className="flex flex-col items-center gap-1">
          <Text
            size="xs"
            fw={600}
            style={{
              color: "var(--text-tertiary)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            SoleMD
          </Text>
          <Text size="md" fw={500} style={{ color: "var(--text-primary)" }}>
            {bundle.graphName}
          </Text>
          <Text
            size="10px"
            style={{
              color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
            }}
          >
            Powered by Semantic Scholar
          </Text>
        </div>

        {/* Progress bar + status */}
        <div className="flex w-full flex-col items-center gap-3">
          <div
            className="w-full overflow-hidden rounded-full"
            style={{
              backgroundColor: "var(--graph-panel-border)",
              height: 4,
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                backgroundColor: "var(--mode-accent)",
                transition: "width 300ms ease",
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <LottiePulseLoader size={24} />
            <Text size="xs" style={{ color: "var(--text-tertiary)" }}>
              {getUserFriendlyMessage(progress?.stage, canvasReady)}
            </Text>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
