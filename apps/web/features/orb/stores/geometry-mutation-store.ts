import { create } from "zustand";

import type { PaperAttributesMap } from "../bake/use-paper-attributes-baker";

/**
 * Orb paper-stream bridge for progressive WebGPU particle-buffer writes.
 *
 * The paper baker runs outside the WebGPU runtime (it's a DuckDB
 * streaming hook at the surface level), while OrbWebGpuCanvas owns the
 * GPU buffers. Zustand crosses that boundary without putting active rows
 * into React state.
 *
 * Contract:
 *   - baker calls `addChunk(chunk)` whenever a new Arrow batch has been
 *     decoded into a PaperAttributesMap.
 *   - OrbWebGpuCanvas packs the accumulated chunks into storage-buffer
 *     arrays for positions, velocities, attributes, and flags.
 *   - `reset()` clears the store on orb unmount (route swap back to
 *     landing) so a later remount doesn't re-apply stale chunks.
 *
 * The store is the only adapter between DuckDB streaming and WebGPU
 * upload. It holds no GPU references. Corpus-wide percentile stats travel
 * on every chunk so the WebGPU packer normalizes each chunk against the
 * same anchors.
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
