"use client";

import { useCallback } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { Camera, Maximize, Minus, Plus, Share2 } from "lucide-react";
import {
  useGraphCamera,
  useGraphExport,
  useGraphSelection,
} from "@/features/graph/cosmograph";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { iconBtnStyles } from "../panels/PanelShell";

export function WordmarkGraphControls() {
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const connectedSelect = useDashboardStore((state) => state.connectedSelect);
  const toggleConnectedSelect = useDashboardStore(
    (state) => state.toggleConnectedSelect,
  );
  const renderLinks = useDashboardStore((state) => state.renderLinks);
  const setRenderLinks = useDashboardStore((state) => state.setRenderLinks);
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const { fitView, fitViewByIndices, zoomToPoint, zoomIn, zoomOut } =
    useGraphCamera();
  const { selectPoint, getSelectedPointIndices } = useGraphSelection();
  const { captureScreenshot } = useGraphExport();
  const layerHasLinks = getLayerConfig(activeLayer).hasLinks;

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

  const linksButtonActive = selectedNode ? connectedSelect : renderLinks;
  const linksButtonLabel = selectedNode
    ? connectedSelect
      ? "Hide connected nodes"
      : "Show connected nodes"
    : renderLinks
      ? "Hide links"
      : "Show links";

  return (
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
          <div
            className="mx-1 h-5 w-px"
            style={{ backgroundColor: "var(--graph-panel-border)" }}
          />
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
          onClick={() => zoomIn()}
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
          onClick={() => zoomOut()}
          aria-label="Zoom out"
        >
          <Minus />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Save screenshot" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => captureScreenshot()}
          aria-label="Save screenshot"
        >
          <Camera />
        </ActionIcon>
      </Tooltip>
      <div
        className="mx-1 h-5 w-px"
        style={{ backgroundColor: "var(--graph-panel-border)" }}
      />
    </>
  );
}
