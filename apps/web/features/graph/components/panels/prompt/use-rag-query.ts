import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  buildGraphRagRequestContext,
  fetchGraphRagQuery,
} from "@/features/graph/lib/detail-service";
import {
  GRAPH_ASK_ENGINE_ERROR_DATA_PART,
  extractLatestEvidencePayload,
  getLatestAssistantText,
  GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
  type GraphAskChatMessage,
} from "@/features/graph/lib/rag-chat";
import {
  getRagOverlayProducerId,
  RAG_ANSWER_SELECTION_SOURCE_ID,
} from "@/features/graph/lib/overlay-producers";
import { useDashboardStore } from "@/features/graph/stores";
import { useShallow } from "zustand/react/shallow";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphPointRecord,
  OverlayProducerId,
} from "@solemd/graph";
import type { GraphRagQueryResponsePayload } from "@solemd/api-client/shared/graph-rag";
import type { EvidenceAssistRequest } from "./evidence-assist";
import { resolvePromptScopeRequest } from "./prompt-scope-request";
import {
  clearRagGraphOverlay,
  syncRagGraphSignals,
} from "./rag-graph-sync";

export interface RagResponseSession {
  origin: "ask" | "compose";
  evidenceIntent: EvidenceAssistRequest["commandId"] | null;
  queryPreview: string | null;
}

export interface RagGraphAvailabilitySummary {
  activeResolvedGraphPaperRefs: string[];
  overlayPromotedGraphPaperRefs: string[];
  evidenceOnlyGraphPaperRefs: string[];
}

