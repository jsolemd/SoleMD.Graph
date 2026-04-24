import { create } from "zustand";

import type { PaperAttributesMap } from "../bake/use-paper-attributes-baker";

/**
 * Orb → FieldScene bridge for progressive paper-attribute writes.
 *
 * The paper baker runs OUTSIDE the R3F tree (it's a DuckDB streaming hook
 * at the surface level), but the geometry it writes into is OWNED by
 * FieldScene's blob layer. Zustand crosses that tree boundary without
 * introducing context re-renders or imperative handles.
 *
 * Contract:
 *   - baker calls `addChunk(chunk)` whenever a new Arrow batch has been
 *     decoded into a PaperAttributesMap.
 *   - FieldScene subscribes (only when field-mode='orb') and, for every
 *     chunk appended since its last applied cursor, calls
 *     `applyPaperAttributeOverrides(blobGeometry, chunk.attributes, { maxima })`
 *     followed by exactly one R3F `invalidate()` per subscription fire.
 *   - `reset()` clears the store on orb unmount (route swap back to
 *     landing) so a later remount doesn't re-apply stale chunks.
 *
 * The store is the ONLY adapter between out-of-tree hook and in-tree
 * subscription. It holds no geometry references — maxima travel with
 * each chunk so the applier can normalize without re-reading the store.
 */

export interface PaperChunk {
  attributes: PaperAttributesMap;
  maxima: { refCount: number; entityCount: number };
}

export interface OrbGeometryMutationState {
  chunks: PaperChunk[];
  addChunk: (chunk: PaperChunk) => void;
  reset: () => void;
}

export const useOrbGeometryMutationStore = create<OrbGeometryMutationState>(
  (set) => ({
    chunks: [],
    addChunk: (chunk) =>
      set((state) => ({ chunks: [...state.chunks, chunk] })),
    reset: () => set({ chunks: [] }),
  }),
);
