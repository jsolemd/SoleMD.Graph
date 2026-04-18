"use client";

import { Text } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import type {
  GraphBundle,
  GraphBundleLoadProgress,
} from "@/features/graph/types";
import { LottiePulseLoader } from "@/features/animations/lottie/LottiePulseLoader";
import ConnectomeLoader from "@/features/animations/canvas/connectome-loader/ConnectomeLoader";
import { panelSurfaceStyle } from "@/features/graph/components/panels/PanelShell";
import { AboutPanel } from "@/features/graph/components/panels/AboutPanel";
import { useDashboardStore } from "@/features/graph/stores";
import { GraphLoadingChrome } from "./GraphLoadingChrome";
import { GraphLoadingConstellations } from "./GraphLoadingConstellations";

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
      return "Loading knowledge graph...";
  }
}

interface GraphLoadingExperienceProps {
  bundle?: GraphBundle | null;
  progress?: GraphBundleLoadProgress | null;
  canvasReady?: boolean;
}

export function GraphLoadingExperience({
  bundle,
  progress,
  canvasReady = false,
}: GraphLoadingExperienceProps) {
  const aboutOpen = useDashboardStore((s) => s.openPanels.about);
  const interactiveBackdrop = !canvasReady;
  const rawPercent = progress?.percent ?? 0;
  const percent = canvasReady
    ? Math.max(rawPercent, 95)
    : Math.max(0, Math.min(100, rawPercent));
  const graphName = bundle?.graphName ?? "Biomedical Knowledge Graph";

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5"
        style={{ backgroundColor: "var(--graph-bg)" }}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: canvasReady ? 0.18 : 0.36,
          ease: canvasReady ? "easeOut" : "easeInOut",
        }}
      >
        <ConnectomeLoader paused={canvasReady} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, transparent 0%, transparent 34%, color-mix(in srgb, var(--graph-bg) 12%, transparent) 62%, color-mix(in srgb, var(--graph-bg) 32%, transparent) 100%)",
          }}
        />
        {interactiveBackdrop && <GraphLoadingConstellations />}

        <div
          className="relative z-10 flex w-[min(360px,88vw)] flex-col items-center gap-5 rounded-2xl px-8 py-7"
          style={panelSurfaceStyle}
        >
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
              {graphName}
            </Text>
            <Text
              size="10px"
              style={{
                color: "var(--text-tertiary)",
                letterSpacing: "0.04em",
              }}
            >
              {interactiveBackdrop
                ? "Hover to preview, click to pin a constellation"
                : "Finalizing graph rendering"}
            </Text>
          </div>

          <div className="flex w-full flex-col items-center gap-3">
            <div
              className="relative w-full overflow-hidden rounded-full"
              style={{
                backgroundColor: "var(--graph-panel-border)",
                height: 4,
              }}
            >
              {progress ? (
                <div
                  style={{
                    width: `${percent}%`,
                    height: "100%",
                    backgroundColor: "var(--mode-accent)",
                    transition: "width 300ms ease",
                  }}
                />
              ) : (
                <motion.div
                  className="absolute inset-y-0 rounded-full"
                  style={{ backgroundColor: "var(--mode-accent)" }}
                  animate={{ left: ["-28%", "100%"], width: ["28%", "36%"] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              )}
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

      <GraphLoadingChrome />

      <AnimatePresence>
        {aboutOpen && (
          <div className="fixed inset-0 z-[70] pointer-events-none">
            <div className="pointer-events-auto">
              <AboutPanel />
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
