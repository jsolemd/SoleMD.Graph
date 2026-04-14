"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import { selectBottomClearance, useDashboardStore } from "@/features/graph/stores";
import { APP_CHROME_PX } from "@/lib/density";
import { crisp } from "@/lib/motion";
import { panelSurfaceStyle } from "../panels/PanelShell";
import { useShellVariantContext } from "./ShellVariantContext";
import type { PanelId } from "@/features/graph/stores";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import type { GraphBundle, GraphBundleQueries } from "@/features/graph/types";

const legendStyle = {
  ...panelSurfaceStyle,
  borderRadius: 12,
  padding: 8,
} satisfies CSSProperties;

const ConfigPanel = dynamic(
  () => import("../explore/ConfigPanel").then((mod) => mod.ConfigPanel),
  { loading: () => null },
);
const FiltersPanel = dynamic(
  () => import("../explore/FiltersPanel").then((mod) => mod.FiltersPanel),
  { loading: () => null },
);
const InfoPanel = dynamic(
  () => import("../explore/info-panel").then((mod) => mod.InfoPanel),
  { loading: () => null },
);
const QueryPanel = dynamic(
  () => import("../explore/query-panel").then((mod) => mod.QueryPanel),
  { loading: () => null },
);
const DataTable = dynamic(
  () => import("../explore/data-table").then((mod) => mod.DataTable),
  { loading: () => null },
);
const DetailPanel = dynamic(
  () => import("../panels/DetailPanel").then((mod) => mod.DetailPanel),
  { loading: () => null },
);
const RagResponsePanel = dynamic(
  () => import("../panels/prompt/RagResponsePanel").then((mod) => mod.RagResponsePanel),
  { loading: () => null },
);
const AboutPanel = dynamic(
  () => import("../panels/AboutPanel").then((mod) => mod.AboutPanel),
  { loading: () => null },
);
const WikiPanel = dynamic(
  () => import("@/features/wiki/components/WikiPanel").then((mod) => mod.WikiPanel),
  { loading: () => null },
);
const TimelineBar = dynamic(
  () => import("../chrome/TimelineBar").then((mod) => mod.TimelineBar),
  { loading: () => null },
);
const CanvasControls = dynamic(
  () => import("../explore/CanvasControls").then((mod) => mod.CanvasControls),
  { loading: () => null },
);
const ColorLegends = dynamic(
  () =>
    import("@/features/graph/cosmograph/widgets/ColorLegends").then(
      (mod) => mod.ColorLegends,
    ),
  { loading: () => null },
);
const SizeLegend = dynamic(
  () =>
    import("@/features/graph/cosmograph/widgets/SizeLegend").then(
      (mod) => mod.SizeLegend,
    ),
  { loading: () => null },
);

export interface ShellPanelsProps {
  bundle: GraphBundle;
  canvas: GraphCanvasSource;
  isContinuousColor: boolean;
  isSelectionLocked: boolean;
  openPanels: Record<PanelId, boolean>;
  panelsVisible: boolean;
  queries: GraphBundleQueries;
  showColorLegend: boolean;
  showSizeLegend: boolean;
  showTimeline: boolean;
  tableOpen: boolean;
  uiHidden: boolean;
}

export function ShellPanels({
  bundle,
  canvas,
  isContinuousColor,
  isSelectionLocked,
  openPanels,
  panelsVisible,
  queries,
  showColorLegend,
  showSizeLegend,
  showTimeline,
  tableOpen,
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
  const ragPanelOpen = useDashboardStore((state) => state.ragPanelOpen);

  return (
    <>
      <AnimatePresence>
        {!uiHidden && panelsVisible && openPanels.config && (
          <ConfigPanel key="config" />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!uiHidden && panelsVisible && openPanels.filters && (
          <FiltersPanel
            key="filters"
            queries={queries}
            bundleChecksum={bundle.bundleChecksum}
            overlayRevision={canvas.overlayRevision}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!uiHidden && panelsVisible && openPanels.info && (
          <InfoPanel key="info" queries={queries} canvas={canvas} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!uiHidden && panelsVisible && openPanels.query && (
          <QueryPanel
            key="query"
            runReadOnlyQuery={queries.runReadOnlyQuery}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!uiHidden && panelsVisible && openPanels.wiki && (
          <WikiPanel key="wiki" bundle={bundle} queries={queries} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!uiHidden && <DetailPanel bundle={bundle} queries={queries} />}
      </AnimatePresence>

      <AnimatePresence>
        {!uiHidden && ragPanelOpen && <RagResponsePanel key="rag-response" />}
      </AnimatePresence>

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
      <AnimatePresence>
        {!uiHidden && tableOpen && (
          <DataTable queries={queries} overlayRevision={canvas.overlayRevision} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!uiHidden && openPanels.about && <AboutPanel />}
      </AnimatePresence>
    </>
  );
}
