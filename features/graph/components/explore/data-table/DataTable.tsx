"use client";

import { motion } from "framer-motion";
import { useDashboardStore } from "@/features/graph/stores";
import { smooth } from "@/lib/motion";
import { useDragResize } from "@/features/graph/hooks/use-drag-resize";
import type { GraphBundleQueries } from "@/features/graph/types";
import { useTableData } from "./use-table-data";
import { DataTableToolbar } from "./DataTableToolbar";
import { DataTableBody } from "./DataTableBody";

export function DataTable({
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={smooth}
      className="absolute left-0 right-0 z-20 flex flex-col"
      style={{
        bottom: showTimeline ? 44 : 0,
        height: tableHeight,
        backgroundColor: "var(--graph-bg)",
      }}
    >
      <div
        className="flex h-3 cursor-row-resize items-center justify-center transition-colors hover:bg-[var(--interactive-hover)]"
        onMouseDown={handleDragStart}
      >
        <div
          className="h-1 w-10 rounded-full"
          style={{ backgroundColor: "var(--graph-panel-text-dim)" }}
        />
      </div>

      <DataTableToolbar
        resolvedTableView={state.resolvedTableView}
        selectedCount={state.selectedPointCount}
        totalPages={state.totalPages}
        safePage={state.safePage}
        pageLoading={state.pageLoading}
        pageRefreshing={state.pageRefreshing}
        totalRows={state.totalRows}
        queries={queries}
        activeLayer={state.activeLayer}
        currentPointScopeSql={state.currentPointScopeSql}
      />

      <div className="flex-1 overflow-auto px-2">
        <DataTableBody
          activeLayer={state.activeLayer}
          pageRows={state.pageRows}
          startIdx={state.startIdx}
          pageLoading={state.pageLoading}
          pageRefreshing={state.pageRefreshing}
          pageError={state.pageError}
          resolvedTableView={state.resolvedTableView}
        />
      </div>
    </motion.div>
  );
}
