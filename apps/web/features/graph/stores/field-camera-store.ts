import { create } from "zustand";

/**
 * Persistence for the orb-mode field camera across renderer toggles and
 * route swaps inside the (dashboard) layout.
 *
 * The blob is the JSON form of yomotsu/camera-controls (drei's
 * `<CameraControls>`). `controls.toJSON()` serializes position + target +
 * zoom + spherical state; `controls.fromJSON(json)` restores. The store
 * holds the most recent serialized state.
 *
 * Lifetime contract:
 * - When `<OrbCameraControls>` mounts (3D mode active), it reads
 *   `serialized` and applies it via `fromJSON` if non-null.
 * - When it unmounts (renderer toggle to 2D, route to landing), it
 *   captures `toJSON` and writes it here.
 *
 * Scope: in-memory only. A full browser refresh resets the camera to
 * default scene framing — that matches the rest of the dashboard's
 * non-persistent UI state. localStorage persistence is not part of
 * this slice; if/when product wants it, it lives in this same store.
 *
 * Camera bindings (left = ROTATE, right = OFFSET pan, mouse wheel =
 * DOLLY, trackpad 2-finger = OFFSET pan, trackpad pinch = ZOOM, touch
 * one finger = ROTATE, touch two fingers = TOUCH_DOLLY_OFFSET pan +
 * pinch) are static and live in `OrbCameraControls.applyControlsConfig`.
 * They are not user-toggleable — desktop / touchpad / touch all share
 * one mental model.
 */
interface FieldCameraStore {
  serialized: string | null;
  setSerialized: (json: string | null) => void;
}

export const useFieldCameraStore = create<FieldCameraStore>((set) => ({
  serialized: null,
  setSerialized: (json) => set({ serialized: json }),
}));
