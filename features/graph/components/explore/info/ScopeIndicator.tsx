"use client";

import { Badge } from "@mantine/core";
import { motion, AnimatePresence } from "framer-motion";
import type { InfoScope } from "@/features/graph/hooks/use-info-stats";
import { snappy } from "@/lib/motion";
import { formatNumber } from "@/lib/helpers";
import { badgeOutlineStyles } from "../../panels/PanelShell";

interface ScopeIndicatorProps {
  scopedCount: number;
  totalCount: number;
  scope: InfoScope;
  isSubset: boolean;
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
  scope,
  isSubset,
  selectionSource,
}: ScopeIndicatorProps) {
  const label =
    scope === "selected"
      ? `${formatNumber(scopedCount)} of ${formatNumber(totalCount)} selected · ${formatSelectionSource(selectionSource)}`
      : scope === "current"
        ? isSubset
          ? `${formatNumber(scopedCount)} of ${formatNumber(totalCount)} current`
          : `Current · all ${formatNumber(totalCount)}`
        : "Dataset";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={scope}
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
          {label}
        </Badge>
      </motion.div>
    </AnimatePresence>
  );
}
