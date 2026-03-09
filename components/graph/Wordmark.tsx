"use client";

import { useCallback, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { useCosmograph } from "@cosmograph/react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Camera,
  Download,
  Eye,
  EyeOff,
  Maximize,
  Minus,
  Plus,
} from "lucide-react";
import ThemeToggle from "@/components/ui/theme-toggle";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { getModeConfig } from "@/lib/graph/modes";

const ICON_STYLE = {
  root: {
    color: "var(--graph-panel-text-dim)",
    transition: "color 200ms ease",
  },
} as const;

const ZOOM_FACTOR = 1.4;

export function Wordmark() {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const toggleUiHidden = useDashboardStore((s) => s.toggleUiHidden);
  const { layout, color: modeColor } = getModeConfig(mode);
  const [spinCount, setSpinCount] = useState(0);
  const { cosmograph } = useCosmograph();

  const handleFitView = useCallback(() => {
    cosmograph?.fitView(250, 0.1);
  }, [cosmograph]);

  const handleZoomIn = useCallback(() => {
    const current = cosmograph?.getZoomLevel() ?? 1;
    cosmograph?.setZoomLevel(current * ZOOM_FACTOR, 200);
  }, [cosmograph]);

  const handleZoomOut = useCallback(() => {
    const current = cosmograph?.getZoomLevel() ?? 1;
    cosmograph?.setZoomLevel(current / ZOOM_FACTOR, 200);
  }, [cosmograph]);

  const handleScreenshot = useCallback(() => {
    cosmograph?.captureScreenshot("solemd-graph.png");
  }, [cosmograph]);

  const handleExport = useCallback(async () => {
    const pointsData = await cosmograph?.getPointsData();
    if (!pointsData) return;
    const rows = cosmograph?.convertCosmographDataToObject(pointsData) ?? [];
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map((row) =>
        keys.map((k) => JSON.stringify((row as Record<string, unknown>)[k] ?? "")).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solemd-graph-data.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [cosmograph]);

  // Shift right when a left-side panel is open
  const hasLeftPanel =
    !uiHidden && layout.showToolbar && activePanel !== null;

  return (
    <>
      <div
        className="absolute top-3 z-40 flex items-center gap-3 transition-all duration-200"
        style={{ left: hasLeftPanel ? 332 : 12 }}
      >
        {!uiHidden && (
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-300"
              style={{ backgroundColor: modeColor }}
            >
              <BrainCircuit size={16} color="white" />
            </div>
            <span
              className="text-lg font-semibold select-none"
              style={{ color: "var(--graph-wordmark-text)" }}
            >
              Sole
              <span
                className="transition-colors duration-300"
                style={{ color: modeColor }}
              >
                MD
              </span>
            </span>
          </div>
        )}
        <ThemeToggle />
      </div>

      <div data-wordmark-toolbar className="absolute right-3 top-3 z-40 flex items-center gap-0.5">
        {!uiHidden && (
          <>
            <Tooltip label="Fit view" position="bottom" withArrow>
              <ActionIcon
                onClick={handleFitView}
                variant="subtle"
                size="lg"
                radius="xl"
                aria-label="Fit view"
                styles={ICON_STYLE}
              >
                <Maximize size={16} strokeWidth={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Zoom in" position="bottom" withArrow>
              <ActionIcon
                onClick={handleZoomIn}
                variant="subtle"
                size="lg"
                radius="xl"
                aria-label="Zoom in"
                styles={ICON_STYLE}
              >
                <Plus size={16} strokeWidth={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Zoom out" position="bottom" withArrow>
              <ActionIcon
                onClick={handleZoomOut}
                variant="subtle"
                size="lg"
                radius="xl"
                aria-label="Zoom out"
                styles={ICON_STYLE}
              >
                <Minus size={16} strokeWidth={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Save screenshot" position="bottom" withArrow>
              <ActionIcon
                onClick={handleScreenshot}
                variant="subtle"
                size="lg"
                radius="xl"
                aria-label="Save screenshot"
                styles={ICON_STYLE}
              >
                <Camera size={16} strokeWidth={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Export data" position="bottom" withArrow>
              <ActionIcon
                onClick={handleExport}
                variant="subtle"
                size="lg"
                radius="xl"
                aria-label="Export data"
                styles={ICON_STYLE}
              >
                <Download size={16} strokeWidth={1.5} />
              </ActionIcon>
            </Tooltip>

            <div className="mx-1 h-5 w-px" style={{ backgroundColor: "var(--graph-panel-border)" }} />
          </>
        )}

        <Tooltip
          label={uiHidden ? "Show graph UI" : "Hide graph UI"}
          position="bottom"
          withArrow
        >
          <ActionIcon
            onClick={() => {
              setSpinCount((current) => current + 1);
              toggleUiHidden();
            }}
            variant="subtle"
            size="lg"
            radius="xl"
            aria-label={uiHidden ? "Show graph UI" : "Hide graph UI"}
            styles={ICON_STYLE}
          >
            <motion.div
              className="flex items-center justify-center"
              animate={{ rotate: spinCount * 360 }}
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
            >
              {uiHidden ? <Eye size={18} /> : <EyeOff size={18} />}
            </motion.div>
          </ActionIcon>
        </Tooltip>
      </div>
    </>
  );
}
