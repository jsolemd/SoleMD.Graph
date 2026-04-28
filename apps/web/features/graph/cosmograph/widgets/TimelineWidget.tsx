"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CosmographTimeline, useCosmographInternal } from "@cosmograph/react";
import {
  Timeline as NativeTimeline,
  type TimelineConfigInterface,
} from "@cosmograph/ui";
import type { GraphBundleQueries } from "@solemd/graph";
import { timelineWidgetThemeVars } from "@/features/graph/components/explore/widget-theme";
import {
  WIDGET_DATASET_RETRY_DELAYS,
  getCachedNumericDataset,
  getWidgetDatasetCacheKeyWithRevision,
  setCachedNumericDataset,
} from "./dataset-cache";
import { useWidgetSelectors } from "./use-widget-selectors";

const TIMELINE_BAR_COUNT = 32;

type TimelineSelection =
  | [number, number]
  | [Date, Date]
  | Array<number | Date>
  | undefined;

function normalizeTimelineSelection(
  selection: TimelineSelection,
): [number, number] | undefined {
  if (!selection || selection.length < 2) {
    return undefined;
  }

  const start = Number(selection[0]);
  const end = Number(selection[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }

  return [
    Math.round(Math.min(start, end)),
    Math.round(Math.max(start, end)),
  ];
}

function getNumericExtent(values: number[]): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null;
}

function createStandaloneTimelineConfig(
  animationSpeedMs: number,
  onTimelineSelection: (selection: TimelineSelection) => void,
): TimelineConfigInterface {
  return {
    barCount: TIMELINE_BAR_COUNT,
    allowSelection: true,
    stickySelection: true,
    showAnimationControls: true,
    animationSpeed: animationSpeedMs,
    formatter: (value) => String(Math.round(Number(value))),
    onBrush: onTimelineSelection,
    onAnimationTick: onTimelineSelection,
  };
}

/**
 * Native timeline adapter.
 *
 * With a CosmographProvider mounted, this uses integrated `CosmographTimeline`:
 * - Reads data directly from the DuckDB coordinator via `accessor` (no JS fetch)
 * - Handles crossfilter updates internally (no `pointsSelection.update()` per tick)
 * - Handles scoped highlighting natively (`highlightSelectedData`)
 * - Creates its own FilteringClient (no manual `initCrossfilterClient`)
 *
 * Without a CosmographProvider, this mounts the same native `@cosmograph/ui`
 * Timeline class and feeds it through the shared typed graph query/cache layer.
 * That keeps 3D on the native widget surface without introducing a second
 * filter/timeline implementation.
 */
export function TimelineWidget({
  column,
  queries,
  bundleChecksum,
  overlayRevision,
  animationSpeedMs,
  selectedRange,
  onSelection,
}: {
  column: string;
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
  /** Cosmograph animationSpeed in ms — lower = faster. */
  animationSpeedMs: number;
  selectedRange?: [number, number];
  onSelection: (selection: [number, number] | undefined) => void;
}) {
  const cosmograph = useCosmographInternal()?.cosmograph ?? null;
  const handleSelection = useCallback(
    (
      selection: [number, number] | [Date, Date] | undefined,
      _isManuallySelected?: boolean,
    ) => {
      onSelection(normalizeTimelineSelection(selection));
    },
    [onSelection],
  );

  if (cosmograph) {
    return (
      <CosmographTimeline
        accessor={column}
        id={`timeline:${column}`}
        barCount={TIMELINE_BAR_COUNT}
        allowSelection
        stickySelection
        showAnimationControls
        animationSpeed={animationSpeedMs}
        formatter={(value) => String(Math.round(Number(value)))}
        onSelection={handleSelection}
        onAnimationTick={(selection) =>
          onSelection(normalizeTimelineSelection(selection))
        }
        className="h-full min-w-0 flex-1"
        style={timelineWidgetThemeVars}
      />
    );
  }

  return (
    <StandaloneTimelineWidget
      column={column}
      queries={queries}
      bundleChecksum={bundleChecksum}
      overlayRevision={overlayRevision}
      animationSpeedMs={animationSpeedMs}
      selectedRange={selectedRange}
      onSelection={onSelection}
    />
  );
}

