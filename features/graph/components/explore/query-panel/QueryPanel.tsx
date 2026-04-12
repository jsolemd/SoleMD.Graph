"use client";

import { memo } from "react";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries } from "@/features/graph/types";
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
      defaultWidth={420}
      onClose={() => closePanel("query")}
    >
      <PanelBody panelId="query">
        <SqlExplorerContent runReadOnlyQuery={runReadOnlyQuery} />
      </PanelBody>
    </PanelShell>
  );
}

export const QueryPanel = memo(QueryPanelComponent);
QueryPanel.displayName = "QueryPanel";
