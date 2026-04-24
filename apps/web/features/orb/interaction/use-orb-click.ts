"use client";

import { useCallback } from "react";
import type { GraphBundleQueries, GraphLayer } from "@solemd/graph";

import { useResolveAndSelectNode } from "@/features/graph/hooks/use-resolve-and-select-node";

/**
 * Orb paper-selection handler.
 *
 * Consumes `useResolveAndSelectNode` (the cross-renderer selection
 * funnel) and returns a `selectByIndex(index | null)` callback for the
 * orb picking path. When the field picker resolves a click to a
 * particle index, this hook dispatches `{ layer, index }` into the
 * graph store via the shared resolver — the same code path Cosmograph
 * uses.
 *
 * When `queries` is null (bundle not yet warm) the hook always returns
 * a no-op — we can't resolve a click without DuckDB. `useResolveAndSelectNode`
 * is still wired so the callback dependency keys stay stable once
 * queries arrives.
 */
export function useOrbClick(
  queries: GraphBundleQueries | null,
  activeLayer: GraphLayer,
) {
  // Only invoke the real resolver when queries is present. Casting
  // is safe because the outer callback guards on `queries == null` and
  // the underlying hook returns a callback that closes over queries —
  // it doesn't dereference it at build time.
  const resolveAndSelect = useResolveAndSelectNode(
    (queries ?? null) as unknown as GraphBundleQueries,
    activeLayer,
  );

  return useCallback(
    (index: number | null) => {
      if (queries == null) return;
      if (index == null || index < 0) return;
      void resolveAndSelect({ index });
    },
    [queries, resolveAndSelect],
  );
}
