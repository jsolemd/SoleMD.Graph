"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchGraphNodeDetail,
  supportsRemoteGraphNodeDetail,
} from "@/features/graph/lib/detail-service";
import type {
  ChunkNode,
  GraphBundle,
  GraphBundleQueries,
  GraphData,
  GraphNode,
  GraphNodeDetailResponsePayload,
  GraphSelectionDetail,
  PaperNode,
} from "@/features/graph/types";

export function useDetailData({
  bundle,
  queries,
  data,
  selectedNode,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
  data: GraphData;
  selectedNode: GraphNode | null;
}) {
  const [resolved, setResolved] = useState<{
    detail: GraphSelectionDetail | null;
    error: string | null;
    id: string | null;
  }>({ detail: null, error: null, id: null });
  const [hydrated, setHydrated] = useState<{
    detail: GraphNodeDetailResponsePayload | null;
    error: string | null;
    id: string | null;
  }>({ detail: null, error: null, id: null });
  const [relatedPaperNodeMap, setRelatedPaperNodeMap] = useState<Record<string, PaperNode>>({});
  const [relatedChunkNodeMap, setRelatedChunkNodeMap] = useState<Record<string, ChunkNode>>({});
  const supportsRemoteDetail = selectedNode ? supportsRemoteGraphNodeDetail(selectedNode) : false;

  useEffect(() => {
    if (!selectedNode) return;
    let cancelled = false;

    queries
      .getSelectionDetail(selectedNode)
      .then((detail) => {
        if (!cancelled) {
          setResolved({ detail, error: null, id: selectedNode.id });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResolved({
            detail: null,
            error: error instanceof Error ? error.message : "Failed to load detail",
            id: selectedNode.id,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [queries, selectedNode]);

  useEffect(() => {
    if (!selectedNode || !supportsRemoteDetail) return;
    let cancelled = false;

    fetchGraphNodeDetail({ bundle, node: selectedNode })
      .then((detail) => {
        if (!cancelled) {
          setHydrated({ detail, error: null, id: selectedNode.id });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHydrated({
            detail: null,
            error: error instanceof Error ? error.message : "Failed to hydrate graph detail",
            id: selectedNode.id,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bundle, selectedNode, supportsRemoteDetail]);

  const localPaperNodeMap = useMemo(
    () =>
      Object.fromEntries(
        data.paperNodes
          .filter((node): node is PaperNode & { paperId: string } => Boolean(node.paperId))
          .map((node) => [node.paperId, node])
      ),
    [data.paperNodes]
  );

  const localChunkNodeMap = useMemo(
    () =>
      Object.fromEntries(
        data.nodes
          .filter((node): node is ChunkNode => node.nodeKind === "chunk")
          .flatMap((node) =>
            node.stableChunkId ? [[node.id, node], [node.stableChunkId, node]] : [[node.id, node]]
          )
      ),
    [data.nodes]
  );

  useEffect(() => {
    const paperIds = new Set<string>();
    const chunkIds = new Set<string>();

    if (selectedNode?.paperId) {
      paperIds.add(selectedNode.paperId);
    }

    for (const citation of hydrated.detail?.paper?.incoming_citations ?? []) {
      if (citation.related_paper_id) {
        paperIds.add(citation.related_paper_id);
      }
    }

    for (const citation of hydrated.detail?.paper?.outgoing_citations ?? []) {
      if (citation.related_paper_id) {
        paperIds.add(citation.related_paper_id);
      }
    }

    for (const reference of hydrated.detail?.paper?.references ?? []) {
      const paperId = reference.resolved_paper_id ?? reference.resolved_paper?.paper_id ?? null;
      if (paperId) {
        paperIds.add(paperId);
      }
    }

    for (const chunk of hydrated.detail?.paper?.narrative_chunks ?? []) {
      if (chunk.chunk_id) {
        chunkIds.add(chunk.chunk_id);
      }
    }

    for (const chunk of hydrated.detail?.chunk?.neighboring_chunks ?? []) {
      if (chunk.chunk_id) {
        chunkIds.add(chunk.chunk_id);
      }
    }

    for (const exemplar of resolved.detail?.exemplars ?? []) {
      if (exemplar.ragChunkId) {
        chunkIds.add(exemplar.ragChunkId);
      }
    }

    const missingPaperIds = [...paperIds].filter((paperId) => !(paperId in localPaperNodeMap));
    const missingChunkIds = [...chunkIds].filter((chunkId) => !(chunkId in localChunkNodeMap));

    if (missingPaperIds.length === 0 && missingChunkIds.length === 0) {
      return;
    }

    let cancelled = false;

    Promise.all([
      missingPaperIds.length > 0 ? queries.getPaperNodesByPaperIds(missingPaperIds) : Promise.resolve({}),
      missingChunkIds.length > 0 ? queries.getChunkNodesByChunkIds(missingChunkIds) : Promise.resolve({}),
    ])
      .then(([paperNodes, chunkNodes]) => {
        if (cancelled) {
          return;
        }
        setRelatedPaperNodeMap(paperNodes);
        setRelatedChunkNodeMap(chunkNodes);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setRelatedPaperNodeMap({});
        setRelatedChunkNodeMap({});
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated.detail, localChunkNodeMap, localPaperNodeMap, queries, resolved.detail?.exemplars, selectedNode?.paperId]);

  const paperNodes = useMemo(
    () => Object.values({ ...localPaperNodeMap, ...relatedPaperNodeMap }),
    [localPaperNodeMap, relatedPaperNodeMap]
  );

  const chunkNodes = useMemo(
    () =>
      Object.values({ ...localChunkNodeMap, ...relatedChunkNodeMap }).filter(
        (node, index, allNodes) => allNodes.findIndex((candidate) => candidate.id === node.id) === index
      ),
    [localChunkNodeMap, relatedChunkNodeMap]
  );

  const isResolved = selectedNode ? resolved.id === selectedNode.id : false;
  const detail = isResolved ? resolved.detail : null;
  const error = isResolved ? resolved.error : null;
  const loading = !isResolved;
  const isHydrated = !supportsRemoteDetail || (selectedNode ? hydrated.id === selectedNode.id : false);
  const serviceDetail = supportsRemoteDetail && selectedNode && hydrated.id === selectedNode.id ? hydrated.detail : null;
  const serviceError = supportsRemoteDetail && selectedNode && hydrated.id === selectedNode.id ? hydrated.error : null;
  const serviceLoading = supportsRemoteDetail ? !isHydrated : false;

  return {
    detail,
    error,
    loading,
    serviceDetail,
    serviceError,
    serviceLoading,
    supportsRemoteDetail,
    paperNodes,
    chunkNodes,
  };
}
