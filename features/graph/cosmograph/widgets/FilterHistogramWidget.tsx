"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionIcon, Group, RangeSlider, Stack, Text } from "@mantine/core";
import { useCosmograph } from "@cosmograph/react";
import { X } from "lucide-react";
import {
  buildNumericRangeFilterClause,
  buildVisibilityScopeSqlExcludingSource,
  clearSelectionClause,
  createSelectionSource,
  getSelectionValueForSource,
} from "@/features/graph/lib/cosmograph-selection";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoHistogramResult } from "@/features/graph/types";
import { QueryInfoHistogram } from "@/features/graph/components/explore/info/QueryWidgetVisualizations";
import { formatNumber } from "@/lib/helpers";
import { panelTextDimStyle } from "@/features/graph/components/panels/PanelShell";

const YEAR_LIKE_COLUMNS = new Set(["year", "pageNumber"]);

function rangesEqual(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6;
}

function normalizeRange(
  value: [number, number],
  extent: [number, number],
  step: number,
): [number, number] {
  const min = Math.max(extent[0], Math.min(value[0], value[1]));
  const max = Math.min(extent[1], Math.max(value[0], value[1]));

  if (step >= 1) {
    return [Math.round(min), Math.round(max)];
  }

  return [Number(min.toFixed(3)), Number(max.toFixed(3))];
}

export function FilterHistogramWidget({
  column,
  queries,
}: {
  column: string;
  queries: GraphBundleQueries;
}) {
  const { cosmograph } = useCosmograph();
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const currentScopeRevision = useDashboardStore((state) => state.currentScopeRevision);
  const [histogram, setHistogram] = useState<GraphInfoHistogramResult | null>(null);
  const [pendingRange, setPendingRange] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceId = `filter:${column}`;
  const source = useMemo(() => createSelectionSource(sourceId), [sourceId]);

  const scopeSql = useMemo(
    () =>
      buildVisibilityScopeSqlExcludingSource(
        cosmograph?.pointsSelection,
        sourceId,
      ),
    [cosmograph, currentScopeRevision, sourceId],
  );
  const selectedRange = useMemo(
    () =>
      getSelectionValueForSource<[number, number]>(
        cosmograph?.pointsSelection,
        sourceId,
      ),
    [cosmograph, currentScopeRevision, sourceId],
  );

  useEffect(() => {
    let cancelled = false;

    queries
      .getInfoHistogram({
        layer: activeLayer,
        scope: "current",
        column,
        currentPointScopeSql: scopeSql,
        bins: 20,
      })
      .then((nextHistogram) => {
        if (cancelled) {
          return;
        }

        setHistogram(nextHistogram);
        setError(null);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }

        setHistogram(null);
        setError(
          queryError instanceof Error ? queryError.message : "Failed to load filter",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeLayer, column, queries, scopeSql]);

  const extent = useMemo<[number, number] | null>(() => {
    if (!histogram || histogram.bins.length === 0) {
      return null;
    }

    return [
      histogram.bins[0]?.min ?? 0,
      histogram.bins[histogram.bins.length - 1]?.max ?? 0,
    ];
  }, [histogram]);
  const step = YEAR_LIKE_COLUMNS.has(column) ? 1 : 0.01;

  useEffect(() => {
    if (!extent) {
      setPendingRange(null);
      return;
    }

    setPendingRange(selectedRange ? normalizeRange(selectedRange, extent, step) : extent);
  }, [extent, selectedRange, step]);

  const handleApply = (nextRange: [number, number]) => {
    const selection = cosmograph?.pointsSelection;
    if (!selection || !extent) {
      return;
    }

    const normalized = normalizeRange(nextRange, extent, step);
    setPendingRange(normalized);

    if (rangesEqual(normalized, extent)) {
      clearSelectionClause(selection, source);
      return;
    }

    selection.update(buildNumericRangeFilterClause(source, column, normalized));
  };

  if (error) {
    return <Text style={panelTextDimStyle}>{error}</Text>;
  }

  if (!histogram || !extent || histogram.bins.length === 0) {
    return <Text style={panelTextDimStyle}>No numeric data</Text>;
  }

  return (
    <Stack gap={6}>
      <QueryInfoHistogram
        bins={histogram.bins}
        totalCount={histogram.totalCount}
        column={column}
      />

      <RangeSlider
        size="xs"
        min={extent[0]}
        max={extent[1]}
        step={step}
        minRange={step}
        value={pendingRange ?? extent}
        onChange={(value) => setPendingRange(value as [number, number])}
        onChangeEnd={(value) => handleApply(value as [number, number])}
        label={(value) =>
          YEAR_LIKE_COLUMNS.has(column)
            ? String(Math.round(value))
            : formatNumber(value, { maximumFractionDigits: 2 })
        }
        styles={{
          track: { backgroundColor: "var(--graph-panel-input-bg)" },
          bar: { backgroundColor: "var(--mode-accent)" },
          thumb: { borderColor: "var(--mode-accent)" },
        }}
      />

      {selectedRange ? (
        <Group justify="space-between" gap="xs">
          <Text style={panelTextDimStyle}>
            {YEAR_LIKE_COLUMNS.has(column)
              ? `${Math.round(selectedRange[0])}–${Math.round(selectedRange[1])}`
              : `${formatNumber(selectedRange[0], {
                  maximumFractionDigits: 2,
                })}–${formatNumber(selectedRange[1], {
                  maximumFractionDigits: 2,
                })}`}
          </Text>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={() => handleApply(extent)}
            aria-label={`Clear ${column} filter`}
          >
            <X size={12} />
          </ActionIcon>
        </Group>
      ) : null}
    </Stack>
  );
}
