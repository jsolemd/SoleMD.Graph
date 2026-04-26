"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { useDashboardStore, type RendererMode } from "@/features/graph/stores";
import { graphControlBtnStyles } from "../panels/PanelShell";

const MOBILE_ICON_SIZE = 40;

/**
 * Single-button 2D⇄3D renderer toggle. Lives inside the right-side pill
 * of both ChromeBar (2D) and OrbChromeBar (3D) so the control reads as
 * regular chrome instead of a floating SegmentedControl. The label
 * always names the *target* mode — clicking the button switches to it.
 */
export function RendererToggleButton({
  isMobile,
  grouped = false,
}: {
  isMobile: boolean;
  grouped?: boolean;
}) {
  const rendererMode = useDashboardStore((s) => s.rendererMode);
  const setRendererMode = useDashboardStore((s) => s.setRendererMode);

  const targetMode: RendererMode = rendererMode === "3d" ? "2d" : "3d";
  const targetLabel = targetMode.toUpperCase();
  const ariaLabel = `Switch to ${targetLabel}`;

  const btn = (
    <ActionIcon
      variant="transparent"
      size={isMobile ? MOBILE_ICON_SIZE : "lg"}
      radius="xl"
      className="graph-icon-btn"
      styles={graphControlBtnStyles}
      onClick={() => setRendererMode(targetMode)}
      aria-label={ariaLabel}
      data-testid="renderer-mode-toggle"
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.4,
        }}
      >
        {targetLabel}
      </span>
    </ActionIcon>
  );

  if (isMobile || grouped) return btn;

  return (
    <Tooltip label={ariaLabel} position="bottom" withArrow>
      {btn}
    </Tooltip>
  );
}
