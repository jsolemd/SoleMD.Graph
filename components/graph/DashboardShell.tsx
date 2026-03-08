"use client";

import { AnimatePresence } from "framer-motion";
import {
  CosmographProvider,
  CosmographTypeColorLegend,
  CosmographRangeColorLegend,
  CosmographSizeLegend,
} from "@cosmograph/react";
import { useGraphStore } from "@/lib/graph/store";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { getModeConfig } from "@/lib/graph/modes";
import { GraphCanvas } from "./GraphCanvas";
import { Wordmark } from "./Wordmark";
import { PromptBox } from "./PromptBox";
import { TimelineBar } from "./TimelineBar";
import { StatsBar } from "./StatsBar";
import { LeftToolbar } from "./toolbar/LeftToolbar";
import { CanvasControls } from "./controls/CanvasControls";
import { ConfigPanel } from "./panels/ConfigPanel";
import { FiltersPanel } from "./panels/FiltersPanel";
import { InfoPanel } from "./panels/InfoPanel";
import { DataTable } from "./panels/DataTable";
import type { GraphData } from "@/lib/graph/types";

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

export function DashboardShell({ data }: { data: GraphData }) {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const showSizeLegend = useDashboardStore((s) => s.showSizeLegend);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);

  const { layout } = getModeConfig(mode);
  const isContinuousColor = pointColorStrategy === "continuous";

  return (
    <CosmographProvider>
      <div
        className="fixed inset-0 flex flex-col"
        style={{
          backgroundColor: "var(--graph-bg)",
          ...cosmographTheme,
        } as React.CSSProperties}
      >
        {/* Main area: toolbar + canvas */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left toolbar */}
          <AnimatePresence>
            {layout.showToolbar && <LeftToolbar />}
          </AnimatePresence>

          {/* Canvas container */}
          <div className="relative flex-1">
            <GraphCanvas data={data} />
            <Wordmark />

            {/* Side panels — only render if mode allows them */}
            <AnimatePresence>
              {layout.availablePanels.includes("config") &&
                activePanel === "config" && <ConfigPanel />}
            </AnimatePresence>
            <AnimatePresence>
              {layout.availablePanels.includes("filters") &&
                activePanel === "filters" && <FiltersPanel />}
            </AnimatePresence>
            <AnimatePresence>
              {layout.availablePanels.includes("info") &&
                activePanel === "info" && (
                  <InfoPanel stats={data.stats} />
                )}
            </AnimatePresence>

            {/* Canvas-overlay color legend */}
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

            {/* Canvas-overlay size legend */}
            {layout.showLegends && showSizeLegend && (
              <div className="absolute bottom-20 right-4 z-30">
                <CosmographSizeLegend selectOnClick style={legendStyle} />
              </div>
            )}

            {/* Canvas controls */}
            <AnimatePresence>
              {layout.showCanvasControls && <CanvasControls />}
            </AnimatePresence>
          </div>
        </div>

        {/* Timeline */}
        {layout.showTimeline && showTimeline && <TimelineBar />}

        {/* Data table */}
        <AnimatePresence>
          {layout.showDataTable && tableOpen && (
            <DataTable nodes={data.nodes} />
          )}
        </AnimatePresence>

        {/* Bottom overlays — always visible */}
        <PromptBox />
        {layout.showStatsBar && <StatsBar stats={data.stats} />}
      </div>
    </CosmographProvider>
  );
}
