// Camera zoom for the WebGPU orb. Mirrors the rotation controller
// shape: a target value the runtime nudges via applyZoom / setZoom,
// eased toward the current value each frame. The shader multiplies
// post-rotation XY *and* the visual radius by the current value, so a
// zoom of 2 reads as a true camera dolly (twice the screen size).
//
// Reduced motion gate (per feedback_user_vs_system_motion_inputs): only
// the per-frame ease respects prefers-reduced-motion. setZoom and
// applyZoom always commit instantly; the smoothing happens between
// commits. This keeps inspection responsive while making continuous
// keyboard / wheel input feel calm.
import { clampFinite, easeTowardTarget } from "./orb-webgpu-layout";
import {
  ORB_ZOOM_DEFAULT,
  ORB_ZOOM_MAX,
  ORB_ZOOM_MIN,
} from "./orb-webgpu-visual-config";

export { ORB_ZOOM_DEFAULT, ORB_ZOOM_MAX, ORB_ZOOM_MIN };

// 0.385 default pairs with BLOB_RADIUS = 2.0, preserving the prior
// apparent footprint (1.40 * 0.55 ~= 2.0 * 0.385) while giving particles
// more world-space room. The lower zoom floor keeps the same inspection
// range available after the wider sphere retune.
// 120 ms half-life — snappy enough that wheel and +/- inputs feel
// connected to the screen, slow enough that keyboard-repeat doesn't
// flash discrete steps. Pan uses 250 ms because translation reads as
// motion at any speed; zoom needs the faster lock-in to feel like a
// real camera dolly.
const ZOOM_HALF_LIFE_SECONDS = 0.12;

export interface OrbWebGpuZoomTickInput {
  dtSeconds: number;
  prefersReducedMotion: boolean;
}

export class OrbWebGpuZoomController {
  private targetValue = ORB_ZOOM_DEFAULT;
  private value = ORB_ZOOM_DEFAULT;

  get zoom(): number {
    return this.value;
  }

  get target(): number {
    return this.targetValue;
  }

  setZoom(next: number): void {
    this.targetValue = clampFinite(next, ORB_ZOOM_MIN, ORB_ZOOM_MAX);
  }

  applyZoom(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.setZoom(this.targetValue * factor);
  }

  reset(): void {
    this.targetValue = ORB_ZOOM_DEFAULT;
  }

  tick(input: OrbWebGpuZoomTickInput): number {
    if (input.prefersReducedMotion) {
      this.value = this.targetValue;
      return this.value;
    }
    this.value = easeTowardTarget(
      this.value,
      this.targetValue,
      input.dtSeconds,
      ZOOM_HALF_LIFE_SECONDS,
    );
    return this.value;
  }
}
