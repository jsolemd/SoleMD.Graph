"use client";

import { Badge } from "@mantine/core";
import { motion, AnimatePresence } from "framer-motion";
import { snappy } from "@/lib/motion";
import { formatNumber } from "@/lib/helpers";
import { badgeOutlineStyles } from "../../PanelShell";

interface ScopeIndicatorProps {
  scopedCount: number;
  totalCount: number;
  hasSelection: boolean;
  selectionSource: string | null;
}

function formatSelectionSource(sourceId: string | null) {
  if (!sourceId) return "Canvas";
  if (sourceId.startsWith("filter:"))
    return `${sourceId.replace("filter:", "")} filter`;
  if (sourceId.startsWith("timeline:"))
    return `${sourceId.replace("timeline:", "")} timeline`;
  if (sourceId.startsWith("CosmographSearch")) return "Search";
  if (sourceId.startsWith("CosmographTypeColorLegend")) return "Color legend";
  if (sourceId.startsWith("CosmographRangeColorLegend")) return "Color range";
  if (sourceId.startsWith("CosmographSizeLegend")) return "Size legend";
  // Cosmograph internal selection sources (e.g. "pointsSelectionClient--nsjbw3h")
  if (sourceId.startsWith("pointsSelectionClient")) return "Canvas";
  return sourceId;
}

export function ScopeIndicator({
  scopedCount,
  totalCount,
  hasSelection,
  selectionSource,
}: ScopeIndicatorProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={hasSelection ? "selection" : "dataset"}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={snappy}
      >
        <Badge
          variant="outline"
          size="sm"
          styles={badgeOutlineStyles}
        >
          {hasSelection
            ? `${formatNumber(scopedCount)} of ${formatNumber(totalCount)} selected · ${formatSelectionSource(selectionSource)}`
            : "Dataset"}
        </Badge>
      </motion.div>
    </AnimatePresence>
  );
}
