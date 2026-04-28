import { create } from "zustand";

export interface OrbSnapshotHandle {
  captureSnapshot: () => void;
}

export interface OrbSnapshotState {
  handle: OrbSnapshotHandle | null;
  setHandle: (handle: OrbSnapshotHandle) => void;
  clearHandleIfMatches: (handle: OrbSnapshotHandle) => void;
}

export const useOrbSnapshotStore = create<OrbSnapshotState>((set) => ({
  handle: null,
  setHandle: (handle) => set({ handle }),
  clearHandleIfMatches: (handle) =>
    set((state) => (state.handle === handle ? { handle: null } : state)),
}));
