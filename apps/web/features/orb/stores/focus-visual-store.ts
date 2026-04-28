import { create } from "zustand";

export interface OrbFocusVisualState {
  focusIndex: number | null;
  hoverIndex: number | null;
  /**
   * Resident particle indices for the canonical explicit graph
   * selection. `useOrbSelectionResolver` derives this set from
   * `selected_point_indices` so native widgets, RAG, entity overlays,
   * and orb gestures all feed the same 3D visual path. Orb-local
   * gestures may seed the same store optimistically with the particle
   * indices they just committed; the resolver reconciles from DuckDB.
   */
  selectionIndices: number[];
  /**
   * Resident particle indices for the current filter/timeline scope.
   * This is not persisted as explicit selection intent; it only lets
   * filters use the same orb visual vocabulary as manual selection.
   */
  scopeIndices: number[];
  neighborIndices: number[];
  evidenceIndices: number[];
  revision: number;
  selectionRevision: number;
  scopeRevision: number;
  neighborRevision: number;
  evidenceRevision: number;
  setFocusIndex: (index: number | null) => void;
  setHoverIndex: (index: number | null) => void;
  setSelectionIndices: (indices: readonly number[]) => void;
  setScopeIndices: (indices: readonly number[]) => void;
  setNeighborIndices: (indices: readonly number[]) => void;
  setEvidenceIndices: (indices: readonly number[]) => void;
  reset: () => void;
}

export function selectOrbFocusVisualActive(
  state: OrbFocusVisualState,
): boolean {
  return (
    state.focusIndex != null ||
    state.selectionIndices.length > 0 ||
    state.scopeIndices.length > 0 ||
    state.neighborIndices.length > 0 ||
    state.evidenceIndices.length > 0
  );
}

function sameIndex(a: number | null, b: number | null): boolean {
  return a === b;
}

function normalizeIndices(indices: readonly number[]): number[] {
  return Array.from(
    new Set(
      indices
        .map((index) => Math.trunc(index))
        .filter((index) => Number.isInteger(index) && index >= 0),
    ),
  ).sort((a, b) => a - b);
}

function sameIndices(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const useOrbFocusVisualStore = create<OrbFocusVisualState>((set) => ({
  focusIndex: null,
  hoverIndex: null,
  selectionIndices: [],
  scopeIndices: [],
  neighborIndices: [],
  evidenceIndices: [],
  revision: 0,
  selectionRevision: 0,
  scopeRevision: 0,
  neighborRevision: 0,
  evidenceRevision: 0,
  setFocusIndex: (index) =>
    set((state) =>
      sameIndex(state.focusIndex, index)
        ? state
        : { focusIndex: index, revision: state.revision + 1 },
    ),
  setHoverIndex: (index) =>
    set((state) =>
      sameIndex(state.hoverIndex, index)
        ? state
        : { hoverIndex: index, revision: state.revision + 1 },
    ),
  setSelectionIndices: (indices) =>
    set((state) => {
      const next = normalizeIndices(indices);
      return sameIndices(state.selectionIndices, next)
        ? state
        : {
            selectionIndices: next,
            selectionRevision: state.selectionRevision + 1,
            revision: state.revision + 1,
          };
    }),
  setScopeIndices: (indices) =>
    set((state) => {
      const next = normalizeIndices(indices);
      return sameIndices(state.scopeIndices, next)
        ? state
        : {
            scopeIndices: next,
            scopeRevision: state.scopeRevision + 1,
            revision: state.revision + 1,
          };
    }),
  setNeighborIndices: (indices) =>
    set((state) => {
      const next = normalizeIndices(indices);
      return sameIndices(state.neighborIndices, next)
        ? state
        : {
            neighborIndices: next,
            neighborRevision: state.neighborRevision + 1,
            revision: state.revision + 1,
          };
    }),
  setEvidenceIndices: (indices) =>
    set((state) => {
      const next = normalizeIndices(indices);
      return sameIndices(state.evidenceIndices, next)
        ? state
        : {
            evidenceIndices: next,
            evidenceRevision: state.evidenceRevision + 1,
            revision: state.revision + 1,
          };
    }),
  reset: () =>
    set({
      focusIndex: null,
      hoverIndex: null,
      selectionIndices: [],
      scopeIndices: [],
      neighborIndices: [],
      evidenceIndices: [],
      revision: 0,
      selectionRevision: 0,
      scopeRevision: 0,
      neighborRevision: 0,
      evidenceRevision: 0,
    }),
}));
