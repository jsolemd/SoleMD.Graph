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
import type { DashboardShellController } from "./use-dashboard-shell-controller";

const promptPlaceholderStyle: CSSProperties = {
  ...promptSurfaceStyle,
};

function PromptBoxLoadingPlaceholder() {
  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
      <div
        className="h-14 w-[min(600px,90vw)] animate-pulse rounded-full backdrop-blur-xl"
        style={promptPlaceholderStyle}
      />
    </div>
  );
}

const PromptBox = dynamic(
  () => import("../panels/PromptBox").then((mod) => mod.PromptBox),
  { loading: () => <PromptBoxLoadingPlaceholder /> },
);

export function DesktopShell(state: DashboardShellController) {
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

  const canvasReady = !loading && canvas != null && queries != null;

  useEffect(() => {
    if (!canvasReady) {
      return;
    }

    preloadChromeChunks();
  }, [canvasReady]);

  return (
    <div
      className="fixed inset-0"
      style={{ backgroundColor: "var(--graph-bg)" }}
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
      {!uiHidden && <PromptBox bundle={bundle} queries={queries ?? null} />}
    </div>
  );
}
