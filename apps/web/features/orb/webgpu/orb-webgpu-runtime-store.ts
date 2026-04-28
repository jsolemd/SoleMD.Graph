import { create } from "zustand";

export interface OrbWebGpuControlHandle {
  applyTwist: (deltaRadians: number) => void;
  applyZoom: (factor: number) => void;
  applyPan: (deltaX: number, deltaY: number) => void;
  resetView: () => void;
}

interface OrbWebGpuRuntimeStore {
  handle: OrbWebGpuControlHandle | null;
  setHandle: (handle: OrbWebGpuControlHandle) => void;
  clearHandleIfMatches: (handle: OrbWebGpuControlHandle) => void;
}

export const useOrbWebGpuRuntimeStore = create<OrbWebGpuRuntimeStore>(
  (set) => ({
    handle: null,
    setHandle: (handle) => set({ handle }),
    clearHandleIfMatches: (handle) =>
      set((state) => (state.handle === handle ? { handle: null } : state)),
  }),
);
