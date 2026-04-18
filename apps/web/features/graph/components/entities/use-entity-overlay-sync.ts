"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGraphSelection } from "@/features/graph/cosmograph";
import {
  computeEntityOverlayRefsKey,
  deduplicateEntityOverlayRefs,
} from "@/features/graph/lib/entity-overlay-refs";
import {
  ENTITY_GRAPH_OVERLAY_PRODUCER,
  ENTITY_OVERLAY_SELECTION_SOURCE_ID,
} from "@/features/graph/lib/overlay-producers";
import {
  clearOwnedSelectionState,
  commitSelectionState,
} from "@/features/graph/lib/graph-selection-state";
import { resolveGraphReleaseId } from "@solemd/graph";
import type { GraphBundle, GraphBundleQueries } from "@solemd/graph";
import type { GraphEntityOverlayRef } from "@solemd/api-client/shared/graph-entity";
import { clearEntityOverlay, syncEntityOverlay } from "./entity-overlay-sync";

interface UseEntityOverlaySyncArgs {
  bundle: GraphBundle;
  queries: GraphBundleQueries | null;
  setSelectedPointCount: (count: number) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
  activeSelectionSourceId: string | null;
}

interface UseEntityOverlaySyncState {
  syncEntityOverlayRefs: (refs: readonly GraphEntityOverlayRef[]) => void;
  clearEntityOverlaySelection: () => void;
}

export function useEntityOverlaySync({
  bundle,
  queries,
  setSelectedPointCount,
  setActiveSelectionSourceId,
  activeSelectionSourceId,
}: UseEntityOverlaySyncArgs): UseEntityOverlaySyncState {
  const abortRef = useRef<AbortController | null>(null);
  const activeIdentityKeyRef = useRef("");
  const activeSelectionSourceIdRef = useRef(activeSelectionSourceId);
  activeSelectionSourceIdRef.current = activeSelectionSourceId;

  const { selectPointsByIndices, clearSelectionBySource } = useGraphSelection();
  const graphReleaseId = resolveGraphReleaseId(bundle);

  const clearEntityOverlaySelection = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeIdentityKeyRef.current = "";

    if (!queries) {
      return;
    }

    void clearEntityOverlay({
      producerId: ENTITY_GRAPH_OVERLAY_PRODUCER,
      queries,
    });
    clearSelectionBySource(ENTITY_OVERLAY_SELECTION_SOURCE_ID);
    void clearOwnedSelectionState({
      sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
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

  const syncEntityOverlayRefs = useCallback(
    (refs: readonly GraphEntityOverlayRef[]) => {
      const nextRefs = deduplicateEntityOverlayRefs(refs);

      if (!queries || nextRefs.length === 0) {
        clearEntityOverlaySelection();
        return;
      }

      const identityKey = `${graphReleaseId}\0${computeEntityOverlayRefsKey(nextRefs)}`;
      if (
        identityKey === activeIdentityKeyRef.current &&
        activeSelectionSourceIdRef.current === ENTITY_OVERLAY_SELECTION_SOURCE_ID
      ) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      activeIdentityKeyRef.current = identityKey;

      void syncEntityOverlay({
        producerId: ENTITY_GRAPH_OVERLAY_PRODUCER,
        queries,
        entityRefs: [...nextRefs],
        graphReleaseId,
        signal: controller.signal,
      })
        .then(async (result) => {
          if (controller.signal.aborted) {
            return;
          }

          if (result.selectedPointIndices.length === 0) {
            clearSelectionBySource(ENTITY_OVERLAY_SELECTION_SOURCE_ID);
            await clearOwnedSelectionState({
              sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
              activeSelectionSourceId: activeSelectionSourceIdRef.current,
              queries,
              setSelectedPointCount,
              setActiveSelectionSourceId,
            });
            activeIdentityKeyRef.current = "";
            return;
          }

          await commitSelectionState({
            sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
            queries,
            pointIndices: result.selectedPointIndices,
            setSelectedPointCount,
            setActiveSelectionSourceId,
          });

          if (controller.signal.aborted) {
            return;
          }

          selectPointsByIndices({
            sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
            pointIndices: result.selectedPointIndices,
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            activeIdentityKeyRef.current = "";
          }
        });
    },
    [
      clearEntityOverlaySelection,
      clearSelectionBySource,
      graphReleaseId,
      queries,
      selectPointsByIndices,
      setActiveSelectionSourceId,
      setSelectedPointCount,
    ],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return {
    syncEntityOverlayRefs,
    clearEntityOverlaySelection,
  };
}
