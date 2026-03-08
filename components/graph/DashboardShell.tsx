"use client";

import { AnimatePresence } from "framer-motion";
import { CosmographProvider } from "@cosmograph/react";
import { useGraphStore } from "@/lib/graph/store";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { GraphCanvas } from "./GraphCanvas";
import { Wordmark } from "./Wordmark";
import { PromptBox } from "./PromptBox";
import { StatsBar } from "./StatsBar";
import { LeftToolbar } from "./toolbar/LeftToolbar";
import { CanvasControls } from "./controls/CanvasControls";
import { ConfigPanel } from "./panels/ConfigPanel";
import { FiltersPanel } from "./panels/FiltersPanel";
import { InfoPanel } from "./panels/InfoPanel";
import { DataTable } from "./panels/DataTable";
import type { GraphData } from "@/lib/graph/types";

export function DashboardShell({ data }: { data: GraphData }) {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const isExplore = mode === "explore";

  return (
    <CosmographProvider>
      <div
        className="fixed inset-0 flex flex-col"
        style={{ backgroundColor: "var(--graph-bg)" }}
      >
        {/* Main area: toolbar + canvas */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left toolbar — explore mode only */}
          <AnimatePresence>
            {isExplore && <LeftToolbar />}
          </AnimatePresence>

          {/* Canvas container */}
          <div className="relative flex-1">
            <GraphCanvas data={data} />

            {/* Wordmark — positioned inside canvas area */}
            <Wordmark />

            {/* Side panels */}
            <AnimatePresence>
              {isExplore && activePanel === "config" && <ConfigPanel />}
            </AnimatePresence>
            <AnimatePresence>
              {isExplore && activePanel === "filters" && <FiltersPanel />}
            </AnimatePresence>
            <AnimatePresence>
              {isExplore && activePanel === "info" && (
                <InfoPanel stats={data.stats} />
              )}
            </AnimatePresence>

            {/* Canvas controls — explore mode only */}
            <AnimatePresence>
              {isExplore && <CanvasControls />}
            </AnimatePresence>
          </div>
        </div>

        {/* Data table — explore mode only */}
        <AnimatePresence>
          {isExplore && tableOpen && <DataTable nodes={data.nodes} />}
        </AnimatePresence>

        {/* Bottom overlays — always visible */}
        <PromptBox />
        {!isExplore && <StatsBar stats={data.stats} />}
      </div>
    </CosmographProvider>
  );
}
