"use client";

import { useMemo, useState } from "react";
import { Button, Select } from "@mantine/core";
import { Plus } from "lucide-react";
import { useDashboardStore } from "@/lib/graph/stores";
import { getColumnsForLayer, getColumnMetaForLayer } from "@/lib/graph/columns";
import { autoDetectWidgetKind } from "@/lib/graph/info-widgets";
import type { InfoWidgetSlot } from "@/lib/graph/info-widgets";
import { PANEL_ACCENT, panelSelectStyles } from "../../PanelShell";

/**
 * Columns excluded from the insight picker because they're redundant,
 * too noisy, or already represented by other panel sections.
 *
 * - clusterLabel/clusterId: Already in Top Clusters table with colors
 * - chunkKind: Overlaps sectionCanonical (paragraph≈text sections, table≈Table)
 * - paperId/citekey: Unique per paper — produces useless 1-count bars
 */
const INSIGHT_EXCLUDED_COLUMNS = new Set([
  "clusterId",
  "clusterLabel",
  "chunkKind",
  "paperId",
  "citekey",
]);

export function AddInsightButton() {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const infoWidgets = useDashboardStore((s) => s.infoWidgets);
  const addInfoWidget = useDashboardStore((s) => s.addInfoWidget);
  const [showSelect, setShowSelect] = useState(false);

  const layerColumns = useMemo(
    () => getColumnsForLayer(activeLayer),
    [activeLayer],
  );

  const availableColumns = useMemo(
    () =>
      layerColumns
        .filter(
          (col) =>
            col.type !== "text" &&
            col.key !== "x" &&
            col.key !== "y" &&
            !INSIGHT_EXCLUDED_COLUMNS.has(col.key) &&
            !infoWidgets.some((w) => w.column === col.key),
        )
        .map((col) => ({ value: col.key, label: col.label })),
    [layerColumns, infoWidgets],
  );

  const handleSelect = (value: string | null) => {
    if (!value) return;
    const meta = getColumnMetaForLayer(value, activeLayer);
    if (!meta) return;

    const kind = autoDetectWidgetKind(meta.type);
    if (!kind) return;

    const slot: InfoWidgetSlot = {
      column: value,
      kind,
      label: meta.label,
    };
    addInfoWidget(slot);
    setShowSelect(false);
  };

  if (showSelect) {
    return (
      <Select
        size="xs"
        placeholder="Select column..."
        data={availableColumns}
        onChange={handleSelect}
        onBlur={() => setShowSelect(false)}
        autoFocus
        searchable
        styles={panelSelectStyles}
      />
    );
  }

  return (
    <Button
      size="xs"
      variant="subtle"
      color={PANEL_ACCENT}
      leftSection={<Plus size={14} />}
      onClick={() => setShowSelect(true)}
      disabled={availableColumns.length === 0}
    >
      Add insight
      {availableColumns.length > 0 && ` · ${availableColumns.length}`}
    </Button>
  );
}
