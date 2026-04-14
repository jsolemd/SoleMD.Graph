"use client";

import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, Home, LayoutList, List, Maximize2 } from "lucide-react";
import { WIKI_PANEL_PX } from "@/lib/density";
import {
  PANEL_TOP,
  PanelHeaderActions,
  PanelIconAction,
} from "@/features/graph/components/panels/PanelShell";
import { useDashboardStore } from "@/features/graph/stores";
import {
  resolveAdjacentFloatingPanelOffsets,
  resolveCenteredFloatingPanelOffsets,
  resolvePanelAnchorRect,
} from "@/features/graph/stores/dashboard-store";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

export function WikiNavigation() {
  const historyIndex = useWikiStore((s) => s.historyIndex);
  const routeHistory = useWikiStore((s) => s.routeHistory);
  const currentRoute = useWikiStore((s) => s.currentRoute);
  const goBack = useWikiStore((s) => s.goBack);
  const goForward = useWikiStore((s) => s.goForward);
  const navigateToGraph = useWikiStore((s) => s.navigateToGraph);
  const setBrowseOpen = useWikiStore((s) => s.setBrowseOpen);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < routeHistory.length - 1;
  const isOnGraph = currentRoute.kind === "graph";

  return (
    <PanelHeaderActions gap="tight">
      <PanelIconAction
        label="Back"
        icon={<ArrowLeft size={12} />}
        onClick={goBack}
        disabled={!canGoBack}
        aria-label="Go back"
      />
      <PanelIconAction
        label="Forward"
        icon={<ArrowRight size={12} />}
        onClick={goForward}
        disabled={!canGoForward}
        aria-label="Go forward"
      />
      <PanelIconAction
        label="Graph home"
        icon={<Home size={12} />}
        onClick={navigateToGraph}
        disabled={isOnGraph}
        aria-label="Graph home"
      />
      <PanelIconAction
        label="Browse pages"
        icon={<LayoutList size={12} />}
        onClick={() => setBrowseOpen(true)}
        aria-label="Browse pages"
      />
    </PanelHeaderActions>
  );
}

export function WikiContextActions() {
  const currentRoute = useWikiStore((s) => s.currentRoute);
  const setGlobalGraphOpen = useWikiStore((s) => s.setGlobalGraphOpen);
  const tocOpen = useWikiStore((s) => s.tocOpen);
  const setTocOpen = useWikiStore((s) => s.setTocOpen);
  const localGraphPopped = useWikiStore((s) => s.localGraphPopped);
  const setLocalGraphPopped = useWikiStore((s) => s.setLocalGraphPopped);
  const modulePopped = useWikiStore((s) => s.modulePopped);
  const setModulePopped = useWikiStore((s) => s.setModulePopped);
  const currentPageKind = useWikiStore((s) => s.currentPageKind);
  const savePanelPosition = useDashboardStore((s) => s.savePanelPosition);

  const isOnPage = currentRoute.kind === "page";
  const isModulePage = currentPageKind === "module";

  const handleOpenGlobalGraph = () => {
    const dashboardState = useDashboardStore.getState();
    const panelWidth = dashboardState.panelPositions["wiki-global-graph"]?.width ?? WIKI_PANEL_PX.globalGraphWidth;
    const panelHeight = dashboardState.panelPositions["wiki-global-graph"]?.height ?? WIKI_PANEL_PX.globalGraphHeight;
    const { x, y } = resolveCenteredFloatingPanelOffsets({
      state: dashboardState,
      panelId: "wiki-global-graph",
      panelWidth,
      panelHeight,
      panelTop: PANEL_TOP,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    savePanelPosition("wiki-global-graph", {
      x,
      y,
      width: panelWidth,
      height: panelHeight,
      docked: false,
    });
    setGlobalGraphOpen(true);
  };

  const handleToggleLocalGraph = () => {
    if (localGraphPopped) {
      setLocalGraphPopped(false);
      return;
    }

    const dashboardState = useDashboardStore.getState();
    const anchorRect = resolvePanelAnchorRect(dashboardState, "wiki", PANEL_TOP);
    const panelWidth = dashboardState.panelPositions["wiki-graph"]?.width ?? WIKI_PANEL_PX.localGraphWidth;
    const panelHeight = dashboardState.panelPositions["wiki-graph"]?.height;

    if (anchorRect) {
      const { x, y } = resolveAdjacentFloatingPanelOffsets({
        state: dashboardState,
        panelId: "wiki-graph",
        anchorRect,
        panelWidth,
        panelTop: PANEL_TOP,
        viewportWidth: window.innerWidth,
      });
      savePanelPosition("wiki-graph", {
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        docked: false,
      });
    }

    setLocalGraphPopped(true);
  };

  const handleToggleModule = () => {
    if (modulePopped) {
      setModulePopped(false);
      return;
    }

    const dashboardState = useDashboardStore.getState();
    const anchorRect = resolvePanelAnchorRect(dashboardState, "wiki", PANEL_TOP);
    const panelWidth = dashboardState.panelPositions["wiki-module"]?.width ?? WIKI_PANEL_PX.moduleWidth;
    const panelHeight = dashboardState.panelPositions["wiki-module"]?.height;

    if (anchorRect) {
      const { x, y } = resolveAdjacentFloatingPanelOffsets({
        state: dashboardState,
        panelId: "wiki-module",
        anchorRect,
        panelWidth,
        panelTop: PANEL_TOP,
        viewportWidth: window.innerWidth,
      });
      savePanelPosition("wiki-module", {
        x,
        y,
        width: panelWidth,
        height: panelHeight,
        docked: false,
      });
    }

    setModulePopped(true);
  };

  return (
    <PanelHeaderActions gap="tight">
      {isOnPage && (
        <PanelIconAction
          label="Table of Contents"
          icon={<List size={12} />}
          onClick={() => setTocOpen(!tocOpen)}
          aria-label="Table of Contents"
          aria-pressed={tocOpen}
        />
      )}
      {isOnPage && (
        <PanelIconAction
          label={localGraphPopped ? "Dock graph" : "Pop out graph"}
          icon={<ExternalLink size={12} />}
          onClick={handleToggleLocalGraph}
          aria-label={localGraphPopped ? "Dock graph" : "Pop out graph"}
        />
      )}
      {isOnPage && isModulePage && (
        <PanelIconAction
          label={modulePopped ? "Dock module" : "Pop out module"}
          icon={<BookOpen size={12} />}
          onClick={handleToggleModule}
          aria-label={modulePopped ? "Dock module" : "Pop out module"}
        />
      )}
      <PanelIconAction
        label="Global Graph"
        icon={<Maximize2 size={12} />}
        onClick={handleOpenGlobalGraph}
        aria-label="Global Graph"
      />
    </PanelHeaderActions>
  );
}
