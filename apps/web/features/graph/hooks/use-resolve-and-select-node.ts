"use client";

import { useCallback, useRef } from "react";
import type { GraphBundleQueries, GraphLayer } from "@solemd/graph";

import { useGraphStore } from "@/features/graph/stores";

/**
 * Shared selection entry point extracted from cosmograph/GraphRenderer.tsx:197-209.
 *
 * Resolves a selector ({ id? | index? }) against the DuckDB query layer for
 * the active graph layer, then dispatches into the global `selectNode`
 * action. An internal request-id guards against stale races: concurrent
 * calls (e.g. a hover landing mid-resolution followed by a click) only
 * commit the most-recent request's result.
 *
 * Consumed by the Cosmograph path AND the field-orb picking path so the
 * two renderers funnel through one selection contract.
 */
export function useResolveAndSelectNode(
  queries: GraphBundleQueries,
  activeLayer: GraphLayer,
): (selector: { id?: string; index?: number }) => Promise<void> {
  const selectionRequestId = useRef(0);
  const selectNode = useGraphStore((s) => s.selectNode);

  return useCallback(
    async (selector: { id?: string; index?: number }) => {
      const requestId = ++selectionRequestId.current;
      const node = await queries.resolvePointSelection(activeLayer, selector);

      if (requestId !== selectionRequestId.current) {
        return;
      }

      selectNode(node);
    },
    [activeLayer, queries, selectNode],
  );
}
