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
  resolvedTableView: string;
  tablePageSize: number;
  currentPointScopeSql: string | null;
  selectedPointCount: number;
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
  const setTableView = useDashboardStore((s) => s.setTableView);

  const [pageRows, setPageRows] = useState<GraphPointRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const resolvedTableView =
    tableView === "selected" && selectedPointCount === 0
      ? "current"
      : tableView;
  const scopedCurrentPointScopeSql =
    resolvedTableView === "current" ? deferredCurrentPointScopeSql : null;
  const scopedCurrentScopeRevision =
    resolvedTableView === "current" ? currentScopeRevision : 0;
  const scopedSelectedPointCount =
    resolvedTableView === "selected" ? selectedPointCount : 0;
  const scopedSelectedPointRevision =
    resolvedTableView === "selected" ? selectedPointRevision : 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / tablePageSize));
  const safePage = clamp(tablePage, 1, totalPages);
  const startIdx = (safePage - 1) * tablePageSize;
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        resolvedTableView,
        safePage,
        tablePageSize,
        currentScopeSql: scopedCurrentPointScopeSql,
        currentScopeRevision: scopedCurrentScopeRevision,
        selectedCount: scopedSelectedPointCount,
        selectedPointRevision: scopedSelectedPointRevision,
        overlayRevision,
      }),
    [
      activeLayer,
      overlayRevision,
      resolvedTableView,
      safePage,
      scopedCurrentPointScopeSql,
      scopedCurrentScopeRevision,
      scopedSelectedPointCount,
      scopedSelectedPointRevision,
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
    if (tableView === "selected" && selectedPointCount === 0) {
      setTableView("current");
    }
  }, [selectedPointCount, setTableView, tableView]);

  useEffect(() => {
    let cancelled = false;

    queries
      .getTablePage({
        layer: activeLayer,
        view: resolvedTableView,
        page: safePage,
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
    resolvedTableView,
    requestKey,
    safePage,
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
    tablePageSize,
    currentPointScopeSql: scopedCurrentPointScopeSql,
    selectedPointCount,
  };
}
