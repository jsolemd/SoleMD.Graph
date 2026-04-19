"use client";

import { memo } from "react";
import { useDashboardStore } from "@/features/graph/stores";
import { useDragResize } from "@/features/graph/hooks/use-drag-resize";
import type { GraphBundleQueries } from "@solemd/graph";
import { useTableData } from "./use-table-data";
import { DataTableToolbar } from "./DataTableToolbar";
import { DataTableBody } from "./DataTableBody";
import { BottomTrayShell } from "../../panels/PanelShell";

function DataTableComponent({
  queries,
  overlayRevision,
}: {
  queries: GraphBundleQueries;
  overlayRevision: number;
}) {
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const setTableHeight = useDashboardStore((s) => s.setTableHeight);

  const state = useTableData({ queries, overlayRevision });

  const { onMouseDown: handleDragStart } = useDragResize({
    height: tableHeight,
    min: 120,
    max: 600,
    onResize: setTableHeight,
  });

  const bottomOffset = showTimeline ? 44 : 0;

  return (
    <BottomTrayShell
      height={tableHeight}
      bottomOffset={bottomOffset}
      onResizeMouseDown={handleDragStart}
      toolbar={(
        <DataTableToolbar
          resolvedTableView={state.resolvedTableView}
          queryTableView={state.queryTableView}
          selectionAvailable={state.selectionAvailable}
          totalPages={state.totalPages}
          safePage={state.safePage}
          pageLoading={state.pageLoading}
          pageRefreshing={state.pageRefreshing}
          totalRows={state.totalRows}
          queries={queries}
          activeLayer={state.activeLayer}
          currentPointScopeSql={state.currentPointScopeSql}
        />
      )}
      bodyClassName="px-2.5"
    >
      <DataTableBody
        activeLayer={state.activeLayer}
        pageRows={state.pageRows}
        startIdx={state.startIdx}
        pageLoading={state.pageLoading}
        pageError={state.pageError}
        resolvedTableView={state.resolvedTableView}
      />
    </BottomTrayShell>
  );
}

export const DataTable = memo(DataTableComponent);
DataTable.displayName = "DataTable";