export function useRagQuery({
  bundle,
  queries,
  isAsk,
  selectedNode,
  currentPointScopeSql,
  getPromptText,
  selectionScopeEnabled = false,
  activeSelectionSourceId,
  setSelectedPointCount,
  setActiveSelectionSourceId,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries | null;
  isAsk: boolean;
  selectedNode: GraphPointRecord | null;
  currentPointScopeSql: string | null;
  getPromptText: () => string;
  selectionScopeEnabled?: boolean;
  activeSelectionSourceId: string | null;
  setSelectedPointCount: (count: number) => void;
  setActiveSelectionSourceId: (sourceId: string | null) => void;
}) {
  const {
    ragResponse,
    ragError,
    isSubmitting,
    ragSession,
    ragGraphAvailability,
    setRagResponse,
    setRagError,
    setIsSubmitting,
    setRagSession,
    setRagGraphAvailability,
    setRagPanelOpen,
    setStreamedAskAnswer,
  } = useDashboardStore(
    useShallow((state) => ({
      ragResponse: state.ragResponse,
      ragError: state.ragError,
      isSubmitting: state.isRagSubmitting,
      ragSession: state.ragSession,
      ragGraphAvailability: state.ragGraphAvailability,
      setRagResponse: state.setRagResponse,
      setRagError: state.setRagError,
      setIsSubmitting: state.setIsRagSubmitting,
      setRagSession: state.setRagSession,
      setRagGraphAvailability: state.setRagGraphAvailability,
      setRagPanelOpen: state.setRagPanelOpen,
      setStreamedAskAnswer: state.setStreamedAskAnswer,
    })),
  );

  const activeRequestIdRef = useRef(0);
  const activeOverlayProducerIdRef = useRef<OverlayProducerId | null>(null);
  const appliedRagResponseRequestIdRef = useRef<string | null>(null);
  const activeSelectionSourceIdRef = useRef(activeSelectionSourceId);
  activeSelectionSourceIdRef.current = activeSelectionSourceId;

  const clearAnswerSelection = useCallback(() => {
    if (
      !queries ||
      activeSelectionSourceIdRef.current !== RAG_ANSWER_SELECTION_SOURCE_ID
    ) {
      return;
    }

    void queries.setSelectedPointIndices([]);
    setSelectedPointCount(0);
    setActiveSelectionSourceId(null);
  }, [queries, setActiveSelectionSourceId, setSelectedPointCount]);

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

  const clearRagResponse = useCallback(() => {
    appliedRagResponseRequestIdRef.current = null;
    setRagResponse(null);
  }, [setRagResponse]);

  const applyRagResponse = useCallback((response: GraphRagQueryResponsePayload) => {
    if (appliedRagResponseRequestIdRef.current === response.meta.request_id) {
      return;
    }

    appliedRagResponseRequestIdRef.current = response.meta.request_id;
    setRagResponse(response);
  }, [setRagResponse]);

  const askTransport = useMemo(
    () => new DefaultChatTransport<GraphAskChatMessage>({ api: "/api/evidence/chat" }),
    [],
  );

  const resolveSelectionScopeRequest = useCallback(async () => {
    return resolvePromptScopeRequest({
      selectionScopeEnabled,
      currentPointScopeSql,
      queries,
      selectedNode,
    });
  }, [currentPointScopeSql, queries, selectedNode, selectionScopeEnabled]);

  const askChat = useChat<GraphAskChatMessage>({
    transport: askTransport,
    experimental_throttle: 32,
    onData: (part) => {
      if (
        part.type === GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART &&
        part.data.client_request_id === activeRequestIdRef.current
      ) {
        applyRagResponse(part.data.response);
        setRagError(null);
        return;
      }

      if (
        part.type === GRAPH_ASK_ENGINE_ERROR_DATA_PART &&
        part.data.client_request_id === activeRequestIdRef.current
      ) {
        setIsSubmitting(false);
        clearRagResponse();
        setRagError(part.data.error_message);
        setRagGraphAvailability(null);
        clearOwnedOverlay();
        clearAnswerSelection();
        return;
      }
    },
    onError: (error) => {
      setIsSubmitting(false);
      clearRagResponse();
      setRagError(error.message);
      setRagGraphAvailability(null);
      clearOwnedOverlay();
      clearAnswerSelection();
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
      applyRagResponse(latestEvidencePayload.response);
      setRagError(null);
    },
  });
  const streamedAskAnswer = getLatestAssistantText(askChat.messages);

  // Sync streamed answer text to store so RagResponsePanel (mounted outside prompt) can read it.
  useEffect(() => {
    setStreamedAskAnswer(streamedAskAnswer);
  }, [streamedAskAnswer, setStreamedAskAnswer]);

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
      .then(({ answerSelectedPointIndices, graphAvailabilitySummary }) => {
        if (cancelled) {
          return;
        }

        setRagGraphAvailability(graphAvailabilitySummary);
        void queries.setSelectedPointIndices(answerSelectedPointIndices);
        setSelectedPointCount(answerSelectedPointIndices.length);
        setActiveSelectionSourceId(
          answerSelectedPointIndices.length > 0
            ? RAG_ANSWER_SELECTION_SOURCE_ID
            : null,
        );
      })
      .catch((error: unknown) => {
        console.error("[useRagQuery] syncRagGraphSignals failed", error);
        if (!cancelled) {
          setRagGraphAvailability(null);
          clearOwnedOverlay(producerId);
          clearAnswerSelection();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    clearAnswerSelection,
    clearOwnedOverlay,
    queries,
    ragResponse,
    setRagGraphAvailability,
    setActiveSelectionSourceId,
    setSelectedPointCount,
  ]);

  const prepareRagRequest = useCallback(async (session: RagResponseSession) => {
    const scopeRequest = await resolveSelectionScopeRequest();
    const producerId = getRagOverlayProducerId({
      origin: session.origin,
      evidenceIntent: session.evidenceIntent,
    });

    clearOwnedOverlay();
    clearAnswerSelection();
    activeOverlayProducerIdRef.current = producerId;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setIsSubmitting(true);
    clearRagResponse();
    setRagError(null);
    setRagGraphAvailability(null);
    setRagSession(session);
    setRagPanelOpen(true);

    return { requestId, scopeRequest, producerId };
  }, [
    clearAnswerSelection,
    clearOwnedOverlay,
    clearRagResponse,
    resolveSelectionScopeRequest,
    setIsSubmitting,
    setRagError,
    setRagGraphAvailability,
    setRagPanelOpen,
    setRagSession,
  ]);

  const handleRagError = useCallback((error: unknown, requestId: number, producerId?: OverlayProducerId | null) => {
    if (activeRequestIdRef.current !== requestId) {
      return;
    }
    setIsSubmitting(false);
    clearRagResponse();
    setRagError(error instanceof Error ? error.message : "Failed to query the graph");
    setRagGraphAvailability(null);
    clearOwnedOverlay(producerId);
    clearAnswerSelection();
  }, [
    clearAnswerSelection,
    clearOwnedOverlay,
    clearRagResponse,
    setIsSubmitting,
    setRagError,
    setRagGraphAvailability,
  ]);

  const runQuery = useCallback(async ({
    query,
    origin,
    evidenceIntent = null,
    queryPreview = null,
    generateAnswer = true,
  }: {
    query: string;
    origin: RagResponseSession["origin"];
    evidenceIntent?: EvidenceAssistRequest["commandId"] | null;
    queryPreview?: string | null;
    generateAnswer?: boolean;
  }) => {
    let prepared: Awaited<ReturnType<typeof prepareRagRequest>>;
    try {
      prepared = await prepareRagRequest({ origin, evidenceIntent, queryPreview });
    } catch (error) {
      setRagError(error instanceof Error ? error.message : "Failed to resolve selection scope");
      return;
    }

    const { requestId, scopeRequest, producerId } = prepared;
    fetchGraphRagQuery({
      bundle,
      query,
      selectedNode,
      selectionGraphPaperRefs: scopeRequest.selectionGraphPaperRefs,
      scopeMode: scopeRequest.scopeMode,
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
        applyRagResponse(response);
        setRagError(null);
      })
      .catch((error) => handleRagError(error, requestId, producerId))
      .finally(() => {
        if (activeRequestIdRef.current === requestId) {
          setIsSubmitting(false);
        }
      });
  }, [
    applyRagResponse,
    bundle,
    handleRagError,
    prepareRagRequest,
    selectedNode,
    setIsSubmitting,
    setRagError,
  ]);

  const handleSubmit = useCallback(() => {
    const query = getPromptText().trim();
    if (!query || !isAsk || isSubmitting) {
      return;
    }
    void (async () => {
      let prepared: Awaited<ReturnType<typeof prepareRagRequest>>;
      try {
        prepared = await prepareRagRequest({ origin: "ask", evidenceIntent: null, queryPreview: null });
      } catch (error) {
        setRagError(error instanceof Error ? error.message : "Failed to resolve selection scope");
        return;
      }

      const { requestId, scopeRequest } = prepared;
      askChat.clearError();
      askChat.setMessages([]);
      void askChat.sendMessage(
        { text: query },
        {
          body: {
            ...buildGraphRagRequestContext({
              bundle,
              selectedNode,
              selectionGraphPaperRefs: scopeRequest.selectionGraphPaperRefs,
              scopeMode: scopeRequest.scopeMode,
            }),
            client_request_id: requestId,
            k: 6,
            rerank_topn: 18,
            use_lexical: true,
            generate_answer: true,
          },
        },
      ).catch((error) => handleRagError(error, requestId, activeOverlayProducerIdRef.current));
    })();
  }, [
    askChat,
    bundle,
    getPromptText,
    handleRagError,
    isAsk,
    isSubmitting,
    prepareRagRequest,
    selectedNode,
    setRagError,
  ]);

  const runEvidenceAssistQuery = useCallback((request: EvidenceAssistRequest) => {
    void runQuery({
      query: request.queryText,
      origin: "compose",
      evidenceIntent: request.commandId,
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
      clearRagResponse();
      setRagGraphAvailability(null);
      setRagSession(null);
      setStreamedAskAnswer(null);
      setRagPanelOpen(false);
      clearOwnedOverlay();
      clearAnswerSelection();
    }
  }, [
    askChat,
    clearAnswerSelection,
    clearOwnedOverlay,
    clearRagResponse,
    setIsSubmitting,
    setRagError,
    setRagGraphAvailability,
    setRagPanelOpen,
    setRagSession,
    setStreamedAskAnswer,
  ]);

  return {
    ragResponse,
    streamedAskAnswer,
    ragError,
    ragSession,
    ragGraphAvailability,
    isSubmitting,
    handleSubmit,
    runEvidenceAssistQuery,
    clearRag,
  };
}
