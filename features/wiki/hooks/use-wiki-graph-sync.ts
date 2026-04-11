"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGraphCamera, useGraphSelection } from "@/features/graph/cosmograph";
import { useDashboardStore } from "@/features/graph/stores";
import {
  clearOwnedSelectionState,
  commitSelectionState,
} from "@/features/graph/lib/graph-selection-state";
import {
  WIKI_PAGE_OVERLAY_PRODUCER,
  WIKI_PAGE_SELECTION_SOURCE_ID,
} from "@/features/graph/lib/overlay-producers";
import type { GraphBundleQueries } from "@/features/graph/types";
import {
  cacheWikiNodeIndices,
  clearWikiGraphOverlay,
  commitWikiOverlay,
  resolveWikiOverlay,
} from "@/features/wiki/lib/wiki-graph-sync";

interface UseWikiGraphSyncOptions {
  queries: GraphBundleQueries;
  pageGraphRefs: readonly string[];
  currentSlug: string | null;
}

interface UseWikiGraphSyncResult {
  onPaperClick: (graphPaperRef: string) => void;
  showPageOnGraph: () => Promise<void>;
  clearPageGraph: () => void;
  canShowPageOnGraph: boolean;
}

export function useWikiGraphSync({
  queries,
  pageGraphRefs,
  currentSlug,
}: UseWikiGraphSyncOptions): UseWikiGraphSyncResult {
  const pageFitDuration = 400;
  const pageFitPadding = 0.15;
  const paperFocusDuration = 250;
  const abortRef = useRef<AbortController | null>(null);
  const nodeIndexCacheRef = useRef<Record<string, number>>({});
  const setSelectedPointCount = useDashboardStore(
    (state) => state.setSelectedPointCount,
  );
  const setActiveSelectionSourceId = useDashboardStore(
    (state) => state.setActiveSelectionSourceId,
  );
  const activeSelectionSourceId = useDashboardStore(
    (state) => state.activeSelectionSourceId,
  );
  const activeSelectionSourceIdRef = useRef(activeSelectionSourceId);
  activeSelectionSourceIdRef.current = activeSelectionSourceId;

  const { fitViewByIndices, zoomToPoint } = useGraphCamera();
  const { selectPointsByIndices, clearSelectionBySource } = useGraphSelection();

  const focusPointIndices = useCallback(
    (pointIndices: readonly number[]) => {
      if (pointIndices.length === 0) {
        return;
      }

      if (pointIndices.length === 1) {
        zoomToPoint(pointIndices[0], paperFocusDuration);
        return;
      }

      fitViewByIndices([...pointIndices], pageFitDuration, pageFitPadding);
    },
    [
      fitViewByIndices,
      pageFitDuration,
      pageFitPadding,
      paperFocusDuration,
      zoomToPoint,
    ],
  );

  const focusSinglePoint = useCallback(
    (pointIndex: number) => {
      zoomToPoint(pointIndex, paperFocusDuration);
    },
    [paperFocusDuration, zoomToPoint],
  );

  const clearPageGraph = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    nodeIndexCacheRef.current = {};

    void clearWikiGraphOverlay({
      producerId: WIKI_PAGE_OVERLAY_PRODUCER,
      queries,
    });
    clearSelectionBySource(WIKI_PAGE_SELECTION_SOURCE_ID);
    void clearOwnedSelectionState({
      sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
      activeSelectionSourceId: activeSelectionSourceIdRef.current,
      queries,
      setSelectedPointCount,
      setActiveSelectionSourceId,
    });
  }, [
    clearSelectionBySource,
    queries,
    setActiveSelectionSourceId,
    setSelectedPointCount,
  ]);

  const showPageOnGraph = useCallback(async () => {
    if (pageGraphRefs.length === 0) {
      clearPageGraph();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resolution = await resolveWikiOverlay({
        queries,
        graphPaperRefs: [...pageGraphRefs],
      });
      if (controller.signal.aborted) {
        return;
      }

      await commitWikiOverlay({
        producerId: WIKI_PAGE_OVERLAY_PRODUCER,
        queries,
        pointIds: resolution.pointIds,
      });
      if (controller.signal.aborted) {
        return;
      }

      const indexMap = await cacheWikiNodeIndices({
        queries,
        graphPaperRefs: [...pageGraphRefs],
      });
      if (controller.signal.aborted) {
        return;
      }

      nodeIndexCacheRef.current = indexMap;
      const pointIndices = Object.values(indexMap).filter(
        (index): index is number => Number.isFinite(index),
      );

      if (pointIndices.length === 0) {
        clearSelectionBySource(WIKI_PAGE_SELECTION_SOURCE_ID);
        await clearOwnedSelectionState({
          sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
          activeSelectionSourceId: activeSelectionSourceIdRef.current,
          queries,
          setSelectedPointCount,
          setActiveSelectionSourceId,
        });
        return;
      }

      await commitSelectionState({
        sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
        queries,
        pointIndices,
        setSelectedPointCount,
        setActiveSelectionSourceId,
      });
      if (controller.signal.aborted) {
        return;
      }

      selectPointsByIndices({
        sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
        pointIndices,
      });
      focusPointIndices(pointIndices);
    } catch {
      if (!controller.signal.aborted) {
        clearPageGraph();
      }
    }
  }, [
    clearPageGraph,
    clearSelectionBySource,
    focusPointIndices,
    pageGraphRefs,
    queries,
    selectPointsByIndices,
    setActiveSelectionSourceId,
    setSelectedPointCount,
  ]);

  const onPaperClick = useCallback(
    (graphPaperRef: string) => {
      const cachedIndex = nodeIndexCacheRef.current[graphPaperRef];
      if (cachedIndex != null && Number.isFinite(cachedIndex)) {
        focusSinglePoint(cachedIndex);
        return;
      }

      queries
        .ensureGraphPaperRefsAvailable([graphPaperRef])
        .then(() => queries.getPaperNodesByGraphPaperRefs([graphPaperRef]))
        .then((nodes) => {
          const node = nodes[graphPaperRef];
          if (node && Number.isFinite(node.index)) {
            focusSinglePoint(node.index);
          }
        })
        .catch(() => {
          // Paper not available on the graph for the current bundle.
        });
    },
    [focusSinglePoint, queries],
  );

  useEffect(() => {
    return () => {
      clearPageGraph();
    };
  }, [clearPageGraph, currentSlug]);

  return {
    onPaperClick,
    showPageOnGraph,
    clearPageGraph,
    canShowPageOnGraph: pageGraphRefs.length > 0,
  };
}
