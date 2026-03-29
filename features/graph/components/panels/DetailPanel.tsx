"use client";

import { useCallback } from "react";
import { Stack } from "@mantine/core";
import { useGraphStore } from "@/features/graph/stores";
import type {
  GraphBundle,
  GraphBundleQueries,
} from "@/features/graph/types";
import { PanelShell } from "./PanelShell";
import {
  buildPaperNoteMarkdown,
} from "./detail/helpers";
import {
  DetailHeader,
  PaperDocumentSection,
  PaperSection,
  SelectionActionBar,
} from "./detail/primary";
import { DetailAccordions } from "./detail/DetailAccordions";
import { useCopyFeedback } from "./detail/use-copy-feedback";
import { useDetailData } from "./detail/use-detail-data";

export function DetailPanel({
  bundle,
  queries,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
}) {
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setMode = useGraphStore((state) => state.setMode);

  const closePanel = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const {
    detail,
    error,
    loading,
    paperDocumentError,
    paperDocumentLoading,
  } = useDetailData({ bundle, queries, selectedNode });

  const { copyLabel, setCopied } = useCopyFeedback(selectedNode?.id ?? null);

  const handleAsk = useCallback(() => {
    setMode("ask");
  }, [setMode]);

  const handleCopyNote = useCallback(async () => {
    if (!selectedNode) return;

    const markdown = buildPaperNoteMarkdown({
      nodeDisplayPreview: selectedNode.displayPreview,
      paper: detail?.paper ?? null,
      paperDocument: detail?.paperDocument ?? null,
      servicePaper: null,
    });

    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }, [detail, selectedNode, setCopied]);

  if (!selectedNode) return null;

  return (
    <PanelShell title="Selection" side="right" width={380} onClose={closePanel}>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="lg">
          <DetailHeader node={selectedNode} paper={detail?.paper ?? null} />

          <SelectionActionBar
            onCopyNote={handleCopyNote}
            onAsk={handleAsk}
            pdfUrl={null}
            copyLabel={copyLabel}
            onOpenGraphPaper={null}
            openGraphPaperLabel={undefined}
          />

          <div style={{ height: 1, backgroundColor: "var(--graph-panel-border)" }} />

          <PaperDocumentSection
            nodeDisplayPreview={selectedNode.displayPreview}
            paper={detail?.paper ?? null}
            paperDocument={detail?.paperDocument ?? null}
            loading={loading || paperDocumentLoading}
            error={error ?? paperDocumentError}
          />

          <PaperSection paper={detail?.paper ?? null} servicePaper={null} />

          <DetailAccordions
            detail={detail}
          />
        </Stack>
      </div>
    </PanelShell>
  );
}
