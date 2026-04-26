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
 *     `applyPaperAttributeOverrides(blobGeometry, chunk.attributes, { stats })`
 *     followed by exactly one R3F `invalidate()` per subscription fire.
 *   - `reset()` clears the store on orb unmount (route swap back to
 *     landing) so a later remount doesn't re-apply stale chunks.
 *
 * The store is the ONLY adapter between out-of-tree hook and in-tree
 * subscription. It holds no geometry references — corpus-wide
 * percentile stats travel on every chunk so the applier normalizes
 * each chunk against the same anchors. Stats are computed once
 * pre-stream (`use-paper-attributes-baker.ts`) and reused; per-chunk
 * maxima are NOT used because they would make particle mass a
 * function of arbitrary batch membership rather than an intrinsic
 * paper property — see docs/future/orb-mass-normalization-port.md.
 */

/**
 * Log-space percentile anchors over the corpus, used to map citation
 * and entity counts into bounded visual factors. Same values on every
 * chunk so already-painted particles never need re-normalization.
 */
export interface PaperCorpusStats {
  /** quantile_cont(LN(1 + paperReferenceCount), 0.05) */
  refLo: number;
  /** quantile_cont(LN(1 + paperReferenceCount), 0.98) */
  refHi: number;
  /** quantile_cont(LN(1 + paperEntityCount), 0.05) */
  entityLo: number;
  /** quantile_cont(LN(1 + paperEntityCount), 0.98) */
  entityHi: number;
}

export interface PaperChunk {
  attributes: PaperAttributesMap;
  stats: PaperCorpusStats;
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
