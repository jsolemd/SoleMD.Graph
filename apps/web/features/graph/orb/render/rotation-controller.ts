"use client";

/**
 * Group-matrix auto-rotation state machine for the orb-dev surface.
 *
 * States (mirrors the R4 plan in docs/future/graph-orb-3d-renderer.md):
 *   - running          : slow world-Y rotation, ambient
 *   - suspended-drag   : user is orbiting; stays suspended for drag + 1500ms
 *                        grace window, then resumes.
 *   - paused-selection : a point is focused; paused until dismissed.
 *
 * `prefers-reduced-motion` pins the state to `paused-selection` so no
 * ambient motion runs. Motion accessibility trumps "the orb should feel
 * alive" — users can double-click or explicitly resume.
 *
 * The controller mutates a target THREE.Object3D's rotation.y — typically
 * the Group wrapping the points and cluster labels — and exposes plain
 * imperative methods for the gesture arbiter / click handler to call.
 */

import * as THREE from "three";

export type RotationState = "running" | "suspended-drag" | "paused-selection";

const RUNNING_RPS = 0.04; // radians/second — a quarter revolution in ~39s
const DRAG_GRACE_MS = 1500;

export interface RotationController {
  readonly state: () => RotationState;
  tick: (dtSeconds: number) => void;
  beginDrag: () => void;
  endDrag: () => void;
  pauseForSelection: () => void;
  resume: () => void;
  setReducedMotion: (enabled: boolean) => void;
  dispose: () => void;
}

export function createRotationController(
  target: THREE.Object3D,
  options: { initialReducedMotion?: boolean } = {},
): RotationController {
  let state: RotationState = options.initialReducedMotion
    ? "paused-selection"
    : "running";
  let reducedMotion = options.initialReducedMotion ?? false;
  let dragReleaseAt: number | null = null;
  let disposed = false;

  const tick = (dtSeconds: number) => {
    if (disposed) return;
    if (reducedMotion) {
      return;
    }

    // Promote suspended-drag back to running after the grace window expires.
    if (state === "suspended-drag" && dragReleaseAt != null) {
      const now = performance.now();
      if (now - dragReleaseAt >= DRAG_GRACE_MS) {
        state = "running";
        dragReleaseAt = null;
      }
    }

    if (state === "running") {
      target.rotation.y += RUNNING_RPS * dtSeconds;
    }
  };

  const beginDrag = () => {
    if (disposed || reducedMotion) return;
    state = "suspended-drag";
    dragReleaseAt = null;
  };

  const endDrag = () => {
    if (disposed) return;
    if (state === "suspended-drag") {
      dragReleaseAt = performance.now();
    }
  };

  const pauseForSelection = () => {
    if (disposed) return;
    state = "paused-selection";
    dragReleaseAt = null;
  };

  const resume = () => {
    if (disposed) return;
    if (reducedMotion) {
      // Honor the a11y preference — explicit resume still bows to it.
      state = "paused-selection";
      return;
    }
    state = "running";
    dragReleaseAt = null;
  };

  const setReducedMotion = (enabled: boolean) => {
    if (disposed) return;
    reducedMotion = enabled;
    if (enabled) {
      state = "paused-selection";
      dragReleaseAt = null;
    }
  };

  const dispose = () => {
    disposed = true;
  };

  return {
    state: () => state,
    tick,
    beginDrag,
    endDrag,
    pauseForSelection,
    resume,
    setReducedMotion,
    dispose,
  };
}