function StandaloneTimelineWidget({
  column,
  queries,
  bundleChecksum,
  overlayRevision,
  animationSpeedMs,
  selectedRange,
  onSelection,
}: {
  column: string;
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
  animationSpeedMs: number;
  selectedRange?: [number, number];
  onSelection: (selection: [number, number] | undefined) => void;
}) {
  const {
    activeLayer,
    baselineScope,
    baselineCacheKey,
    baselineCurrentPointScopeSql,
    baselineReady,
    scopeSql,
    isSubset,
  } = useWidgetSelectors("timeline", column);
  const [error, setError] = useState<string | null>(null);
  const [widgetRevision, setWidgetRevision] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<NativeTimeline | null>(null);
  const datasetRequestIdRef = useRef(0);
  const scopedRequestIdRef = useRef(0);
  const selectedRangeRef = useRef<[number, number] | undefined>(selectedRange);
  const animationSpeedMsRef = useRef(animationSpeedMs);
  selectedRangeRef.current = selectedRange;
  animationSpeedMsRef.current = animationSpeedMs;

  const commitSelection = useCallback(
    (selection: TimelineSelection) => {
      onSelection(normalizeTimelineSelection(selection));
    },
    [onSelection],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const widget = new NativeTimeline(
      containerRef.current,
      createStandaloneTimelineConfig(animationSpeedMsRef.current, commitSelection),
    );
    widget.setLoadingState();
    widgetRef.current = widget;
    setWidgetRevision((current) => current + 1);

    return () => {
      widget.destroy();
      widgetRef.current = null;
    };
  }, [commitSelection]);

  useEffect(() => {
    widgetRef.current?.setConfig(
      createStandaloneTimelineConfig(animationSpeedMs, commitSelection),
    );
  }, [animationSpeedMs, commitSelection, widgetRevision]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    const requestId = ++datasetRequestIdRef.current;
    if (!baselineReady) {
      widget.setLoadingState();
      return;
    }

    const datasetCacheKey = getWidgetDatasetCacheKeyWithRevision(
      bundleChecksum,
      activeLayer,
      column,
      overlayRevision,
      baselineCacheKey,
    );
    const cachedDataset = getCachedNumericDataset(datasetCacheKey);

    if (cachedDataset) {
      widget.setTimeData(cachedDataset);
    } else {
      widget.setLoadingState();
    }

    const datasetPromise = cachedDataset
      ? Promise.resolve(cachedDataset)
      : (async () => {
          for (const delay of WIDGET_DATASET_RETRY_DELAYS) {
            if (delay > 0) {
              await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
            }

            const values = await queries.getNumericColumnValues({
              layer: activeLayer,
              scope: baselineScope,
              column,
              currentPointScopeSql: baselineCurrentPointScopeSql,
            });

            if (values.length > 0) {
              return values;
            }
          }

          return [];
        })();

    datasetPromise
      .then((values) => {
        if (requestId !== datasetRequestIdRef.current || !widgetRef.current) {
          return;
        }

        setError(null);
        const extent = getNumericExtent(values);
        if (values.length > 0) {
          setCachedNumericDataset(datasetCacheKey, values);
          widget.setTimeData(values, extent ?? undefined);
        } else {
          widget.setTimeData(undefined);
        }
        widget.setSelection(selectedRangeRef.current, true);
      })
      .catch((queryError: unknown) => {
        if (requestId !== datasetRequestIdRef.current) {
          return;
        }

        setError(
          queryError instanceof Error ? queryError.message : "Failed to load timeline",
        );
      });
  }, [
    activeLayer,
    baselineCacheKey,
    baselineCurrentPointScopeSql,
    baselineReady,
    baselineScope,
    bundleChecksum,
    column,
    overlayRevision,
    queries,
    widgetRevision,
  ]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    if (!isSubset || !scopeSql) {
      widget.setHighlightedData(undefined);
      return;
    }

    const requestId = ++scopedRequestIdRef.current;
    queries
      .getNumericColumnValues({
        layer: activeLayer,
        scope: "current",
        column,
        currentPointScopeSql: scopeSql,
      })
      .then((values) => {
        if (requestId !== scopedRequestIdRef.current || !widgetRef.current) {
          return;
        }

        setError(null);
        widget.setHighlightedData(values);
      })
      .catch((queryError: unknown) => {
        if (requestId !== scopedRequestIdRef.current) {
          return;
        }

        setError(
          queryError instanceof Error
            ? queryError.message
            : "Failed to update timeline scope",
        );
      });
  }, [activeLayer, column, isSubset, queries, scopeSql, widgetRevision]);

  useEffect(() => {
    widgetRef.current?.setSelection(selectedRange, true);
  }, [selectedRange, widgetRevision]);

  if (error) {
    return (
      <div
        className="flex h-full items-center px-3 text-xs"
        style={{ color: "var(--graph-panel-text-dim)" }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full min-w-0 flex-1"
      style={timelineWidgetThemeVars}
    />
  );
}
