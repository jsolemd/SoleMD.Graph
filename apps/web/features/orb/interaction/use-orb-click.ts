"use client";

import { useCallback } from "react";
import type { GraphBundleQueries, GraphLayer } from "@solemd/graph";

import { useResolveAndSelectNode } from "@/features/graph/hooks/use-resolve-and-select-node";

/**
 * Orb paper-selection handler.
 *
 * Consumes `useResolveAndSelectNode` (the cross-renderer selection
 * funnel) and returns a `selectByIndex(index)` callback for the orb
 * picking path. When the field picker resolves a click to a particle
 * index, this hook dispatches `{ layer, index }` into the graph store
 * via the shared resolver — the same code path Cosmograph uses.
 *
 * ### GPU picking status (5e)
 *
 * The field-side GPU picking (`createFieldPicker` + picking material)
 * lives in `features/field/renderer/field-picking.ts` and is designed
 * to run inside R3F with access to the renderer/scene/camera/points.
 * Wiring that R3F-internal path into OrbSurface (which sits outside
 * the canvas tree) is scoped as a 5e follow-up — it needs a new
 * FieldScene subscriber prop symmetric to `blobGeometrySubscriber`
 * plus a picking ShaderMaterial matching the field vertex shader.
 *
 * In the meantime the click path is wired end-to-end: any caller that
 * can resolve a click to an index (e.g. a later pick layer, or a
 * SelectionDebug HUD) can call `selectByIndex(i)` and the detail panel
 * lights up.
 */
export function useOrbClick(
  queries: GraphBundleQueries | null,
  activeLayer: GraphLayer,
) {
  const resolveAndSelect = useResolveAndSelectNode(
    queries ??
      // Cast-safe null fallback: the returned callback is a no-op when
      // queries is null because the caller guards on it first.
      (EMPTY_QUERIES as unknown as GraphBundleQueries),
    activeLayer,
  );

  return useCallback(
    (index: number | null) => {
      if (queries == null || index == null || index < 0) return;
      void resolveAndSelect({ index });
    },
    [queries, resolveAndSelect],
  );
}

// Stub used only as a type-safe fallback when `queries` is null. Every
// field is absent — the returned callback never runs against it.
const EMPTY_QUERIES = {};
