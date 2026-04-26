"use client";

import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import type { CSSProperties } from "react";
import { useDashboardStore } from "@/features/graph/stores";
import type { PanelId } from "@/features/graph/stores";
import type { GraphBundle, GraphBundleQueries } from "@solemd/graph";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import { useShellVariantContext } from "./ShellVariantContext";
import { promptSurfaceStyle } from "../panels/PanelShell";

const promptPlaceholderStyle: CSSProperties = {
  ...promptSurfaceStyle,
};

function DesktopPromptBoxPlaceholder() {
  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
      <div
        className="h-14 w-[min(600px,90vw)] animate-pulse rounded-full backdrop-blur-xl"
        style={promptPlaceholderStyle}
      />
    </div>
  );
}

function MobilePromptBoxPlaceholder() {
  return (
    <div className="fixed inset-x-2 bottom-4 z-50">
      <div
        className="h-16 w-full animate-pulse rounded-[1.75rem] backdrop-blur-xl"
        style={promptPlaceholderStyle}
      />
    </div>
  );
}

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
const DesktopPromptBox = dynamic(
  () => import("../panels/PromptBox").then((mod) => mod.PromptBox),
  { loading: () => <DesktopPromptBoxPlaceholder /> },
);
const MobilePromptBox = dynamic(
  () => import("../panels/PromptBox").then((mod) => mod.PromptBox),
  { loading: () => <MobilePromptBoxPlaceholder /> },
);

export interface GraphPanelsLayerProps {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
  canvas: GraphCanvasSource;
}

/**
 * Owns every renderer-clean panel mount: panel windows that read from the
 * dashboard store + DuckDB and don't reach into Cosmograph WebGL state.
 *
 * Both the 2D shell (ShellPanels → DesktopShell/MobileShell) and the 3D orb
 * (OrbSurface) render this. Cosmograph-bound widgets (CanvasControls, color/
 * size legends, TimelineBar, native filter widgets) stay in ShellPanels and
 * remain 2D-only until the F/G slices land their orb counterparts.
 */
export function GraphPanelsLayer({
  bundle,
  queries,
  canvas,
}: GraphPanelsLayerProps) {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";

  const openPanels = useDashboardStore((s) => s.openPanels);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const ragPanelOpen = useDashboardStore((s) => s.ragPanelOpen);
  const detailPanelOpen = useDashboardStore((s) => s.detailPanelOpen);

  const primaryPanelOpen = (Object.keys(openPanels) as PanelId[]).some(
    (panel) => openPanels[panel],
  );
  const overlayOpen = primaryPanelOpen || ragPanelOpen || detailPanelOpen;
  // Mobile hides the prompt while any overlay is open so the panel can
  // claim the full viewport; desktop keeps it docked because the panels
  // float above the canvas. Mirrors the prior DesktopShell/MobileShell
  // branching exactly.
  const showPromptBox = !uiHidden && (!isMobile || !overlayOpen);

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

      <AnimatePresence>
        {!uiHidden && tableOpen && (
          <DataTable queries={queries} overlayRevision={canvas.overlayRevision} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!uiHidden && openPanels.about && <AboutPanel />}
      </AnimatePresence>

      {showPromptBox && (
        isMobile
          ? <MobilePromptBox bundle={bundle} queries={queries} />
          : <DesktopPromptBox bundle={bundle} queries={queries} />
      )}
    </>
  );
}
