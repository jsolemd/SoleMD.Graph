import { useCallback, useEffect, useState } from "react";
import { fetchGraphRagQuery } from "@/features/graph/lib/detail-service";
import type { GraphBundle, GraphBundleQueries, GraphNode, GraphRagQueryResponsePayload } from "@/features/graph/types";

export function useRagQuery({
  bundle,
  queries,
  isAsk,
  selectedNode,
  getPromptText,
  setHighlightedPointIndices,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries | null;
  isAsk: boolean;
  selectedNode: GraphNode | null;
  getPromptText: () => string;
  setHighlightedPointIndices: (indices: number[]) => void;
}) {
  const [ragResponse, setRagResponse] = useState<GraphRagQueryResponsePayload | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map RAG response paper IDs to point indices for highlighting
  useEffect(() => {
    if (!ragResponse || !queries) {
      return;
    }

    const paperIds = Array.from(
      new Set(
        ragResponse.graph_signals
          .map((signal) => signal.paper_id)
          .filter((paperId): paperId is string => Boolean(paperId)),
      ),
    );
    if (paperIds.length === 0) {
      setHighlightedPointIndices([]);
      return;
    }

    let cancelled = false;
    queries
      .getPaperNodesByPaperIds(paperIds)
      .then((paperNodes) => {
        if (cancelled) {
          return;
        }

        const indices = Array.from(
          new Set(
            Object.values(paperNodes)
              .map((node) => node.index)
              .filter((index) => Number.isFinite(index)),
          ),
        );
        setHighlightedPointIndices(indices);
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedPointIndices([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [queries, ragResponse, setHighlightedPointIndices]);

  const handleSubmit = useCallback(() => {
    const query = getPromptText().trim();
    if (!query || !isAsk) {
      return;
    }

    setIsSubmitting(true);
    setHighlightedPointIndices([]);
    fetchGraphRagQuery({
      bundle,
      query,
      selectedNode,
      k: 6,
      rerankTopn: 18,
      useLexical: true,
      generateAnswer: true,
    })
      .then((response) => {
        setRagResponse(response);
        setRagError(null);
      })
      .catch((error) => {
        setRagResponse(null);
        setRagError(error instanceof Error ? error.message : "Failed to query the graph");
        setHighlightedPointIndices([]);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [getPromptText, bundle, isAsk, selectedNode, setHighlightedPointIndices]);

  /** Clear RAG state. Pass `true` for errorOnly to keep the response (e.g. when staying in ask mode). */
  const clearRag = useCallback((errorOnly = false) => {
    setRagError(null);
    if (!errorOnly) {
      setRagResponse(null);
      setHighlightedPointIndices([]);
    }
  }, [setHighlightedPointIndices]);

  return { ragResponse, ragError, isSubmitting, handleSubmit, clearRag };
}
