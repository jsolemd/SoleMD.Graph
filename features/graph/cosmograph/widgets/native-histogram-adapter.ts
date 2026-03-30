"use client";

import type { Histogram } from "@cosmograph/ui";
import type { HistogramBarData } from "@cosmograph/ui/modules/histogram";

import type { GraphInfoHistogramResult } from "@/features/graph/types";

type NativeHistogram = {
  _barsData: HistogramBarData[];
  _highlightedBarsData: HistogramBarData[];
  _histogramData?: number[];
  _highlightedData?: number[];
  _extent?: [number, number];
  _maxCount: number;
  _bandIntervals: Array<{ rangeStart: number; rangeEnd: number }>;
  _firstRender: boolean;
  _updateScales: () => void;
  render: () => void;
  hideState: () => void;
  showState: (message?: string) => void;
};

export const NATIVE_HISTOGRAM_BAR_COUNT = 20;

function getExtentFromHistogram(
  histogram: GraphInfoHistogramResult,
): [number, number] | null {
  if (histogram.bins.length === 0) {
    return null;
  }

  const min = histogram.bins[0]?.min;
  const max = histogram.bins[histogram.bins.length - 1]?.max;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return null;
  }

  return [min, max];
}

function toBarData(histogram: GraphInfoHistogramResult): HistogramBarData[] {
  return histogram.bins.map((bin) => ({
    rangeStart: bin.min,
    rangeEnd: bin.max,
    count: bin.count,
  }));
}

export function getHistogramExtent(
  histogram: GraphInfoHistogramResult,
): [number, number] | null {
  return getExtentFromHistogram(histogram);
}

export function setNativeHistogramData(
  widget: Histogram,
  histogram: GraphInfoHistogramResult,
): [number, number] | null {
  const nativeHistogram = widget as unknown as NativeHistogram;
  const extent = getExtentFromHistogram(histogram);

  if (!extent || histogram.totalCount <= 0) {
    nativeHistogram._barsData = [];
    nativeHistogram._highlightedBarsData = [];
    nativeHistogram._histogramData = undefined;
    nativeHistogram._highlightedData = undefined;
    nativeHistogram._extent = undefined;
    nativeHistogram._bandIntervals = [];
    nativeHistogram._maxCount = 0;
    nativeHistogram._updateScales();
    nativeHistogram.render();
    nativeHistogram.showState("No histogram data");
    return null;
  }

  const bars = toBarData(histogram);
  nativeHistogram._extent = extent;
  nativeHistogram._barsData = bars;
  nativeHistogram._highlightedBarsData = [];
  nativeHistogram._histogramData = [extent[0], extent[1]];
  nativeHistogram._highlightedData = undefined;
  nativeHistogram._bandIntervals = bars.map((bar) => ({
    rangeStart: bar.rangeStart,
    rangeEnd: bar.rangeEnd,
  }));
  nativeHistogram._maxCount = Math.max(...bars.map((bar) => bar.count), 0);
  nativeHistogram._firstRender = true;
  nativeHistogram.hideState();
  nativeHistogram._updateScales();
  nativeHistogram.render();
  return extent;
}

export function setNativeHistogramHighlight(
  widget: Histogram,
  histogram: GraphInfoHistogramResult | undefined,
): void {
  const nativeHistogram = widget as unknown as NativeHistogram;

  if (!histogram || histogram.bins.length === 0) {
    nativeHistogram._highlightedBarsData = [];
    nativeHistogram._highlightedData = undefined;
    nativeHistogram.render();
    return;
  }

  const extent = getExtentFromHistogram(histogram);
  nativeHistogram._highlightedBarsData = toBarData(histogram);
  nativeHistogram._highlightedData = extent ? [extent[0], extent[1]] : undefined;
  nativeHistogram.render();
}
