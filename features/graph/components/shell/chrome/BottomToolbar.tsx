"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
import { ActionIcon, Tooltip } from "@mantine/core";
import {
  Camera,
  GanttChart,
  Maximize,
  Palette,
  Share2,
  Table2,
  Tag,
} from "lucide-react";
import {
  useGraphCamera,
  useGraphExport,
  useGraphInstance,
  useGraphSelection,
} from "@/features/graph/cosmograph";
import {
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { iconBtnStyles } from "../../panels/PanelShell";
import { useBottomChromeFloat } from "./useBottomChromeFloat";
import { useGraphControlContrast } from "../../chrome/use-graph-control-contrast";

const Divider = () => (
  <div
    className="mx-2 h-5 w-px"
    style={{ backgroundColor: "var(--graph-panel-border)" }}
  />
);

export function BottomToolbar() {
  const cosmograph = useGraphInstance();
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const toggleTimeline = useDashboardStore((s) => s.toggleTimeline);
  const toggleTable = useDashboardStore((s) => s.toggleTable);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const connectedSelect = useDashboardStore((s) => s.connectedSelect);
  const toggleConnectedSelect = useDashboardStore((s) => s.toggleConnectedSelect);
  const renderLinks = useDashboardStore((s) => s.renderLinks);
  const setRenderLinks = useDashboardStore((s) => s.setRenderLinks);
  const showPointLabels = useDashboardStore((s) => s.showPointLabels);
  const setShowPointLabels = useDashboardStore((s) => s.setShowPointLabels);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const setShowColorLegend = useDashboardStore((s) => s.setShowColorLegend);
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const { fitView, fitViewByIndices, zoomToPoint } = useGraphCamera();
  const { selectPoint, getSelectedPointIndices } = useGraphSelection();
  const { captureScreenshot } = useGraphExport();
  const { contrastAttr, contrastBlurClass } = useGraphControlContrast();
  const floatProps = useBottomChromeFloat();

  const layerHasLinks = getLayerConfig(activeLayer).hasLinks;

  const handleFitView = useCallback(() => {
    const selected = getSelectedPointIndices();
    if (selected.length === 1) {
      zoomToPoint(selected[0], 250);
      return;
    }
    if (selected.length > 1) {
      fitViewByIndices(selected, 250, 0.1);
      return;
    }
    fitView(250, 0.1);
  }, [fitView, fitViewByIndices, getSelectedPointIndices, zoomToPoint]);

  const handleLinksToggle = useCallback(() => {
    if (selectedNode) {
      const turningOn = !connectedSelect;
      toggleConnectedSelect();
      selectPoint(selectedNode.index, false, turningOn);
      return;
    }
    setRenderLinks(!renderLinks);
  }, [
    connectedSelect,
    renderLinks,
    selectPoint,
    selectedNode,
    setRenderLinks,
    toggleConnectedSelect,
  ]);

  const linksButtonActive = selectedNode ? connectedSelect : renderLinks;
  const linksButtonLabel = selectedNode
    ? connectedSelect
      ? "Hide connected nodes"
      : "Show connected nodes"
    : renderLinks
      ? "Hide links"
      : "Show links";

  return (
    <motion.div
      data-bottom-viewport-toolbar
      className={`absolute left-3 z-20 flex items-center gap-0.5 ${contrastBlurClass}`}
      {...floatProps}
      {...contrastAttr}
    >
      <Tooltip
        label={showTimeline ? "Hide timeline" : "Show timeline"}
        position="top"
        withArrow
      >
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => {
            if (showTimeline) {
              clearSelectionClause(
                cosmograph?.pointsSelection,
                createSelectionSource(`timeline:${timelineColumn}`),
              );
              setTimelineSelection(undefined);
            }
            toggleTimeline();
          }}
          aria-pressed={showTimeline}
          aria-label={showTimeline ? "Hide timeline" : "Show timeline"}
        >
          <GanttChart size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>

      <Tooltip
        label={tableOpen ? "Hide table" : "Show table"}
        position="top"
        withArrow
      >
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={toggleTable}
          aria-pressed={tableOpen}
          aria-label={tableOpen ? "Hide table" : "Show table"}
        >
          <Table2 size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>

      <Divider />

      <Tooltip label="Fit view" position="top" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={handleFitView}
          aria-label="Fit view"
        >
          <Maximize size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>

      <Tooltip
        label={showPointLabels ? "Hide labels" : "Show labels"}
        position="top"
        withArrow
      >
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => setShowPointLabels(!showPointLabels)}
          aria-pressed={showPointLabels}
          aria-label={showPointLabels ? "Hide labels" : "Show labels"}
        >
          <Tag size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>

      <Tooltip
        label={showColorLegend ? "Hide legend" : "Show legend"}
        position="top"
        withArrow
      >
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => setShowColorLegend(!showColorLegend)}
          aria-pressed={showColorLegend}
          aria-label={showColorLegend ? "Hide legend" : "Show legend"}
        >
          <Palette size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>

      {layerHasLinks && (
        <Tooltip label={linksButtonLabel} position="top" withArrow>
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
            <Share2 size={16} strokeWidth={1.5} />
          </ActionIcon>
        </Tooltip>
      )}

      <Divider />

      <Tooltip label="Save screenshot" position="top" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => captureScreenshot()}
          aria-label="Save screenshot"
        >
          <Camera size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>

      {/* Selection tools (rect/poly/clear/lock) portal in here via CanvasControls */}
    </motion.div>
  );
}
