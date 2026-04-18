"use client";

import { Badge, Group } from "@mantine/core";
import { motion, AnimatePresence } from "framer-motion";
import type { GraphInfoScope } from "@solemd/graph";
import { chromeToggle } from "@/lib/motion";
import { formatNumber } from "@/lib/helpers";
import {
  badgeAccentStyles,
  badgeOutlineStyles,
} from "../../panels/PanelShell";

interface ScopeIndicatorProps {
  scopedCount: number;
  totalCount: number;
  scope: GraphInfoScope;
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
  const scopeLabel = scope === "dataset" ? "All" : "Selection";
  const countLabel =
    scope === "selected"
      ? `${formatNumber(scopedCount)} points`
      : scope === "current"
        ? isSubset
          ? `${formatNumber(scopedCount)} / ${formatNumber(totalCount)} points`
          : `${formatNumber(totalCount)} points`
        : `${formatNumber(totalCount)} points`;
  const sourceLabel =
    scope === "selected"
      ? formatSelectionSource(selectionSource)
      : scope === "current" && isSubset
        ? "Filters"
        : null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={scope}
        {...chromeToggle}
      >
        <Group gap={6} wrap="wrap">
          <Badge variant="light" size="xs" styles={badgeAccentStyles}>
            {scopeLabel}
          </Badge>
          <Badge variant="outline" size="xs" styles={badgeOutlineStyles}>
            {countLabel}
          </Badge>
          {sourceLabel ? (
            <Badge variant="outline" size="xs" styles={badgeOutlineStyles}>
              {sourceLabel}
            </Badge>
          ) : null}
        </Group>
      </motion.div>
    </AnimatePresence>
  );
}
