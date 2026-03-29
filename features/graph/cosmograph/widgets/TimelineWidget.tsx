"use client";

import { useEffect, useMemo, useState } from "react";
import { RangeSlider, Text } from "@mantine/core";
import { useCosmograph } from "@cosmograph/react";
import {
  buildNumericRangeFilterClause,
  buildVisibilityScopeSqlExcludingSource,
  clearSelectionClause,
  createSelectionSource,
  getSelectionValueForSource,
} from "@/features/graph/lib/cosmograph-selection";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoHistogramResult } from "@/features/graph/types";
import { formatNumber } from "@/lib/helpers";

const timelineTextStyle: React.CSSProperties = {
  color: "var(--text-tertiary)",
  fontSize: 10,
  lineHeight: 1,
};

function rangesEqual(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6;
}

export function TimelineWidget({
  column,
  queries,
  onSelection,
}: {
  column: string;
  queries: GraphBundleQueries;
  onSelection: (selection: [number, number] | undefined) => void;
}) {
  const { cosmograph } = useCosmograph();
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const currentScopeRevision = useDashboardStore((state) => state.currentScopeRevision);
  const [histogram, setHistogram] = useState<GraphInfoHistogramResult | null>(null);
  const [pendingRange, setPendingRange] = useState<[number, number] | null>(null);
  const sourceId = `timeline:${column}`;
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
    onSelection(selectedRange ?? undefined);
  }, [onSelection, selectedRange]);

  useEffect(() => {
    let cancelled = false;

    queries
      .getInfoHistogram({
        layer: activeLayer,
        scope: "current",
        column,
        currentPointScopeSql: scopeSql,
        bins: 32,
      })
      .then((nextHistogram) => {
        if (cancelled) {
          return;
        }

        setHistogram(nextHistogram);
      })
      .catch(() => {
        if (!cancelled) {
          setHistogram(null);
        }
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

  useEffect(() => {
    if (!extent) {
      setPendingRange(null);
      return;
    }

    setPendingRange(selectedRange ?? extent);
  }, [extent, selectedRange]);

  const maxCount = useMemo(
    () => Math.max(...(histogram?.bins ?? []).map((bin) => bin.count), 0),
    [histogram],
  );

  const handleApply = (nextRange: [number, number]) => {
    const selection = cosmograph?.pointsSelection;
    if (!selection || !extent) {
      return;
    }

    const normalized: [number, number] = [
      Math.max(extent[0], Math.round(Math.min(nextRange[0], nextRange[1]))),
      Math.min(extent[1], Math.round(Math.max(nextRange[0], nextRange[1]))),
    ];
    setPendingRange(normalized);

    if (rangesEqual(normalized, extent)) {
      clearSelectionClause(selection, source);
      return;
    }

    selection.update(buildNumericRangeFilterClause(source, column, normalized));
  };

  if (!histogram || !extent || histogram.bins.length === 0) {
    return (
      <div className="flex h-full items-center px-3">
        <Text style={timelineTextStyle}>No timeline data</Text>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-1.5">
      <div className="mb-1 flex h-4 items-end gap-px">
        {histogram.bins.map((bin, index) => {
          const height = maxCount > 0 ? (bin.count / maxCount) * 16 : 0;
          return (
            <div
              key={`${bin.min}-${bin.max}-${index}`}
              className="flex-1 rounded-t-sm"
              style={{
                minWidth: 1,
                height: Math.max(height, 1),
                backgroundColor:
                  bin.count > 0
                    ? "var(--filter-bar-base)"
                    : "var(--graph-panel-input-bg)",
              }}
            />
          );
        })}
      </div>

      <RangeSlider
        size="xs"
        min={extent[0]}
        max={extent[1]}
        step={1}
        minRange={1}
        value={pendingRange ?? extent}
        onChange={(value) => setPendingRange(value as [number, number])}
        onChangeEnd={(value) => handleApply(value as [number, number])}
        label={null}
        styles={{
          root: { flex: 1 },
          track: { backgroundColor: "var(--graph-panel-input-bg)" },
          bar: { backgroundColor: "var(--mode-accent)" },
          thumb: { borderColor: "var(--mode-accent)" },
        }}
      />

      <div className="mt-1 flex items-center justify-between">
        <Text style={timelineTextStyle}>{Math.round(extent[0])}</Text>
        <Text style={timelineTextStyle}>
          {selectedRange
            ? `${Math.round(selectedRange[0])}–${Math.round(selectedRange[1])}`
            : formatNumber(histogram.totalCount)}
        </Text>
        <Text style={timelineTextStyle}>{Math.round(extent[1])}</Text>
      </div>
    </div>
  );
}
