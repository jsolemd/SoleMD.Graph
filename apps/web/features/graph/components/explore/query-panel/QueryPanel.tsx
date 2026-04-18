"use client";

import { memo } from "react";
import { PANEL_DOCK_WIDTH_PX } from "@/lib/density";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries } from "@solemd/graph";
import { PanelBody, PanelShell } from "../../panels/PanelShell";
import { SqlExplorerContent } from "./SqlExplorerContent";

interface QueryPanelProps {
  runReadOnlyQuery: GraphBundleQueries["runReadOnlyQuery"];
}

function QueryPanelComponent({ runReadOnlyQuery }: QueryPanelProps) {
  const closePanel = useDashboardStore((s) => s.closePanel);

  return (
    <PanelShell
      id="query"
      title="SQL Explorer"
      defaultWidth={PANEL_DOCK_WIDTH_PX.query}
      onClose={() => closePanel("query")}
    >
      <PanelBody>
        <SqlExplorerContent runReadOnlyQuery={runReadOnlyQuery} />
      </PanelBody>
    </PanelShell>
  );
}

export const QueryPanel = memo(QueryPanelComponent);
QueryPanel.displayName = "QueryPanel";
