"use client";

import { memo, useCallback } from "react";
import { Stack } from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import { useGraphSelection, useGraphCamera } from "@/features/graph/cosmograph";
import { useGraphModeController } from "@/features/graph/hooks/use-graph-mode-controller";
import { hasCurrentPointScopeSql } from "@/features/graph/lib/selection-query-state";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { APP_CHROME_PX } from "@/lib/density";
import type {
  GraphBundle,
  GraphBundleQueries,
} from "@/features/graph/types";
import { PanelBody, PanelDivider, PanelHeaderActions, PanelIconAction, PanelShell } from "./PanelShell";
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

function DetailPanelComponent({
  bundle,
  queries,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
}) {
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const selectNode = useGraphStore((state) => state.selectNode);
  const { applyMode } = useGraphModeController();
  const currentPointScopeSql = useDashboardStore((state) => state.currentPointScopeSql);
  const selectedPointCount = useDashboardStore((state) => state.selectedPointCount);
  const { clearFocusedPoint, getSelectedPointIndices } = useGraphSelection();
  const { fitViewByIndices } = useGraphCamera();

  const hasSelectionContext =
    hasCurrentPointScopeSql(currentPointScopeSql) || selectedPointCount > 1;

  const closePanel = useCallback(() => {
    selectNode(null);
    clearFocusedPoint();
  }, [clearFocusedPoint, selectNode]);

  const handleBackToSelection = useCallback(() => {
    selectNode(null);
    clearFocusedPoint();

    const selectedIndices = getSelectedPointIndices();
    if (selectedIndices.length > 1) {
      fitViewByIndices(selectedIndices, 250, 0.1);
    }
  }, [clearFocusedPoint, fitViewByIndices, getSelectedPointIndices, selectNode]);

  const {
    detail,
    error,
    loading,
    paperDocumentError,
    paperDocumentLoading,
  } = useDetailData({ bundle, queries, selectedNode });

  const { copyLabel, setCopied } = useCopyFeedback(selectedNode?.id ?? null);

  const handleAsk = useCallback(() => {
    applyMode("ask");
  }, [applyMode]);

  const handleCopyNote = useCallback(async () => {
    if (!selectedNode) return;

    const markdown = buildPaperNoteMarkdown({
      nodeDisplayPreview: selectedNode.displayPreview,
      paper: detail?.paper ?? null,
      paperDocument: detail?.paperDocument ?? null,
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
    <PanelShell
      id="detail"
      title="Selection"
      side="right"
      defaultWidth={APP_CHROME_PX.detailPanelWidth}
      onClose={closePanel}
      headerNavigation={
        hasSelectionContext ? (
          <PanelHeaderActions>
            <PanelIconAction
              label="Back to selection"
              icon={<ArrowLeft size={12} />}
              onClick={handleBackToSelection}
              aria-label="Back to selection"
            />
          </PanelHeaderActions>
        ) : null
      }
    >
      <PanelBody>
        <Stack gap="sm">
          <DetailHeader node={selectedNode} paper={detail?.paper ?? null} />

          <SelectionActionBar
            onCopyNote={handleCopyNote}
            onAsk={handleAsk}
            pdfUrl={null}
            copyLabel={copyLabel}
            onOpenGraphPaper={null}
            openGraphPaperLabel={undefined}
          />

          <PanelDivider />

          <PaperDocumentSection
            nodeDisplayPreview={selectedNode.displayPreview}
            paper={detail?.paper ?? null}
            paperDocument={detail?.paperDocument ?? null}
            loading={loading || paperDocumentLoading}
            error={error ?? paperDocumentError}
          />

          <PaperSection paper={detail?.paper ?? null} />

          <DetailAccordions
            detail={detail}
          />
        </Stack>
      </PanelBody>
    </PanelShell>
  );
}

export const DetailPanel = memo(DetailPanelComponent);
DetailPanel.displayName = "DetailPanel";
