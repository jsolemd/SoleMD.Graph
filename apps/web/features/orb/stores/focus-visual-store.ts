import { create } from "zustand";

export interface OrbFocusVisualState {
  focusIndex: number | null;
  hoverIndex: number | null;
  revision: number;
  setFocusIndex: (index: number | null) => void;
  setHoverIndex: (index: number | null) => void;
  reset: () => void;
}

function sameIndex(a: number | null, b: number | null): boolean {
  return a === b;
}

export const useOrbFocusVisualStore = create<OrbFocusVisualState>((set) => ({
  focusIndex: null,
  hoverIndex: null,
  revision: 0,
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
  reset: () => set({ focusIndex: null, hoverIndex: null, revision: 0 }),
}));
