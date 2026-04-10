"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGraphCamera } from "@/features/graph/cosmograph";
import { WIKI_ENTITY_OVERLAY_PRODUCER } from "@/features/graph/lib/overlay-producers";
import type { GraphBundleQueries } from "@/features/graph/types";
import {
  resolveWikiOverlay,
  commitWikiOverlay,
  cacheWikiNodeIndices,
  clearWikiGraphOverlay,
} from "@/features/wiki/lib/wiki-graph-sync";

const PRODUCER_ID = WIKI_ENTITY_OVERLAY_PRODUCER;

interface UseWikiGraphSyncOptions {
  queries: GraphBundleQueries;
  paperGraphRefs: Record<number, string>;
  currentSlug: string | null;
}

export function useWikiGraphSync({
  queries,
  paperGraphRefs,
  currentSlug,
}: UseWikiGraphSyncOptions) {
  const generationRef = useRef(0);
  const overlayMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nodeIndexCacheRef = useRef<Record<string, number>>({});
  const { fitViewByIndices } = useGraphCamera();

  const enqueueOverlayMutation = useCallback(
    (mutation: () => Promise<void>) => {
      const run = overlayMutationQueueRef.current.then(mutation, mutation);
      overlayMutationQueueRef.current = run.catch(() => {});
      return run;
    },
    [],
  );

  useEffect(() => {
    const graphPaperRefs = Object.values(paperGraphRefs);
    const generation = ++generationRef.current;
    nodeIndexCacheRef.current = {};
    const isCurrentGeneration = () => generation === generationRef.current;

    async function run() {
      if (graphPaperRefs.length === 0) {
        await enqueueOverlayMutation(async () => {
          if (!isCurrentGeneration()) return;
          await clearWikiGraphOverlay({ producerId: PRODUCER_ID, queries });
          if (!isCurrentGeneration()) return;
          nodeIndexCacheRef.current = {};
        });
        return;
      }

      // Phase 1: RESOLVE (pure reads — no shared mutations)
      const resolution = await resolveWikiOverlay({ queries, graphPaperRefs });
      if (!isCurrentGeneration()) return;

      await enqueueOverlayMutation(async () => {
        if (!isCurrentGeneration()) return;

        // Phase 2: COMMIT (overlay write — serialized + guarded)
        await commitWikiOverlay({
          producerId: PRODUCER_ID,
          queries,
          pointIds: resolution.pointIds,
        });
        if (!isCurrentGeneration()) return;

        // Phase 3: POST-COMMIT CACHE (node lookup — overlay is now materialized)
        const indexMap = await cacheWikiNodeIndices({ queries, graphPaperRefs });
        if (!isCurrentGeneration()) return;
        nodeIndexCacheRef.current = indexMap;
      });
    }

    run().catch(() => {
      if (isCurrentGeneration()) {
        void enqueueOverlayMutation(async () => {
          if (!isCurrentGeneration()) return;
          await clearWikiGraphOverlay({ producerId: PRODUCER_ID, queries });
          if (!isCurrentGeneration()) return;
          nodeIndexCacheRef.current = {};
        });
      }
    });

    return () => {
      if (isCurrentGeneration()) {
        void enqueueOverlayMutation(async () => {
          if (!isCurrentGeneration()) return;
          await clearWikiGraphOverlay({ producerId: PRODUCER_ID, queries });
          if (!isCurrentGeneration()) return;
          nodeIndexCacheRef.current = {};
        });
      }
    };
  }, [queries, paperGraphRefs, currentSlug, enqueueOverlayMutation]);

  // onPaperClick: fast path from cache, fallback via live query
  const onPaperClick = useCallback(
    (graphPaperRef: string) => {
      // Fast path: read from cache
      const cachedIndex = nodeIndexCacheRef.current[graphPaperRef];
      if (cachedIndex != null && Number.isFinite(cachedIndex)) {
        fitViewByIndices([cachedIndex], 400, 0.15);
        return;
      }

      // Fallback: live query
      queries
        .ensureGraphPaperRefsAvailable([graphPaperRef])
        .then(() => queries.getPaperNodesByGraphPaperRefs([graphPaperRef]))
        .then((nodes) => {
          const node = nodes[graphPaperRef];
          if (node && Number.isFinite(node.index)) {
            fitViewByIndices([node.index], 400, 0.15);
          }
        })
        .catch(() => {
          // Paper not found on graph — silently ignore
        });
    },
    [queries, fitViewByIndices],
  );

  return { onPaperClick };
}
