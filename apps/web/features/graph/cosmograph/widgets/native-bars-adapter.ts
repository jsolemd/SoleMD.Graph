"use client";

import type { Bars, BarData } from "@cosmograph/ui";

import type { GraphInfoFacetRow } from "@solemd/graph";

export const NATIVE_BARS_DATA_LIMIT = 64;

type NativeBars = {
  _config: { onClick?: (item?: BarData) => void };
  _container: HTMLElement;
  _data: BarData[];
  _originalData: BarData[];
  _selectedItem?: BarData;
  _highlightedCounts?: Map<string, number>;
  _isFilteringActive: boolean;
  _searchContainer: HTMLDivElement;
  _clearSearch: () => void;
  setSelectedItem: (item?: BarData) => void;
  _handleSort: () => void;
  _calcHiddenSum: () => void;
  _renderItems: () => void;
};

function normalizeFacetRows(
  rows: GraphInfoFacetRow[],
  key: "scopedCount" | "totalCount",
): BarData[] {
  return rows
    .map((row) => ({
      label: row.value,
      count: row[key],
    }))
    .filter((row) => row.label.trim().length > 0 && row.count > 0);
}

export function setNativeBarsFacetData(widget: Bars, rows: GraphInfoFacetRow[]): void {
  const nativeBars = widget as unknown as NativeBars;
  const normalizedRows = normalizeFacetRows(rows, "totalCount");

  nativeBars._clearSearch();
  nativeBars._data = normalizedRows;
  nativeBars._originalData = [...normalizedRows];

  if (!nativeBars._originalData.length && nativeBars._selectedItem) {
    nativeBars.setSelectedItem(undefined);
    nativeBars._config.onClick?.(undefined);
  }

  nativeBars._searchContainer.style.display = nativeBars._originalData.length
    ? "block"
    : "none";
  nativeBars._handleSort();
  widget.hideState();
}

export function setNativeBarsFacetHighlight(
  widget: Bars,
  rows: GraphInfoFacetRow[] | undefined,
): void {
  const nativeBars = widget as unknown as NativeBars;

  if (!rows) {
    nativeBars._highlightedCounts = undefined;
    nativeBars._isFilteringActive = false;
    nativeBars._calcHiddenSum();
    nativeBars._renderItems();
    return;
  }

  const highlightedCounts = new Map<string, number>();
  let highlightedTotal = 0;

  for (const row of rows) {
    if (row.scopedCount <= 0 || row.value.trim().length === 0) {
      continue;
    }
    highlightedCounts.set(row.value, row.scopedCount);
    highlightedTotal += row.scopedCount;
  }

  nativeBars._highlightedCounts = highlightedCounts;
  const totalCount = nativeBars._originalData.reduce(
    (sum: number, row: BarData) => sum + row.count,
    0,
  );
  nativeBars._isFilteringActive = highlightedTotal < totalCount;
  nativeBars._calcHiddenSum();
  nativeBars._renderItems();
}
