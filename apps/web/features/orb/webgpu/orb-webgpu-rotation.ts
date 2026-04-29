import {
  ROTATION_DRAG_GRACE_MS,
  ROTATION_RUNNING_RPS,
} from "../../field/shared/landing-feel-constants";
import { halfLifeDecay, normalizeRadians } from "./orb-webgpu-layout";

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

// Half-life of the keyboard rotation ease. Tuned so a 30 Hz key-repeat
// at +/- 5 degrees per keypress reads as a continuous glide instead of
// 30 staccato jumps per second. Direct-manipulation paths (mouse drag,
// touch twist) bypass this ease via applyTwist.
const NUDGE_HALF_LIFE_SECONDS = 0.12;

export class OrbWebGpuRotationController {
  private reducedOrPaused = false;
  private dragReleaseAtMs: number | null = null;
  private selectionActive = false;
  private stateValue: OrbWebGpuRotationState = "running";
  private value = 0;
  private pitchValue = 0;
  private nudgeAccumulator = 0;
  private pitchNudgeAccumulator = 0;

  get rotation(): number {
    return this.value;
  }

  get pitch(): number {
    return this.pitchValue;
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

  // Eased twist for keyboard inputs. Adds to a pending accumulator that
  // gets applied to value over multiple frames via exponential decay.
  // Multiple keypresses while the prior nudge is still in-flight stack
  // additively, so a held key produces a continuous glide rather than
  // a series of instant snaps.
  nudgeRotation(deltaRadians: number, timestampMs: number): void {
    if (!Number.isFinite(deltaRadians)) return;
    this.nudgeAccumulator += deltaRadians;
    if (this.reducedOrPaused || this.selectionActive) return;
    this.stateValue = "suspended-drag";
    this.dragReleaseAtMs = timestampMs;
  }

  applyPitch(deltaRadians: number, timestampMs: number): void {
    if (!Number.isFinite(deltaRadians)) return;
    this.pitchValue = normalizeRadians(this.pitchValue + deltaRadians);
    if (this.reducedOrPaused || this.selectionActive) return;
    this.stateValue = "suspended-drag";
    this.dragReleaseAtMs = timestampMs;
  }

  nudgePitch(deltaRadians: number, timestampMs: number): void {
    if (!Number.isFinite(deltaRadians)) return;
    this.pitchNudgeAccumulator += deltaRadians;
    if (this.reducedOrPaused || this.selectionActive) return;
    this.stateValue = "suspended-drag";
    this.dragReleaseAtMs = timestampMs;
  }

  resetPitch(): void {
    // Ease toward 0 along the shorter angular path. Setting the nudge
    // accumulator to the negative current pitch drains pitchValue
    // toward 0 over the standard nudge half-life, matching the
    // zoom/pan eases used by resetView. Wrap to [-π, π] so resets
    // from large absolute pitches (multiple full revolutions) take
    // the shorter visual path rather than spinning back the long way.
    let distance = -this.pitchValue;
    if (distance > Math.PI) distance -= 2 * Math.PI;
    if (distance < -Math.PI) distance += 2 * Math.PI;
    this.pitchNudgeAccumulator = distance;
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

    if (Math.abs(this.nudgeAccumulator) > 1e-5 && input.dtSeconds > 0) {
      const apply =
        this.nudgeAccumulator *
        (1 - halfLifeDecay(input.dtSeconds, NUDGE_HALF_LIFE_SECONDS));
      this.value = normalizeRadians(this.value + apply);
      this.nudgeAccumulator -= apply;
    }

    if (Math.abs(this.pitchNudgeAccumulator) > 1e-5 && input.dtSeconds > 0) {
      const apply =
        this.pitchNudgeAccumulator *
        (1 - halfLifeDecay(input.dtSeconds, NUDGE_HALF_LIFE_SECONDS));
      this.pitchValue = normalizeRadians(this.pitchValue + apply);
      this.pitchNudgeAccumulator -= apply;
    }

    return this.value;
  }
}
