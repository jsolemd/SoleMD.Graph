"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphPointRecord,
  GraphSelectionDetail,
} from "@solemd/graph";

export function useDetailData({
  bundle,
  queries,
  selectedNode,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
  selectedNode: GraphPointRecord | null;
}) {
  const [resolved, setResolved] = useState<{
    detail: GraphSelectionDetail | null;
    error: string | null;
    id: string | null;
  }>({ detail: null, error: null, id: null });
  const [paperDocumentState, setPaperDocumentState] = useState<{
    document: GraphSelectionDetail["paperDocument"];
    error: string | null;
    id: string | null;
  }>({ document: null, error: null, id: null });

  void bundle;
  const [debouncedSelectedNode] = useDebouncedValue(selectedNode, 80);

  useEffect(() => {
    if (!debouncedSelectedNode) return;
    let cancelled = false;

    queries
      .getSelectionDetail(debouncedSelectedNode)
      .then((detail) => {
        if (!cancelled) {
          setResolved({ detail, error: null, id: debouncedSelectedNode.id });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResolved({
            detail: null,
            error: error instanceof Error ? error.message : "Failed to load detail",
            id: debouncedSelectedNode.id,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSelectedNode, queries]);

  useEffect(() => {
    if (!debouncedSelectedNode) return;
    let cancelled = false;
    const paperId = debouncedSelectedNode.paperId ?? debouncedSelectedNode.id;

    queries
      .getPaperDocument(paperId)
      .then((paperDocument) => {
        if (!cancelled) {
          setPaperDocumentState({
            document: paperDocument,
            error: null,
            id: debouncedSelectedNode.id,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPaperDocumentState({
            document: null,
            error:
              error instanceof Error ? error.message : "Failed to load paper document",
            id: debouncedSelectedNode.id,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSelectedNode, queries]);

  const isResolved = selectedNode ? resolved.id === selectedNode.id : false;
  const isDocumentResolved = selectedNode
    ? paperDocumentState.id === selectedNode.id
    : false;
  const resolvedDetail =
    isResolved && resolved.detail
      ? {
          ...resolved.detail,
          paperDocument: isDocumentResolved ? paperDocumentState.document : null,
        }
      : null;

  return {
    detail: resolvedDetail,
    error: isResolved ? resolved.error : null,
    paperDocumentError: isDocumentResolved ? paperDocumentState.error : null,
    loading: Boolean(selectedNode) && !isResolved,
    paperDocumentLoading: Boolean(selectedNode) && !isDocumentResolved,
  };
}
