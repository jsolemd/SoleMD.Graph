"use client";

import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useTableSelectionQueryState } from "@/features/graph/hooks/use-selection-query-state";
import { useDashboardStore } from "@/features/graph/stores";
import { clamp } from "@/lib/helpers";
import type { GraphBundleQueries, GraphPointRecord, GraphLayer } from "@solemd/graph";
import { useShallow } from "zustand/react/shallow";

interface UseTableDataOptions {
  queries: GraphBundleQueries;
  overlayRevision: number;
}

export interface TableDataState {
  activeLayer: GraphLayer;
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

interface TableDataSnapshot {
  activeLayer: GraphLayer;
  setTablePage: ReturnType<typeof useDashboardStore.getState>["setTablePage"];
  tablePage: number;
  tablePageSize: number;
  tableView: "selection" | "dataset";
}

export function useTableData({ queries, overlayRevision }: UseTableDataOptions): TableDataState {
  const { activeLayer, setTablePage, tablePage, tablePageSize, tableView } =
    useDashboardStore(
      useShallow(
        (state): TableDataSnapshot => ({
          activeLayer: state.activeLayer,
          setTablePage: state.setTablePage,
          tablePage: state.tablePage,
          tablePageSize: state.tablePageSize,
          tableView: state.tableView,
        }),
      ),
    );
  const tableSelectionState = useTableSelectionQueryState(tableView);

  const [pageRows, setPageRows] = useState<GraphPointRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalRows / tablePageSize));
  const safePage = clamp(tablePage, 1, totalPages);
  const [debouncedSafePage] = useDebouncedValue(safePage, 80);
  const startIdx = (safePage - 1) * tablePageSize;
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        resolvedTableView: tableSelectionState.resolvedTableView,
        queryTableView: tableSelectionState.queryTableView,
        safePage: debouncedSafePage,
        tablePageSize,
        currentScopeSql: tableSelectionState.scopedCurrentPointScopeSql,
        currentScopeRevision: tableSelectionState.scopedCurrentScopeRevision,
        selectedCount: tableSelectionState.scopedSelectedPointCount,
        selectedPointRevision: tableSelectionState.scopedSelectedPointRevision,
        overlayRevision,
      }),
    [
      activeLayer,
      tableSelectionState.queryTableView,
      overlayRevision,
      tableSelectionState.resolvedTableView,
      debouncedSafePage,
      tableSelectionState.scopedCurrentPointScopeSql,
      tableSelectionState.scopedCurrentScopeRevision,
      tableSelectionState.scopedSelectedPointCount,
      tableSelectionState.scopedSelectedPointRevision,
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
        view: tableSelectionState.queryTableView,
        page: debouncedSafePage,
        pageSize: tablePageSize,
        currentPointScopeSql: tableSelectionState.scopedCurrentPointScopeSql,
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
    tableSelectionState.queryTableView,
    requestKey,
    debouncedSafePage,
    tableSelectionState.scopedCurrentPointScopeSql,
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
    resolvedTableView: tableSelectionState.resolvedTableView,
    queryTableView: tableSelectionState.queryTableView,
    tablePageSize,
    currentPointScopeSql: tableSelectionState.scopedCurrentPointScopeSql,
    selectedPointCount: tableSelectionState.selectedPointCount,
    selectionAvailable: tableSelectionState.selectionAvailable,
  };
}
