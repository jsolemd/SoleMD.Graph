"use client";

import { useMemo } from "react";
import { Button, Text } from "@mantine/core";
import {
  PanelInlineLoader,
  panelTextMutedStyle,
} from "@/features/graph/components/panels/PanelShell";
import { WikiGraph } from "@/features/wiki/components/WikiGraph";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import type { WikiGraphIntents } from "@/features/wiki/graph-runtime";

interface WikiGraphViewProps {
  graphReleaseId: string;
  onOpenPage: (slug: string) => void;
  onSelectEntity?: (conceptId: string) => void;
  onFlashPapers?: (paperIds: string[]) => void;
  onFocusPaper?: (paperId: string) => void;
}

export function WikiGraphView({
  graphReleaseId,
  onOpenPage,
  onSelectEntity,
  onFlashPapers,
  onFocusPaper,
}: WikiGraphViewProps) {
  const graphData = useWikiStore((s) => s.graphData);
  const graphLoading = useWikiStore((s) => s.graphLoading);
  const graphError = useWikiStore((s) => s.graphError);
  const fetchGraphData = useWikiStore((s) => s.fetchGraphData);

  const intents: WikiGraphIntents = useMemo(
    () => ({
      onOpenPage,
      onSelectEntity,
      onFlashPapers,
      onFocusPaper,
    }),
    [onOpenPage, onSelectEntity, onFlashPapers, onFocusPaper],
  );

  if (graphError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Text style={{ ...panelTextMutedStyle, color: "var(--error-text)" }}>
          {graphError}
        </Text>
        <Button
          variant="light"
          size="xs"
          onClick={() => void fetchGraphData(graphReleaseId, { force: true })}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (graphLoading || !graphData) {
    return (
      <div className="flex h-full items-center justify-center">
        <PanelInlineLoader />
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Text style={panelTextMutedStyle}>No wiki pages found.</Text>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-[320px] flex-1 overflow-hidden rounded-md"
        data-testid="wiki-graph-surface"
        style={{
          border: "1px solid var(--graph-panel-border, rgba(255,255,255,0.08))",
          background: "var(--graph-panel-bg)",
        }}
      >
        <WikiGraph intents={intents} />
      </div>
    </div>
  );
}
