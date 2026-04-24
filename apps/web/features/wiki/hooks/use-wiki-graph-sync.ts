"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useGraphCamera,
  useGraphFocus,
  useGraphSelection,
} from "@/features/graph/cosmograph";
import { useDashboardStore } from "@/features/graph/stores";
import {
  clearOwnedSelectionState,
  commitSelectionState,
} from "@/features/graph/lib/graph-selection-state";
import {
  WIKI_PAGE_OVERLAY_PRODUCER,
  WIKI_PAGE_SELECTION_SOURCE_ID,
} from "@/features/graph/lib/overlay-producers";
import type { GraphBundleQueries, GraphPointRecord } from "@solemd/graph";
import {
  cacheWikiGraphNodes,
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
  const nodeCacheRef = useRef<Record<string, GraphPointRecord>>({});
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
  const { focusNode } = useGraphFocus();

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

  const activatePaperNode = useCallback(
    async (node: GraphPointRecord) => {
      await commitSelectionState({
        sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
        queries,
        pointIndices: [node.index],
        setSelectedPointCount,
        setActiveSelectionSourceId,
      });

      selectPointsByIndices({
        sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
        pointIndices: [node.index],
      });

      const changedFocus = focusNode(node, {
        zoomDuration: paperFocusDuration,
        selectPoint: false,
      });

      if (!changedFocus) {
        focusSinglePoint(node.index);
      }
    },
    [
      focusNode,
      focusSinglePoint,
      paperFocusDuration,
      queries,
      selectPointsByIndices,
      setActiveSelectionSourceId,
      setSelectedPointCount,
    ],
  );

  const clearPageGraph = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    nodeCacheRef.current = {};

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

    // Rollbacks stack up as side effects commit. If any await returns to an
    // aborted signal (another page took over mid-flight), we pop them in
    // reverse order to restore the prior state instead of leaking a half-
    // applied overlay or selection.
    const rollbacks: Array<() => void | Promise<void>> = [];
    const runRollbacks = async () => {
      while (rollbacks.length > 0) {
        const undo = rollbacks.pop();
        if (!undo) continue;
        try {
          await undo();
        } catch {
          // Best-effort rollback; swallow so later steps still run.
        }
      }
    };

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
      rollbacks.push(() =>
        clearWikiGraphOverlay({
          producerId: WIKI_PAGE_OVERLAY_PRODUCER,
          queries,
        }),
      );
      if (controller.signal.aborted) {
        await runRollbacks();
        return;
      }

      const nodesByRef = await cacheWikiGraphNodes({
        queries,
        graphPaperRefs: [...pageGraphRefs],
      });
      if (controller.signal.aborted) {
        await runRollbacks();
        return;
      }

      const previousNodeCache = nodeCacheRef.current;
      nodeCacheRef.current = nodesByRef;
      rollbacks.push(() => {
        nodeCacheRef.current = previousNodeCache;
      });

      const pointIndices = Object.values(nodesByRef)
        .map((node) => node.index)
        .filter((index): index is number => Number.isFinite(index));

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
      rollbacks.push(() =>
        clearOwnedSelectionState({
          sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
          activeSelectionSourceId: activeSelectionSourceIdRef.current,
          queries,
          setSelectedPointCount,
          setActiveSelectionSourceId,
        }),
      );
      if (controller.signal.aborted) {
        await runRollbacks();
        return;
      }

      selectPointsByIndices({
        sourceId: WIKI_PAGE_SELECTION_SOURCE_ID,
        pointIndices,
      });
      rollbacks.push(() => {
        clearSelectionBySource(WIKI_PAGE_SELECTION_SOURCE_ID);
      });
      if (controller.signal.aborted) {
        await runRollbacks();
        return;
      }

      focusPointIndices(pointIndices);
      // Completed cleanly — discard rollbacks.
      rollbacks.length = 0;
    } catch {
      if (!controller.signal.aborted) {
        clearPageGraph();
      } else {
        await runRollbacks();
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
      const cachedNode = nodeCacheRef.current[graphPaperRef];
      if (cachedNode && Number.isFinite(cachedNode.index)) {
        void activatePaperNode(cachedNode);
        return;
      }

      void queries
        .ensureGraphPaperRefsAvailable([graphPaperRef])
        .then(() =>
          cacheWikiGraphNodes({
            queries,
            graphPaperRefs: [graphPaperRef],
          }),
        )
        .then((nodes) => {
          const node = nodes[graphPaperRef];
          if (node && Number.isFinite(node.index)) {
            nodeCacheRef.current[graphPaperRef] = node;
            return activatePaperNode(node);
          }
        })
        .catch(() => {
          // Paper not available on the graph for the current bundle.
        });
    },
    [activatePaperNode, queries],
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
