"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useDashboardStore } from "@/features/graph/stores";
import { clamp } from "@/lib/helpers";
import type { GraphBundleQueries, GraphPointRecord, MapLayer } from "@/features/graph/types";

interface UseTableDataOptions {
  queries: GraphBundleQueries;
  overlayRevision: number;
}

export interface TableDataState {
  activeLayer: MapLayer;
  pageRows: GraphPointRecord[];
  totalRows: number;
  totalPages: number;
  safePage: number;
  startIdx: number;
  pageLoading: boolean;
  pageRefreshing: boolean;
  pageError: string | null;
  resolvedTableView: "selection" | "dataset";
  queryTableView: "current" | "selected";
  tablePageSize: number;
  currentPointScopeSql: string | null;
  selectedPointCount: number;
  selectionAvailable: boolean;
}

export function useTableData({ queries, overlayRevision }: UseTableDataOptions): TableDataState {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const tablePage = useDashboardStore((s) => s.tablePage);
  const tablePageSize = useDashboardStore((s) => s.tablePageSize);
  const tableView = useDashboardStore((s) => s.tableView);
  const currentPointScopeSql = useDashboardStore((s) => s.currentPointScopeSql);
  const currentScopeRevision = useDashboardStore((s) => s.currentScopeRevision);
  const [debouncedCurrentPointScopeSql] = useDebouncedValue(currentPointScopeSql, 120);
  const deferredCurrentPointScopeSql = useDeferredValue(debouncedCurrentPointScopeSql);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const selectedPointRevision = useDashboardStore((s) => s.selectedPointRevision);
  const setTablePage = useDashboardStore((s) => s.setTablePage);

  const [pageRows, setPageRows] = useState<GraphPointRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const hasCurrentSubset =
    typeof deferredCurrentPointScopeSql === "string" &&
    deferredCurrentPointScopeSql.trim().length > 0;
  const hasManualSelection = selectedPointCount > 0;
  const preferredSelectionQueryView: "current" | "selected" | null =
    hasCurrentSubset ? "current" : hasManualSelection ? "selected" : null;
  const selectionAvailable = preferredSelectionQueryView !== null;
  const resolvedTableView: "selection" | "dataset" =
    tableView === "dataset" || !selectionAvailable ? "dataset" : "selection";
  const queryTableView: "current" | "selected" =
    resolvedTableView === "dataset"
      ? "current"
      : preferredSelectionQueryView ?? "current";
  const scopedCurrentPointScopeSql =
    resolvedTableView === "selection" && queryTableView === "current"
      ? deferredCurrentPointScopeSql
      : null;
  const scopedCurrentScopeRevision =
    resolvedTableView === "selection" && queryTableView === "current"
      ? currentScopeRevision
      : 0;
  const scopedSelectedPointCount =
    resolvedTableView === "selection" && queryTableView === "selected"
      ? selectedPointCount
      : 0;
  const scopedSelectedPointRevision =
    resolvedTableView === "selection" && queryTableView === "selected"
      ? selectedPointRevision
      : 0;
  const [debouncedSelectedRevision] = useDebouncedValue(scopedSelectedPointRevision, 80);
  const totalPages = Math.max(1, Math.ceil(totalRows / tablePageSize));
  const safePage = clamp(tablePage, 1, totalPages);
  const [debouncedSafePage] = useDebouncedValue(safePage, 80);
  const startIdx = (safePage - 1) * tablePageSize;
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        resolvedTableView,
        queryTableView,
        safePage: debouncedSafePage,
        tablePageSize,
        currentScopeSql: scopedCurrentPointScopeSql,
        currentScopeRevision: scopedCurrentScopeRevision,
        selectedCount: scopedSelectedPointCount,
        selectedPointRevision: debouncedSelectedRevision,
        overlayRevision,
      }),
    [
      activeLayer,
      queryTableView,
      overlayRevision,
      resolvedTableView,
      debouncedSafePage,
      scopedCurrentPointScopeSql,
      scopedCurrentScopeRevision,
      scopedSelectedPointCount,
      debouncedSelectedRevision,
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
    let cancelled = false;

    queries
      .getTablePage({
        layer: activeLayer,
        view: queryTableView,
        page: debouncedSafePage,
        pageSize: tablePageSize,
        currentPointScopeSql: scopedCurrentPointScopeSql,
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
    queries,
    queryTableView,
    requestKey,
    debouncedSafePage,
    scopedCurrentPointScopeSql,
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
    queryTableView,
    tablePageSize,
    currentPointScopeSql: scopedCurrentPointScopeSql,
    selectedPointCount,
    selectionAvailable,
  };
}
