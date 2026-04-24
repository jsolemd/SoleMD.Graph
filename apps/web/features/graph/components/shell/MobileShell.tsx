"use client";

import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { useEffect, type CSSProperties } from "react";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { Wordmark } from "../chrome/Wordmark";
import { GraphBundleLoadingOverlay } from "./loading";
import { promptSurfaceStyle } from "../panels/PanelShell";
import { preloadChromeChunks } from "./preload-chrome-chunks";
import { ShellPanels } from "./ShellPanels";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import type { PanelId } from "@/features/graph/stores";
import { MobileSelectionPrompt } from "./MobileSelectionPrompt";
import type { DashboardShellController } from "./use-dashboard-shell-controller";

const promptPlaceholderStyle: CSSProperties = {
  ...promptSurfaceStyle,
};

function PromptBoxLoadingPlaceholder() {
  return (
    <div className="fixed inset-x-2 bottom-4 z-50">
      <div
        className="h-16 w-full animate-pulse rounded-[1.75rem] backdrop-blur-xl"
        style={promptPlaceholderStyle}
      />
    </div>
  );
}

const PromptBox = dynamic(
  () => import("../panels/PromptBox").then((mod) => mod.PromptBox),
  { loading: () => <PromptBoxLoadingPlaceholder /> },
);

function getOpenPanelIds(openPanels: Record<PanelId, boolean>) {
  return (Object.keys(openPanels) as PanelId[]).filter((panelId) => openPanels[panelId]);
}

export function MobileShell(state: DashboardShellController) {
  const {
    bundle,
    canvas,
    handleGraphFirstPaint,
    isContinuousColor,
    isSelectionLocked,
    loading,
    openPanels,
    panelsVisible,
    progress,
    queries,
    showColorLegend,
    showLoading,
    showSizeLegend,
    showTimeline,
    tableOpen,
    uiHidden,
  } = state;
  const lastOpenedPanel = useDashboardStore((shellState) => shellState.lastOpenedPanel);
  const openOnlyPanel = useDashboardStore((shellState) => shellState.openOnlyPanel);
  const ragPanelOpen = useDashboardStore((shellState) => shellState.ragPanelOpen);
  const detailPanelOpen = useDashboardStore((shellState) => shellState.detailPanelOpen);
  const hasSelectedNode = useGraphStore((s) => s.selectedNode != null);
  const showSelectionPrompt = hasSelectedNode && !detailPanelOpen && !uiHidden;

  const canvasReady = !loading && canvas != null && queries != null;
  const openPanelIds = getOpenPanelIds(openPanels);
  const primaryPanelOpen = openPanelIds.length > 0;
  const overlayOpen = primaryPanelOpen || ragPanelOpen || detailPanelOpen;

  useEffect(() => {
    if (!canvasReady) {
      return;
    }

    preloadChromeChunks();
  }, [canvasReady]);

  useEffect(() => {
    if (!panelsVisible || openPanelIds.length <= 1) {
      return;
    }

    const nextPanel = lastOpenedPanel && openPanels[lastOpenedPanel]
      ? lastOpenedPanel
      : openPanelIds[openPanelIds.length - 1];

    openOnlyPanel(nextPanel);
  }, [lastOpenedPanel, openOnlyPanel, openPanelIds, openPanels, panelsVisible]);

  return (
    <div
      className="fixed inset-0"
      style={{ backgroundColor: "var(--background)" }}
    >
      {canvasReady && (
        <>
          <div className="absolute inset-0 overflow-hidden">
            <GraphCanvas
              canvas={canvas}
              queries={queries}
              onFirstPaint={handleGraphFirstPaint}
            />
          </div>

          <ShellPanels
            bundle={bundle}
            canvas={canvas}
            isContinuousColor={isContinuousColor}
            isSelectionLocked={isSelectionLocked}
            openPanels={openPanels}
            panelsVisible={panelsVisible}
            queries={queries}
            showColorLegend={showColorLegend}
            showSizeLegend={showSizeLegend}
            showTimeline={showTimeline}
            tableOpen={tableOpen}
            uiHidden={uiHidden}
          />
        </>
      )}

      <AnimatePresence>
        {showLoading && (
          <GraphBundleLoadingOverlay
            bundle={bundle}
            progress={progress}
            canvasReady={Boolean(canvas && queries)}
          />
        )}
      </AnimatePresence>

      {!showLoading && <Wordmark />}
      <AnimatePresence>
        {showSelectionPrompt && <MobileSelectionPrompt key="mobile-selection-prompt" />}
      </AnimatePresence>
      {!uiHidden && !overlayOpen && <PromptBox bundle={bundle} queries={queries ?? null} />}
    </div>
  );
}
