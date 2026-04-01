"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { useDashboardStore } from "@/features/graph/stores";
import { smooth } from "@/lib/motion";
import { useDragResize } from "@/features/graph/hooks/use-drag-resize";
import type { GraphBundleQueries } from "@/features/graph/types";
import { useTableData } from "./use-table-data";
import { DataTableToolbar } from "./DataTableToolbar";
import { DataTableBody } from "./DataTableBody";

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{
        y: smooth,
        opacity: { duration: 0.1, ease: "easeOut" },
      }}
      className="absolute left-0 right-0 z-20 flex flex-col rounded-t-xl"
      style={{
        bottom: showTimeline ? 44 : 0,
        height: tableHeight,
        backgroundColor: "var(--graph-panel-bg)",
        border: "1px solid var(--graph-panel-border)",
        boxShadow: "var(--graph-panel-shadow)",
      }}
    >
      {/* Resize handle — thin and subtle */}
      <div
        className="flex h-1.5 cursor-row-resize items-center justify-center transition-colors hover:bg-[var(--interactive-hover)]"
        onMouseDown={handleDragStart}
      >
        <div
          className="h-px w-6 rounded-full"
          style={{ backgroundColor: "var(--graph-panel-text-dim)" }}
        />
      </div>

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

      <div className="flex-1 overflow-auto px-2.5">
        <DataTableBody
          activeLayer={state.activeLayer}
          pageRows={state.pageRows}
          startIdx={state.startIdx}
          pageLoading={state.pageLoading}
          pageError={state.pageError}
          resolvedTableView={state.resolvedTableView}
        />
      </div>
    </motion.div>
  );
}

export const DataTable = memo(DataTableComponent);
DataTable.displayName = "DataTable";
