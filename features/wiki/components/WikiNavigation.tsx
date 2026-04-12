"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { ArrowLeft, ArrowRight, Home, Maximize2, List, ExternalLink, BookOpen } from "lucide-react";
import { PANEL_TOP, iconBtnStyles } from "@/features/graph/components/panels/PanelShell";
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
  const setGlobalGraphOpen = useWikiStore((s) => s.setGlobalGraphOpen);
  const tocOpen = useWikiStore((s) => s.tocOpen);
  const setTocOpen = useWikiStore((s) => s.setTocOpen);
  const localGraphPopped = useWikiStore((s) => s.localGraphPopped);
  const setLocalGraphPopped = useWikiStore((s) => s.setLocalGraphPopped);
  const modulePopped = useWikiStore((s) => s.modulePopped);
  const setModulePopped = useWikiStore((s) => s.setModulePopped);
  const currentPageKind = useWikiStore((s) => s.currentPageKind);
  const savePanelPosition = useDashboardStore((s) => s.savePanelPosition);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < routeHistory.length - 1;
  const isOnGraph = currentRoute.kind === "graph";
  const isOnPage = currentRoute.kind === "page";
  const isModulePage = currentPageKind === "module";

  const handleOpenGlobalGraph = () => {
    const dashboardState = useDashboardStore.getState();
    const panelWidth = dashboardState.panelPositions["wiki-global-graph"]?.width ?? 960;
    const panelHeight = dashboardState.panelPositions["wiki-global-graph"]?.height ?? 720;
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
    const panelWidth = dashboardState.panelPositions["wiki-graph"]?.width ?? 320;
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
    const panelWidth = dashboardState.panelPositions["wiki-module"]?.width ?? 680;
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
    <div className="flex items-center gap-0.5">
      <Tooltip label="Graph home" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={navigateToGraph}
          disabled={isOnGraph}
          aria-label="Graph home"
        >
          <Home size={12} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Back" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={goBack}
          disabled={!canGoBack}
          aria-label="Go back"
        >
          <ArrowLeft size={12} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Forward" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={goForward}
          disabled={!canGoForward}
          aria-label="Go forward"
        >
          <ArrowRight size={12} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Global Graph" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={handleOpenGlobalGraph}
          aria-label="Global Graph"
        >
          <Maximize2 size={12} />
        </ActionIcon>
      </Tooltip>
      {isOnPage && (
        <>
          <Tooltip label="Table of Contents" position="bottom" withArrow>
            <ActionIcon
              variant="transparent"
              size={24}
              radius="xl"
              className="graph-icon-btn"
              styles={iconBtnStyles}
              onClick={() => setTocOpen(!tocOpen)}
              aria-label="Table of Contents"
              aria-pressed={tocOpen}
            >
              <List size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={localGraphPopped ? "Dock graph" : "Pop out graph"}
            position="bottom"
            withArrow
          >
            <ActionIcon
              variant="transparent"
              size={24}
              radius="xl"
              className="graph-icon-btn"
              styles={iconBtnStyles}
              onClick={handleToggleLocalGraph}
              aria-label={localGraphPopped ? "Dock graph" : "Pop out graph"}
            >
              <ExternalLink size={12} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
      {isOnPage && isModulePage && (
        <Tooltip
          label={modulePopped ? "Dock module" : "Pop out module"}
          position="bottom"
          withArrow
        >
          <ActionIcon
            variant="transparent"
            size={24}
            radius="xl"
            className="graph-icon-btn"
            styles={iconBtnStyles}
            onClick={handleToggleModule}
            aria-label={modulePopped ? "Dock module" : "Pop out module"}
          >
            <BookOpen size={12} />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  );
}
