"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { Wordmark } from "../chrome/Wordmark";
import { GraphBundleLoadingOverlay } from "./loading";
import { preloadChromeChunks } from "./preload-chrome-chunks";
import { ShellPanels } from "./ShellPanels";
import type { DashboardShellController } from "./use-dashboard-shell-controller";

export function DesktopShell(state: DashboardShellController) {
  const {
    bundle,
    canvas,
    handleGraphFirstPaint,
    isContinuousColor,
    isSelectionLocked,
    loading,
    panelsVisible,
    progress,
    queries,
    showColorLegend,
    showLoading,
    showSizeLegend,
    showTimeline,
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
            panelsVisible={panelsVisible}
            queries={queries}
            showColorLegend={showColorLegend}
            showSizeLegend={showSizeLegend}
            showTimeline={showTimeline}
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
    </div>
  );
}
