"use client";

import { motion } from "framer-motion";
import { ActionIcon } from "@mantine/core";
import { Info, X } from "lucide-react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useGraphSelection } from "@/features/graph/cosmograph";
import { promptSurfaceStyle } from "../panels/PanelShell";
import { pop } from "@/lib/motion";

/**
 * Mobile-only affordance shown when a point is selected but the detail panel
 * is dismissed. Previews the selection and lets the user re-open the detail
 * panel or clear the selection without tapping empty canvas (which also pans
 * on touch). Desktop users get the detail panel directly on click.
 */
export function MobileSelectionPrompt() {
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const setDetailPanelOpen = useDashboardStore((s) => s.setDetailPanelOpen);
  const { clearFocusedPoint, unselectAllPoints } = useGraphSelection();

  if (!selectedNode) return null;

  const title = selectedNode.displayPreview?.split("\n")[0] || selectedNode.id;

  const handleOpen = () => setDetailPanelOpen(true);
  const handleClear = () => {
    selectNode(null);
    clearFocusedPoint();
    unselectAllPoints();
  };

  return (
    <motion.div
      {...pop}
      className="fixed inset-x-2 z-40"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.25rem)",
      }}
    >
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-xl"
        style={{
          ...promptSurfaceStyle,
          borderRadius: 9999,
        }}
      >
        <ActionIcon
          variant="transparent"
          size="md"
          radius="xl"
          onClick={handleOpen}
          aria-label="Show selection details"
          style={{ color: "var(--graph-panel-text)" }}
        >
          <Info size={16} />
        </ActionIcon>
        <button
          type="button"
          onClick={handleOpen}
          className="flex-1 truncate text-left text-sm"
          style={{ color: "var(--graph-panel-text)" }}
        >
          {title}
        </button>
        <ActionIcon
          variant="transparent"
          size="md"
          radius="xl"
          onClick={handleClear}
          aria-label="Clear selection"
          style={{ color: "var(--graph-panel-text-muted)" }}
        >
          <X size={14} />
        </ActionIcon>
      </div>
    </motion.div>
  );
}
