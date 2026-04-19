"use client";

import { useCallback } from "react";
import { useGraphFocus } from "@/features/graph/cosmograph";
import { useGraphStore } from "@/features/graph/stores";
import { DataTableGridView, type DataTableBodyProps } from "./DataTableGridView";
import type { GraphPointRecord } from "@solemd/graph";

export function DataTableBody({
  activeLayer,
  pageRows,
  startIdx,
  pageLoading,
  pageError,
  resolvedTableView,
}: DataTableBodyProps) {
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const { focusNode } = useGraphFocus();

  const handleRowClick = useCallback(
    (node: GraphPointRecord) => {
      // Focus + zoom only — never trigger Cosmograph's selectPoint here.
      // Selection is for multi-select tools (lasso, rect, filters), not
      // single-row navigation.  selectNode() inside focusNode already
      // sets the detail panel highlight and table row accent.
      focusNode(node, { zoomDuration: 250 });
    },
    [focusNode]
  );

  return (
    <DataTableGridView
      activeLayer={activeLayer}
      pageRows={pageRows}
      startIdx={startIdx}
      pageLoading={pageLoading}
      pageError={pageError}
      resolvedTableView={resolvedTableView}
      selectedNodeId={selectedNode?.id}
      onRowActivate={handleRowClick}
    />
  );
}
