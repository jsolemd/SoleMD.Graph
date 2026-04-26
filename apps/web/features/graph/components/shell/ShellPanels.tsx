"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import { selectBottomClearance, useDashboardStore } from "@/features/graph/stores";
import { APP_CHROME_PX } from "@/lib/density";
import { crisp } from "@/lib/motion";
import { panelSurfaceStyle } from "../panels/PanelShell";
import { useShellVariantContext } from "./ShellVariantContext";
import { GraphPanelsLayer } from "./GraphPanelsLayer";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import type { GraphBundle, GraphBundleQueries } from "@solemd/graph";

const legendStyle = {
  ...panelSurfaceStyle,
  borderRadius: 12,
  padding: 8,
} satisfies CSSProperties;

const TimelineBar = dynamic(
  () => import("../chrome/TimelineBar").then((mod) => mod.TimelineBar),
  { loading: () => null },
);
const CanvasControls = dynamic(
  () => import("../explore/CanvasControls").then((mod) => mod.CanvasControls),
  { loading: () => null },
);
const ColorLegends = dynamic(
  () => import("@solemd/graph/cosmograph").then((mod) => mod.ColorLegends),
  { loading: () => null },
);
const SizeLegend = dynamic(
  () => import("@solemd/graph/cosmograph").then((mod) => mod.SizeLegend),
  { loading: () => null },
);

export interface ShellPanelsProps {
  bundle: GraphBundle;
  canvas: GraphCanvasSource;
  isContinuousColor: boolean;
  isSelectionLocked: boolean;
  panelsVisible: boolean;
  queries: GraphBundleQueries;
  showColorLegend: boolean;
  showSizeLegend: boolean;
  showTimeline: boolean;
  uiHidden: boolean;
}

export function ShellPanels({
  bundle,
  canvas,
  isContinuousColor,
  isSelectionLocked,
  panelsVisible,
  queries,
  showColorLegend,
  showSizeLegend,
  showTimeline,
  uiHidden,
}: ShellPanelsProps) {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const bottomClearance = useDashboardStore(selectBottomClearance);
  const legendBottom = APP_CHROME_PX.edgeMargin + bottomClearance;
  const legendFloat = {
    initial: { bottom: legendBottom },
    animate: { bottom: legendBottom },
    transition: { bottom: crisp },
  };

  return (
    <>
      <GraphPanelsLayer bundle={bundle} queries={queries} canvas={canvas} />

      {!uiHidden && (showColorLegend || showSizeLegend) && (
        <motion.div
          className={`absolute right-4 flex flex-col gap-2 ${isMobile ? "z-[60]" : "z-30"}`}
          {...legendFloat}
        >
          {showSizeLegend && (
            <SizeLegend selectOnClick={!isSelectionLocked} style={legendStyle} />
          )}
          {showColorLegend && (
            <ColorLegends
              variant={isContinuousColor ? "range" : "type"}
              selectOnClick={!isSelectionLocked}
              style={legendStyle}
            />
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {!uiHidden && panelsVisible && <CanvasControls queries={queries} />}
      </AnimatePresence>

      <AnimatePresence>
        {!uiHidden && showTimeline && <TimelineBar />}
      </AnimatePresence>
    </>
  );
}
