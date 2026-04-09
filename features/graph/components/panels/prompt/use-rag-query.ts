import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetchGraphRagQuery } from "@/features/graph/lib/detail-service";
import {
  createGraphInteractionTrace,
  createInteractionTraceStage,
  getInteractionNow,
} from "@/features/graph/lib/interaction-trace";
import {
  GRAPH_ASK_ENGINE_ERROR_DATA_PART,
  extractLatestEvidencePayload,
  getLatestAssistantText,
  GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
  type GraphAskChatMessage,
} from "@/features/graph/lib/rag-chat";
import { hasCurrentPointScopeSql } from "@/features/graph/lib/selection-query-state";
import {
  getRagOverlayProducerId,
  RAG_ANSWER_SELECTION_SOURCE_ID,
} from "@/features/graph/lib/overlay-producers";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphInteractionTrace,
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
  requestId: number;
  origin: "ask" | "compose";
  evidenceIntent: EvidenceAssistRequest["intent"] | null;
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
  const [ragResponse, setRagResponse] = useState<GraphRagQueryResponsePayload | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ragSession, setRagSession] = useState<RagResponseSession | null>(null);
  const [ragGraphAvailability, setRagGraphAvailability] =
    useState<RagGraphAvailabilitySummary | null>(null);
  const [ragInteractionTrace, setRagInteractionTrace] =
    useState<GraphInteractionTrace | null>(null);
  const activeRequestIdRef = useRef(0);
  const activeOverlayProducerIdRef = useRef<OverlayProducerId | null>(null);

  const clearAnswerSelection = useCallback(() => {
    if (!queries || activeSelectionSourceId !== RAG_ANSWER_SELECTION_SOURCE_ID) {
      return;
    }

    void queries.setSelectedPointIndices([]);
    setSelectedPointCount(0);
    setActiveSelectionSourceId(null);
  }, [
    activeSelectionSourceId,
    queries,
    setActiveSelectionSourceId,
    setSelectedPointCount,
  ]);

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

  const resolveSelectionScopeRequest = useCallback(async () => {
    if (!selectionScopeEnabled) {
      return {
        selectionGraphPaperRefs: null,
        scopeMode: null,
      } as const;
    }

    const hasCurrentScope = hasCurrentPointScopeSql(currentPointScopeSql);
    const selectionGraphPaperRefs = queries
      ? Array.from(
          new Set(
            (await queries.getSelectionScopeGraphPaperRefs({
              currentPointScopeSql,
            })).filter(
              (graphPaperRef) => graphPaperRef.trim().length > 0,
            ),
          ),
        )
      : [];
    const fallbackGraphPaperRef =
      !hasCurrentScope ? (selectedNode?.paperId ?? selectedNode?.id ?? null) : null;

    if (selectionGraphPaperRefs.length > 0) {
      return {
        selectionGraphPaperRefs,
        scopeMode: "selection_only" as const,
      };
    }

    if (fallbackGraphPaperRef) {
      return {
        selectionGraphPaperRefs: [fallbackGraphPaperRef],
        scopeMode: "selection_only" as const,
      };
    }

    throw new Error(
      "Selection scope is enabled, but no graph papers are available in the current graph selection.",
    );
  }, [currentPointScopeSql, queries, selectedNode, selectionScopeEnabled]);

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
        setRagGraphAvailability(null);
        setRagInteractionTrace(null);
        clearOwnedOverlay();
        clearAnswerSelection();
        return;
      }
    },
    onError: (error) => {
      setIsSubmitting(false);
      setRagResponse(null);
      setRagError(error.message);
      setRagGraphAvailability(null);
      setRagInteractionTrace(null);
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

    const requestId = ragSession?.requestId ?? activeRequestIdRef.current;
    const producerId = activeOverlayProducerIdRef.current;
    if (!producerId) {
      return;
    }

    let cancelled = false;
    syncRagGraphSignals({
      interactionId: `prompt:${requestId}`,
      origin: {
        surface: "prompt",
        interactionKey: `${ragSession?.origin ?? "ask"}:${producerId}`,
        producerId,
        metadata: {
          requestId,
          origin: ragSession?.origin ?? "ask",
          evidenceIntent: ragSession?.evidenceIntent ?? null,
          queryPreview: ragSession?.queryPreview ?? null,
        },
      },
      producerId,
      queries,
      ragResponse,
    })
      .then(async ({ answerSelectedPointIndices, graphAvailabilitySummary, interactionTrace }) => {
        if (cancelled) {
          return;
        }

        const renderStartedAt = getInteractionNow();
        await queries.setSelectedPointIndices(answerSelectedPointIndices);
        setRagGraphAvailability(graphAvailabilitySummary);
        setSelectedPointCount(answerSelectedPointIndices.length);
        setActiveSelectionSourceId(
          answerSelectedPointIndices.length > 0
            ? RAG_ANSWER_SELECTION_SOURCE_ID
            : null,
        );
        setRagInteractionTrace(
          createGraphInteractionTrace({
            interactionId: interactionTrace.interactionId,
            intentId: interactionTrace.intentId,
            origin: interactionTrace.origin,
            stages: [
              ...interactionTrace.stages,
              createInteractionTraceStage({
                stage: "render",
                startedAt: renderStartedAt,
                metadata: {
                  selectedPointCount: answerSelectedPointIndices.length,
                  overlayPromotedGraphPaperRefCount:
                    graphAvailabilitySummary.overlayPromotedGraphPaperRefs.length,
                },
              }),
            ],
            metadata: interactionTrace.metadata,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRagGraphAvailability(null);
          setRagInteractionTrace(null);
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
    ragSession,
    setActiveSelectionSourceId,
    setSelectedPointCount,
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
    evidenceIntent?: EvidenceAssistRequest["intent"] | null;
    queryPreview?: string | null;
    generateAnswer?: boolean;
  }) => {
    let scopeRequest: {
      selectionGraphPaperRefs: string[] | null;
      scopeMode: "selection_only" | null;
    };
    try {
      scopeRequest = await resolveSelectionScopeRequest();
    } catch (error) {
      setRagError(error instanceof Error ? error.message : "Failed to resolve selection scope");
      return;
    }

    const nextOverlayProducerId = getRagOverlayProducerId({
      origin,
      evidenceIntent,
    });

    clearOwnedOverlay();
    clearAnswerSelection();
    activeOverlayProducerIdRef.current = nextOverlayProducerId;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setIsSubmitting(true);
    setRagSession({
      requestId,
      origin,
      evidenceIntent,
      queryPreview,
    });
    setRagGraphAvailability(null);
    setRagInteractionTrace(null);
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
        setRagResponse(response);
        setRagError(null);
      })
      .catch((error) => {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        setRagResponse(null);
        setRagError(error instanceof Error ? error.message : "Failed to query the graph");
        setRagGraphAvailability(null);
        setRagInteractionTrace(null);
        clearOwnedOverlay(nextOverlayProducerId);
        clearAnswerSelection();
      })
      .finally(() => {
        if (activeRequestIdRef.current === requestId) {
          setIsSubmitting(false);
        }
      });
  }, [
    bundle,
    clearAnswerSelection,
    clearOwnedOverlay,
    resolveSelectionScopeRequest,
    selectedNode,
  ]);

  const handleSubmit = useCallback(() => {
    const query = getPromptText().trim();
    if (!query || !isAsk || isSubmitting) {
      return;
    }
    void (async () => {
      let scopeRequest: {
        selectionGraphPaperRefs: string[] | null;
        scopeMode: "selection_only" | null;
      };
      try {
        scopeRequest = await resolveSelectionScopeRequest();
      } catch (error) {
        setRagError(error instanceof Error ? error.message : "Failed to resolve selection scope");
        return;
      }

      const requestId = activeRequestIdRef.current + 1;
      clearOwnedOverlay();
      clearAnswerSelection();
      activeOverlayProducerIdRef.current = getRagOverlayProducerId({
        origin: "ask",
        evidenceIntent: null,
      });
      activeRequestIdRef.current = requestId;
      setIsSubmitting(true);
      setRagResponse(null);
      setRagError(null);
      setRagGraphAvailability(null);
      setRagSession({
        requestId,
        origin: "ask",
        evidenceIntent: null,
        queryPreview: null,
      });
      setRagInteractionTrace(null);
      askChat.clearError();
      askChat.setMessages([]);
      void askChat.sendMessage(
        { text: query },
        {
          body: {
            graph_release_id: bundle.bundleChecksum || bundle.runId || "current",
            selected_layer_key: selectedNode ? "paper" : null,
            selected_node_id: selectedNode?.id ?? null,
            selected_graph_paper_ref: selectedNode?.paperId ?? selectedNode?.id ?? null,
            selected_paper_id: null,
            selection_graph_paper_refs: scopeRequest.selectionGraphPaperRefs,
            selected_cluster_id: null,
            scope_mode: scopeRequest.scopeMode,
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
        setRagGraphAvailability(null);
        setRagInteractionTrace(null);
        clearOwnedOverlay(activeOverlayProducerIdRef.current);
        clearAnswerSelection();
      });
    })();
  }, [
    askChat,
    bundle.bundleChecksum,
    bundle.runId,
    clearAnswerSelection,
    clearOwnedOverlay,
    getPromptText,
    isAsk,
    isSubmitting,
    resolveSelectionScopeRequest,
    selectedNode,
  ]);

  const runEvidenceAssistQuery = useCallback((request: EvidenceAssistRequest) => {
    void runQuery({
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
      setRagGraphAvailability(null);
      setRagSession(null);
      setRagInteractionTrace(null);
      clearOwnedOverlay();
      clearAnswerSelection();
    }
  }, [askChat, clearAnswerSelection, clearOwnedOverlay]);

  return {
    ragResponse,
    streamedAskAnswer,
    ragError,
    ragSession,
    ragGraphAvailability,
    ragInteractionTrace,
    isSubmitting,
    handleSubmit,
    runEvidenceAssistQuery,
    clearRag,
  };
}
