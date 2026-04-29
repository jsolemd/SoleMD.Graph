import { create } from "zustand";

export type OrbPickRectMode = "front-slab" | "through-volume";
export const ORB_PICK_NO_HIT = -1;

/**
 * Published handle for the orb WebGPU picker.
 *
 * OrbWebGpuCanvas publishes async compute-picking functions after the
 * WebGPU runtime owns its canvas, device, storage buffers, and command
 * scheduling. Out-of-tree surfaces (OrbInteractionSurface → useOrbClick /
 * useOrbRectSelection) call it with pointer coordinates and receive
 * resident particle indices.
 *
 * Crossing the canvas/DOM boundary:
 *   - the WebGPU canvas owns the pick target and readback buffers;
 *   - the click layer sits outside the Canvas in plain DOM;
 *   - zustand is the bridge, with a single slot rather than an
 *     append-only log.
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

/**
 * Pick result includes the runtime's pick generation captured at GPU
 * dispatch time. Consumers compare it against the live runtime
 * generation when readback resolves; mismatch = stale, drop. The
 * generation field is a host-side integer with zero GPU involvement —
 * see orb-webgpu-runtime.ts pickGeneration / bumpPickGeneration().
 */
export interface OrbPickResult {
  index: number;
  generation: number;
}

export interface OrbPickRectResult {
  indices: number[];
  generation: number;
}

export interface OrbPickerHandle {
  pickAsync: (clientX: number, clientY: number) => Promise<OrbPickResult>;
  pickSync?: (clientX: number, clientY: number) => number;
  pickRectAsync: (
    rect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    },
    options?: { mode?: OrbPickRectMode },
  ) => Promise<OrbPickRectResult>;
  /**
   * Increment the pick generation token. Wave 2B consumers call this
   * when state that invalidates pending picks changes (selection
   * replaced, hover scope changed, focus pinned). Pure host-side
   * integer; no GPU work.
   */
  bumpPickGeneration: () => void;
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
