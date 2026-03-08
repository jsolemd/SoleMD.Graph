"use client";

import { motion } from "framer-motion";
import {
  CosmographButtonFitView,
  CosmographButtonPolygonalSelection,
  CosmographButtonRectangularSelection,
  CosmographButtonZoomInOut,
} from "@cosmograph/react";

export function CanvasControls() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-4 right-4 z-30 flex flex-col gap-1"
    >
      <CosmographButtonFitView style={controlStyle} />
      <CosmographButtonRectangularSelection style={controlStyle} />
      <CosmographButtonPolygonalSelection style={controlStyle} />
      <CosmographButtonZoomInOut style={controlStyle} />
    </motion.div>
  );
}

const controlStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--graph-panel-border)",
  backgroundColor: "var(--graph-panel-bg)",
};
