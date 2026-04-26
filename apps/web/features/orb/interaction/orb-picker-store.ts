import { create } from "zustand";

/**
 * Published handle for the orb GPU picker.
 *
 * FieldScene's blob-points subscriber publishes a pickSync function when
 * the blob `<points>` and its ShaderMaterial are mounted; out-of-tree
 * surfaces (OrbInteractionSurface → useOrbClick) call it with
 * (clientX, clientY) and receive a particle index or PICK_NO_HIT.
 *
 * Crossing the R3F tree boundary:
 *   - the subscriber lives inside the Canvas and owns the pick target,
 *     the picking material, and the camera layer mask;
 *   - the click layer sits outside the Canvas in plain DOM;
 *   - zustand is the bridge, same pattern as the geometry mutation
 *     store but with a single slot rather than an append-only log.
 *
 * ### Identity-guarded cleanup
 *
 * Under React 19 + StrictMode, an unmount → remount sequence can
 * interleave as `mount A → mount B → cleanup A`. A naive cleanup that
 * unconditionally `setHandle(null)` would clear handle B after B's
 * install had already published it. `clearHandleIfMatches(expected)`
 * only clears when the live handle IS the one being torn down, so
 * a stale cleanup is a no-op.
 */

export interface OrbPickerHandle {
  pickSync: (clientX: number, clientY: number) => number;
}

export interface OrbPickerStore {
  handle: OrbPickerHandle | null;
  setHandle: (h: OrbPickerHandle | null) => void;
  clearHandleIfMatches: (expected: OrbPickerHandle) => void;
}

export const useOrbPickerStore = create<OrbPickerStore>((set) => ({
  handle: null,
  setHandle: (h) => set({ handle: h }),
  clearHandleIfMatches: (expected) =>
    set((state) => (state.handle === expected ? { handle: null } : state)),
}));
