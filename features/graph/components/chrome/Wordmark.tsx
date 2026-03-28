"use client";

import { useCallback, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { useGraphCamera, useGraphSelection, useGraphExport } from "@/features/graph/cosmograph";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  Camera,
  Database,
  Download,
  Eye,
  EyeOff,
  Filter,
  Info,
  LayoutPanelLeft,
  Maximize,
  Minus,
  Plus,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { iconBtnStyles } from "../panels/PanelShell";
import { settle } from "@/lib/motion";
import type { ActivePanel } from "@/features/graph/stores";

const PANEL_ITEMS: Array<{
  panel: Exclude<ActivePanel, null>;
  icon: typeof SlidersHorizontal;
  label: string;
}> = [
  { panel: "config", icon: SlidersHorizontal, label: "Configuration" },
  { panel: "filters", icon: Filter, label: "Filters" },
  { panel: "info", icon: Info, label: "Info" },
  { panel: "query", icon: Database, label: "SQL Explorer" },
];

export function Wordmark() {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const toggleUiHidden = useDashboardStore((s) => s.toggleUiHidden);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const togglePanelsVisible = useDashboardStore((s) => s.togglePanelsVisible);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const connectedSelect = useDashboardStore((s) => s.connectedSelect);
  const toggleConnectedSelect = useDashboardStore((s) => s.toggleConnectedSelect);
  const renderLinks = useDashboardStore((s) => s.renderLinks);
  const setRenderLinks = useDashboardStore((s) => s.setRenderLinks);
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const mapControls = useDashboardStore((s) => s.mapControls);
  const layerConfig = getLayerConfig(activeLayer);
  const layerHasLinks = layerConfig.hasLinks;
  const isMapLayer = layerConfig.rendererType === "maplibre";
  const { color: modeColor } = getModeConfig(mode);
  const [spinCount, setSpinCount] = useState(0);
  const { fitView, fitViewByIndices, zoomToPoint, zoomIn, zoomOut } = useGraphCamera();
  const { selectPoint } = useGraphSelection();
  const { captureScreenshot, exportDataAsCsv } = useGraphExport();

  // Context-aware links button:
  // - No selection: toggle link visibility (show/hide citation lines)
  // - Node selected: toggle connected select (expand/collapse neighbors)
  const handleLinksToggle = useCallback(() => {
    if (selectedNode && !isMapLayer) {
      const turningOn = !connectedSelect;
      toggleConnectedSelect();
      if (turningOn) {
        selectPoint(selectedNode.index, false, true);
      } else {
        selectPoint(selectedNode.index, false, false);
      }
    } else {
      setRenderLinks(!renderLinks);
    }
  }, [connectedSelect, isMapLayer, renderLinks, selectPoint, selectedNode, setRenderLinks, toggleConnectedSelect]);

  const linksButtonActive = selectedNode && !isMapLayer ? connectedSelect : renderLinks;
  const linksButtonLabel = selectedNode && !isMapLayer
    ? (connectedSelect ? "Hide connected nodes" : "Show connected nodes")
    : (renderLinks ? "Hide links" : "Show links");

  const handleFitView = useCallback(() => {
    if (isMapLayer) {
      mapControls?.fitView();
      return;
    }
    const selected = useDashboardStore.getState().selectedPointIndices;
    if (selected.length === 1) {
      zoomToPoint(selected[0], 250);
    } else if (selected.length > 1) {
      fitViewByIndices(selected, 250, 0.1);
    } else {
      fitView(250, 0.1);
    }
  }, [fitView, fitViewByIndices, isMapLayer, mapControls, zoomToPoint]);

  const handleZoomIn = useCallback(() => {
    if (isMapLayer) {
      mapControls?.zoomIn();
      return;
    }
    zoomIn();
  }, [isMapLayer, mapControls, zoomIn]);

  const handleZoomOut = useCallback(() => {
    if (isMapLayer) {
      mapControls?.zoomOut();
      return;
    }
    zoomOut();
  }, [isMapLayer, mapControls, zoomOut]);

  const handleScreenshot = useCallback(() => {
    captureScreenshot();
  }, [captureScreenshot]);

  const handleExport = useCallback(async () => {
    await exportDataAsCsv();
  }, [exportDataAsCsv]);

  return (
    <>
      {/* Left: logo + panel icon row */}
      <div className="absolute top-3 left-3 z-40 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {!uiHidden && (
            <Tooltip label="About SoleMD" position="right" withArrow>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent p-0 transition-opacity hover:opacity-80"
                onClick={() => togglePanel("about")}
                aria-label="About SoleMD"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-300"
                  style={{ backgroundColor: modeColor }}
                >
                  <BrainCircuit size={16} color="white" />
                </div>
                <span
                  className="text-lg font-semibold select-none"
                  style={{ color: "var(--graph-wordmark-text)" }}
                >
                  Sole
                  <span
                    className="transition-colors duration-300"
                    style={{ color: modeColor }}
                  >
                    MD
                  </span>
                </span>
              </button>
            </Tooltip>
          )}
        </div>

        <AnimatePresence>
          {panelsVisible && !uiHidden && (
            <motion.div
              className="flex items-center gap-0.5"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {PANEL_ITEMS.map(({ panel, icon: Icon, label }) => {
                const isActive = activePanel === panel;
                return (
                  <Tooltip key={panel} label={label} position="bottom" withArrow>
                    <ActionIcon
                      variant="transparent"
                      size="lg"
                      radius="xl"
                      className="graph-icon-btn"
                      styles={iconBtnStyles}
                      onClick={() => togglePanel(panel)}
                      aria-pressed={isActive}
                      aria-label={label}
                    >
                      <Icon />
                    </ActionIcon>
                  </Tooltip>
                );
              })}

            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: toolbar buttons */}
      <div data-wordmark-toolbar className="absolute right-3 top-3 z-40 flex items-center gap-0.5">
        {!uiHidden && (
          <>
            {layerHasLinks && (
              <>
                <Tooltip label={linksButtonLabel} position="bottom" withArrow>
                  <ActionIcon
                    variant="transparent"
                    size="lg"
                    radius="xl"
                    className="graph-icon-btn"
                    styles={iconBtnStyles}
                    onClick={handleLinksToggle}
                    aria-pressed={linksButtonActive}
                    aria-label={linksButtonLabel}
                  >
                    <Share2 />
                  </ActionIcon>
                </Tooltip>
                <div className="mx-1 h-5 w-px" style={{ backgroundColor: "var(--graph-panel-border)" }} />
              </>
            )}
            <Tooltip label="Fit view" position="bottom" withArrow>
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="xl"
                className="graph-icon-btn"
                styles={iconBtnStyles}
                onClick={handleFitView}
                aria-label="Fit view"
              >
                <Maximize />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Zoom in" position="bottom" withArrow>
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="xl"
                className="graph-icon-btn"
                styles={iconBtnStyles}
                onClick={handleZoomIn}
                aria-label="Zoom in"
              >
                <Plus />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Zoom out" position="bottom" withArrow>
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="xl"
                className="graph-icon-btn"
                styles={iconBtnStyles}
                onClick={handleZoomOut}
                aria-label="Zoom out"
              >
                <Minus />
              </ActionIcon>
            </Tooltip>
            {!isMapLayer && (
              <>
                <Tooltip label="Save screenshot" position="bottom" withArrow>
                  <ActionIcon
                    variant="transparent"
                    size="lg"
                    radius="xl"
                    className="graph-icon-btn"
                    styles={iconBtnStyles}
                    onClick={handleScreenshot}
                    aria-label="Save screenshot"
                  >
                    <Camera />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Export data" position="bottom" withArrow>
                  <ActionIcon
                    variant="transparent"
                    size="lg"
                    radius="xl"
                    className="graph-icon-btn"
                    styles={iconBtnStyles}
                    onClick={handleExport}
                    aria-label="Export data"
                  >
                    <Download />
                  </ActionIcon>
                </Tooltip>
              </>
            )}

            <div className="mx-1 h-5 w-px" style={{ backgroundColor: "var(--graph-panel-border)" }} />

            <Tooltip
              label={panelsVisible ? "Hide panels" : "Show panels"}
              position="bottom"
              withArrow
            >
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="xl"
                className="graph-icon-btn"
                styles={iconBtnStyles}
                onClick={togglePanelsVisible}
                aria-pressed={panelsVisible}
                aria-label={panelsVisible ? "Hide panels" : "Show panels"}
              >
                <LayoutPanelLeft />
              </ActionIcon>
            </Tooltip>
          </>
        )}

        <Tooltip
          label={uiHidden ? "Show graph UI" : "Hide graph UI"}
          position="bottom"
          withArrow
        >
          <ActionIcon
            variant="transparent"
            size="lg"
            radius="xl"
            className="graph-icon-btn"
            styles={iconBtnStyles}
            onClick={() => {
              setSpinCount((current) => current + 1);
              toggleUiHidden();
            }}
            aria-label={uiHidden ? "Show graph UI" : "Hide graph UI"}
          >
            <motion.div
              className="flex items-center justify-center"
              animate={{ rotate: spinCount * 360 }}
              transition={settle}
            >
              {uiHidden ? <Eye /> : <EyeOff />}
            </motion.div>
          </ActionIcon>
        </Tooltip>

        <div className="mx-1 h-5 w-px" style={{ backgroundColor: "var(--graph-panel-border)" }} />

        <ThemeToggle />
      </div>
    </>
  );
}
