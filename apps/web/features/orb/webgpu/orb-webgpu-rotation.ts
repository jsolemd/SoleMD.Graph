import {
  ROTATION_DRAG_GRACE_MS,
  ROTATION_RUNNING_RPS,
} from "../../field/shared/landing-feel-constants";
import { normalizeRadians } from "./orb-webgpu-layout";

export type OrbWebGpuRotationState =
  | "running"
  | "suspended-drag"
  | "paused-selection";

export interface OrbWebGpuRotationInput {
  dtSeconds: number;
  pauseMotion: boolean;
  rotationSpeedMultiplier: number;
  selectionActive: boolean;
  timestampMs: number;
}

export class OrbWebGpuRotationController {
  private reducedOrPaused = false;
  private dragReleaseAtMs: number | null = null;
  private selectionActive = false;
  private stateValue: OrbWebGpuRotationState = "running";
  private value = 0;

  get rotation(): number {
    return this.value;
  }

  get state(): OrbWebGpuRotationState {
    return this.stateValue;
  }

  applyTwist(deltaRadians: number, timestampMs: number): void {
    if (!Number.isFinite(deltaRadians)) return;
    this.value = normalizeRadians(this.value + deltaRadians);
    if (this.reducedOrPaused || this.selectionActive) return;
    this.stateValue = "suspended-drag";
    this.dragReleaseAtMs = timestampMs;
  }

  tick(input: OrbWebGpuRotationInput): number {
    this.reducedOrPaused = input.pauseMotion;
    this.selectionActive = input.selectionActive;

    if (input.pauseMotion || input.selectionActive) {
      this.stateValue = "paused-selection";
      this.dragReleaseAtMs = null;
      return this.value;
    }

    if (
      this.stateValue === "suspended-drag" &&
      this.dragReleaseAtMs != null &&
      input.timestampMs - this.dragReleaseAtMs >= ROTATION_DRAG_GRACE_MS
    ) {
      this.stateValue = "running";
      this.dragReleaseAtMs = null;
    }

    if (this.stateValue === "running") {
      this.value = normalizeRadians(
        this.value +
          input.dtSeconds *
            ROTATION_RUNNING_RPS *
            input.rotationSpeedMultiplier,
      );
    }

    return this.value;
  }
}
