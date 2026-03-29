import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetchGraphRagQuery } from "@/features/graph/lib/detail-service";
import {
  GRAPH_ASK_ENGINE_ERROR_DATA_PART,
  extractLatestEvidencePayload,
  getLatestAssistantText,
  GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
  type GraphAskChatMessage,
} from "@/features/graph/lib/rag-chat";
import { getRagOverlayProducerId } from "@/features/graph/lib/overlay-producers";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphPointRecord,
  GraphRagQueryResponsePayload,
  OverlayProducerId,
} from "@/features/graph/types";
import type { EvidenceAssistRequest } from "./evidence-assist";
import {
  clearRagGraphOverlay,
  syncRagGraphSignals,
} from "./rag-graph-sync";

export interface RagResponseSession {
  origin: "ask" | "compose";
  evidenceIntent: EvidenceAssistRequest["intent"] | null;
  queryPreview: string | null;
}

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
  selectedNode: GraphPointRecord | null;
  getPromptText: () => string;
  setHighlightedPointIndices: (indices: number[]) => void;
}) {
  const [ragResponse, setRagResponse] = useState<GraphRagQueryResponsePayload | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ragSession, setRagSession] = useState<RagResponseSession | null>(null);
  const activeRequestIdRef = useRef(0);
  const activeOverlayProducerIdRef = useRef<OverlayProducerId | null>(null);

  const clearOwnedOverlay = useCallback((producerId?: OverlayProducerId | null) => {
    const ownedProducerId = producerId ?? activeOverlayProducerIdRef.current;
    if (!queries || !ownedProducerId) {
      return;
    }

    if (activeOverlayProducerIdRef.current === ownedProducerId) {
      activeOverlayProducerIdRef.current = null;
    }

    void clearRagGraphOverlay({
      producerId: ownedProducerId,
      queries,
    });
  }, [queries]);

  const askTransport = useMemo(
    () => new DefaultChatTransport<GraphAskChatMessage>({ api: "/api/evidence/chat" }),
    [],
  );

  const askChat = useChat<GraphAskChatMessage>({
    transport: askTransport,
    experimental_throttle: 32,
    onData: (part) => {
      if (
        part.type === GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART &&
        part.data.client_request_id === activeRequestIdRef.current
      ) {
        setRagResponse(part.data.response);
        setRagError(null);
        return;
      }

      if (
        part.type === GRAPH_ASK_ENGINE_ERROR_DATA_PART &&
        part.data.client_request_id === activeRequestIdRef.current
      ) {
        setIsSubmitting(false);
        setRagResponse(null);
        setRagError(part.data.error_message);
        setHighlightedPointIndices([]);
        clearOwnedOverlay();
        return;
      }
    },
    onError: (error) => {
      setIsSubmitting(false);
      setRagResponse(null);
      setRagError(error.message);
      setHighlightedPointIndices([]);
      clearOwnedOverlay();
    },
    onFinish: ({ messages }) => {
      const latestEvidencePayload = extractLatestEvidencePayload(messages);
      if (
        !latestEvidencePayload ||
        latestEvidencePayload.client_request_id !== activeRequestIdRef.current
      ) {
        return;
      }

      setIsSubmitting(false);
      setRagResponse(latestEvidencePayload.response);
      setRagError(null);
    },
  });
  const streamedAskAnswer = getLatestAssistantText(askChat.messages);

  // Resolve graph signals into active point indices, promoting missing papers through overlay first.
  useEffect(() => {
    if (!ragResponse || !queries) {
      return;
    }

    const producerId = activeOverlayProducerIdRef.current;
    if (!producerId) {
      return;
    }

    let cancelled = false;
    syncRagGraphSignals({
      producerId,
      queries,
      ragResponse,
    })
      .then(({ highlightedPointIndices }) => {
        if (cancelled) {
          return;
        }

        setHighlightedPointIndices(highlightedPointIndices);
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedPointIndices([]);
          clearOwnedOverlay(producerId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearOwnedOverlay, queries, ragResponse, setHighlightedPointIndices]);

  const runQuery = useCallback(({
    query,
    origin,
    evidenceIntent = null,
    queryPreview = null,
    generateAnswer = true,
  }: {
    query: string;
    origin: RagResponseSession["origin"];
    evidenceIntent?: EvidenceAssistRequest["intent"] | null;
    queryPreview?: string | null;
    generateAnswer?: boolean;
  }) => {
    const nextOverlayProducerId = getRagOverlayProducerId({
      origin,
      evidenceIntent,
    });

    clearOwnedOverlay();
    activeOverlayProducerIdRef.current = nextOverlayProducerId;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setIsSubmitting(true);
    setRagSession({
      origin,
      evidenceIntent,
      queryPreview,
    });
    setHighlightedPointIndices([]);
    fetchGraphRagQuery({
      bundle,
      query,
      selectedNode,
      evidenceIntent,
      k: 6,
      rerankTopn: 18,
      useLexical: true,
      generateAnswer,
    })
      .then((response) => {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        setRagResponse(response);
        setRagError(null);
      })
      .catch((error) => {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        setRagResponse(null);
        setRagError(error instanceof Error ? error.message : "Failed to query the graph");
        setHighlightedPointIndices([]);
        clearOwnedOverlay(nextOverlayProducerId);
      })
      .finally(() => {
        if (activeRequestIdRef.current === requestId) {
          setIsSubmitting(false);
        }
      });
  }, [bundle, clearOwnedOverlay, selectedNode, setHighlightedPointIndices]);

  const handleSubmit = useCallback(() => {
    const query = getPromptText().trim();
    if (!query || !isAsk || isSubmitting) {
      return;
    }

    const requestId = activeRequestIdRef.current + 1;
    clearOwnedOverlay();
    activeOverlayProducerIdRef.current = getRagOverlayProducerId({
      origin: "ask",
      evidenceIntent: null,
    });
    activeRequestIdRef.current = requestId;
    setIsSubmitting(true);
    setRagResponse(null);
    setRagError(null);
    setRagSession({
      origin: "ask",
      evidenceIntent: null,
      queryPreview: null,
    });
    setHighlightedPointIndices([]);
    askChat.clearError();
    askChat.setMessages([]);
    void askChat.sendMessage(
      { text: query },
      {
        body: {
          graph_release_id: bundle.bundleChecksum || bundle.runId || "current",
          selected_layer_key: selectedNode ? "paper" : null,
          selected_node_id: selectedNode?.id ?? null,
          selected_paper_id: selectedNode?.paperId ?? selectedNode?.id ?? null,
          selected_cluster_id: null,
          client_request_id: requestId,
          evidence_intent: null,
          k: 6,
          rerank_topn: 18,
          use_lexical: true,
          generate_answer: true,
        },
      },
    ).catch((error) => {
      if (activeRequestIdRef.current !== requestId) {
        return;
      }
      setIsSubmitting(false);
      setRagResponse(null);
      setRagError(error instanceof Error ? error.message : "Failed to query the graph");
      setHighlightedPointIndices([]);
      clearOwnedOverlay(activeOverlayProducerIdRef.current);
    });
  }, [
    askChat,
    bundle.bundleChecksum,
    bundle.runId,
    clearOwnedOverlay,
    getPromptText,
    isAsk,
    isSubmitting,
    selectedNode,
    setHighlightedPointIndices,
  ]);

  const runEvidenceAssistQuery = useCallback((request: EvidenceAssistRequest) => {
    runQuery({
      query: request.queryText,
      origin: "compose",
      evidenceIntent: request.intent,
      queryPreview: request.previewText,
    });
  }, [runQuery]);

  /** Clear RAG state. Pass `true` for errorOnly to keep the response (e.g. when staying in ask mode). */
  const clearRag = useCallback((errorOnly = false) => {
    activeRequestIdRef.current += 1;
    setIsSubmitting(false);
    setRagError(null);
    if (!errorOnly) {
      void askChat.stop();
      askChat.clearError();
      askChat.setMessages([]);
      setRagResponse(null);
      setRagSession(null);
      setHighlightedPointIndices([]);
      clearOwnedOverlay();
    }
  }, [askChat, clearOwnedOverlay, setHighlightedPointIndices]);

  return {
    ragResponse,
    streamedAskAnswer,
    ragError,
    ragSession,
    isSubmitting,
    handleSubmit,
    runEvidenceAssistQuery,
    clearRag,
  };
}
