"use client";

import { motion } from "framer-motion";
import {
  CosmographButtonFitView,
  CosmographButtonPolygonalSelection,
  CosmographButtonRectangularSelection,
  CosmographButtonZoomInOut,
} from "@cosmograph/react";
import { PANEL_SPRING } from "../PanelShell";

/** Borderless style for individual buttons inside the card wrapper. */
const buttonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "none",
  backgroundColor: "transparent",
};

export function CanvasControls() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={PANEL_SPRING}
      className="absolute bottom-4 right-4 z-30 flex flex-col gap-1 rounded-2xl p-1"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        border: "1px solid var(--graph-panel-border)",
        boxShadow: "var(--graph-panel-shadow)",
      }}
    >
      <CosmographButtonFitView style={buttonStyle} />
      <CosmographButtonRectangularSelection style={buttonStyle} />
      <CosmographButtonPolygonalSelection style={buttonStyle} />
      <CosmographButtonZoomInOut style={buttonStyle} />
    </motion.div>
  );
}
