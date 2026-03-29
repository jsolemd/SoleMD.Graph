"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useDashboardStore } from "@/features/graph/stores";
import { clamp } from "@/lib/helpers";
import type { GraphBundleQueries, GraphNode, MapLayer } from "@/features/graph/types";

interface UseTableDataOptions {
  queries: GraphBundleQueries;
  overlayRevision: number;
}

export interface TableDataState {
  activeLayer: MapLayer;
  pageRows: GraphNode[];
  totalRows: number;
  totalPages: number;
  safePage: number;
  startIdx: number;
  pageLoading: boolean;
  pageRefreshing: boolean;
  pageError: string | null;
  resolvedTableView: string;
  selectedIndexSet: Set<number>;
  highlightedIndexSet: Set<number>;
  tablePageSize: number;
  selectedPointIndices: number[];
}

export function useTableData({ queries, overlayRevision }: UseTableDataOptions): TableDataState {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const tablePage = useDashboardStore((s) => s.tablePage);
  const tablePageSize = useDashboardStore((s) => s.tablePageSize);
  const tableView = useDashboardStore((s) => s.tableView);
  const currentPointIndices = useDashboardStore((s) => s.currentPointIndices);
  const currentPointScopeSql = useDashboardStore((s) => s.currentPointScopeSql);
  const [debouncedCurrentPointScopeSql] = useDebouncedValue(currentPointScopeSql, 120);
  const deferredCurrentPointScopeSql = useDeferredValue(debouncedCurrentPointScopeSql);
  const highlightedPointIndices = useDashboardStore((s) => s.highlightedPointIndices);
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const setTablePage = useDashboardStore((s) => s.setTablePage);
  const setTableView = useDashboardStore((s) => s.setTableView);

  const [pageRows, setPageRows] = useState<GraphNode[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const resolvedTableView =
    tableView === "selected" && selectedPointIndices.length === 0
      ? "current"
      : tableView;
  const selectedIndexSet = useMemo(
    () => new Set(selectedPointIndices),
    [selectedPointIndices]
  );
  const highlightedIndexSet = useMemo(
    () => new Set(highlightedPointIndices),
    [highlightedPointIndices]
  );

  const totalPages = Math.max(1, Math.ceil(totalRows / tablePageSize));
  const safePage = clamp(tablePage, 1, totalPages);
  const startIdx = (safePage - 1) * tablePageSize;
  const currentScopeKey = useMemo(
    () =>
      deferredCurrentPointScopeSql ?? {
        currentCount: currentPointIndices?.length ?? null,
        currentFirst: currentPointIndices?.[0] ?? null,
        currentLast:
          currentPointIndices && currentPointIndices.length > 0
            ? currentPointIndices[currentPointIndices.length - 1]
            : null,
      },
    [currentPointIndices, deferredCurrentPointScopeSql],
  );
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        resolvedTableView,
        safePage,
        tablePageSize,
        currentScope: currentScopeKey,
        selectedCount: selectedPointIndices.length,
        selectedFirst: selectedPointIndices[0] ?? null,
        selectedLast:
          selectedPointIndices.length > 0
            ? selectedPointIndices[selectedPointIndices.length - 1]
            : null,
        overlayRevision,
      }),
    [
      activeLayer,
      currentScopeKey,
      overlayRevision,
      resolvedTableView,
      safePage,
      selectedPointIndices,
      tablePageSize,
    ]
  );
  const pageLoading = pageRows.length === 0 && lastResolvedKey !== requestKey;
  const pageRefreshing = pageRows.length > 0 && lastResolvedKey !== requestKey;

  useEffect(() => {
    if (tablePage !== safePage) {
      setTablePage(safePage);
    }
  }, [safePage, setTablePage, tablePage]);

  useEffect(() => {
    if (tableView === "selected" && selectedPointIndices.length === 0) {
      setTableView("current");
    }
  }, [selectedPointIndices.length, setTableView, tableView]);

  useEffect(() => {
    let cancelled = false;

    queries
      .getTablePage({
        layer: activeLayer,
        view: resolvedTableView,
        page: safePage,
        pageSize: tablePageSize,
        currentPointIndices,
        currentPointScopeSql: deferredCurrentPointScopeSql,
        selectedPointIndices,
      })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setPageRows(result.rows);
        setTotalRows(result.totalRows);
        setLastResolvedKey(requestKey);
        setPageError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setPageRows([]);
        setTotalRows(0);
        setLastResolvedKey(requestKey);
        setPageError(
          error instanceof Error ? error.message : "Failed to load table rows"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeLayer,
    currentPointIndices,
    deferredCurrentPointScopeSql,
    queries,
    resolvedTableView,
    requestKey,
    safePage,
    selectedPointIndices,
    tablePageSize,
  ]);

  return {
    activeLayer,
    pageRows,
    totalRows,
    totalPages,
    safePage,
    startIdx,
    pageLoading,
    pageRefreshing,
    pageError,
    resolvedTableView,
    selectedIndexSet,
    highlightedIndexSet,
    tablePageSize,
    selectedPointIndices,
  };
}
