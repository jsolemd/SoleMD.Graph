/// <reference types="@webgpu/types" />

import {
  BLOB_AMPLITUDE,
  BLOB_DEPTH,
  BLOB_FREQUENCY,
  BLOB_WAVE_SPEED,
  INTRO_DEPTH_BOOST,
  INTRO_DURATION_SECONDS,
  LANDING_BASE_BLUE_RGB,
  rgb255ToUnit,
} from "../../field/shared/landing-feel-constants";
import { FRAME_UNIFORM_BYTES, clampFinite } from "./orb-webgpu-layout";

const ORB_BASE_COLOR = rgb255ToUnit(LANDING_BASE_BLUE_RGB);

// Boost targets. While a gesture is active, BLOB_AMPLITUDE and
// BLOB_FREQUENCY in fieldParams blend toward these — particles scatter
// further AND sample a higher-frequency slice of the FBM noise, so
// color regions become more energetic.
export const INTERACTION_BURST_AMPLITUDE = 0.25;
export const INTERACTION_BURST_FREQUENCY = 1.7;
export const INTERACTION_BURST_EPSILON = 1e-3;

// The burst tracks gesture **angular velocity** (rad/sec), not
// accumulated event impulses. At BURST_SATURATION_RAD_PER_SEC the
// envelope target reaches 1; below it scales linearly.
//
// 5 rad/sec ≈ 3/4 rev/sec — a sustained "fast spin" saturates, a
// slow drag (~1 rad/sec from 200 px/sec at ROTATE_RADIANS_PER_PIXEL
// 0.005) targets ~0.2, a single 5° keyboard tap (0.087 rad in one
// 16ms frame ≈ 5.4 rad/sec) targets ~1.0 for a single frame and rings
// out. Old per-input gain constants (TWIST_GAIN, KEY_STRENGTH) are
// gone — this single saturation point covers every input lane because
// each input contributes its own |Δrad| as gesture magnitude.
const BURST_SATURATION_RAD_PER_SEC = 5;

// Asymmetric envelope: short attack so the burst tracks the gesture
// without lag, long release so it rings out organically after the
// hand stops. Matches the prior Three.js BlobController's "ringing"
// feel — release half-life is the same 480ms.
const BURST_ATTACK_TAU_SECONDS = 0.08;
const BURST_RELEASE_HALF_LIFE_SECONDS = 0.48;

// 100ms time constant on the smoothed-yaw-velocity sample. Long enough
// to debounce micro-jitter, short enough to track the start/end of a
// drag without lag.
const YAW_OMEGA_TIME_CONSTANT_MS = 100;
// Skip yaw-omega smoothing if the prior sample is older than this.
// Covers tab-backgrounded gaps and avoids producing a spurious
// high-velocity reading on the first frame after a long pause.
const YAW_OMEGA_GAP_LIMIT_MS = 250;

// Gesture-velocity-driven burst envelope. Input lanes (mouse drag,
// touch twist, keyboard nudge) call kick() with the magnitude of each
// rotation step in radians; pendingMagnitude accumulates between
// frames. Every rAF tick converts it into a per-second velocity,
// derives a 0..1 target, and lerps toward the target with asymmetric
// attack / release.
//
// Why velocity, not impulse-with-decay: a per-event impulse model
// equilibrates above 1 whenever event_rate × strength > decay_rate, so
// even a slight drag at 60Hz pointermove pegs the envelope. Velocity
// is naturally rate-normalized — the burst reflects how fast the
// hand is moving right now, which is the mental model of the gesture.
export class OrbInteractionBurstEnvelope {
  private burst = 0;
  private pendingMagnitude = 0;

  // Record one input's |Δrad| for this frame. Each input lane (drag,
  // touch, keyboard) calls this with its own gesture magnitude; the
  // envelope sums them and divides by frame dt to get gesture velocity.
  kick(magnitudeRadians: number): void {
    if (!Number.isFinite(magnitudeRadians) || magnitudeRadians <= 0) return;
    this.pendingMagnitude += magnitudeRadians;
  }

  tick(dtSeconds: number): void {
    if (dtSeconds <= 0) return;
    const velocityRadPerSec = this.pendingMagnitude / dtSeconds;
    this.pendingMagnitude = 0;
    const target = Math.min(1, velocityRadPerSec / BURST_SATURATION_RAD_PER_SEC);
    if (target > this.burst) {
      // Attack — track the gesture quickly enough to feel responsive.
      const blend = 1 - Math.exp(-dtSeconds / BURST_ATTACK_TAU_SECONDS);
      this.burst += (target - this.burst) * blend;
    } else {
      // Release — exponential decay toward the (lower) target. When
      // the gesture stops, target = 0 and the burst rings out at the
      // 480ms half-life that gave the prior orb its "afterglow."
      const decay = 0.5 ** (dtSeconds / BURST_RELEASE_HALF_LIFE_SECONDS);
      this.burst = target + (this.burst - target) * decay;
    }
    if (this.burst < INTERACTION_BURST_EPSILON && target === 0) {
      this.burst = 0;
    }
  }

  reset(): void {
    this.burst = 0;
    this.pendingMagnitude = 0;
  }

  get value(): number {
    return this.burst;
  }
}

// Low-pass-filtered yaw angular velocity (rad/sec). Drives the
// tangential drift term in the compute shader so particles "swirl"
// behind the rigid camera spin while the user is rotating.
export class OrbYawOmegaSmoother {
  private smoothed = 0;
  private lastYaw = 0;
  private lastSampleMs = 0;

  sample(currentYaw: number, nowMs: number): number {
    const dtMs = nowMs - this.lastSampleMs;
    if (this.lastSampleMs === 0 || dtMs <= 0 || dtMs > YAW_OMEGA_GAP_LIMIT_MS) {
      this.smoothed = 0;
      this.lastYaw = currentYaw;
      this.lastSampleMs = nowMs;
      return 0;
    }
    let dYaw = currentYaw - this.lastYaw;
    // Wrap to (-π, π] so a 0.01 → 2π-0.01 step reads as -0.02.
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const instantOmega = (dYaw * 1000) / dtMs;
    const alpha = 1 - Math.exp(-dtMs / YAW_OMEGA_TIME_CONSTANT_MS);
    this.smoothed += (instantOmega - this.smoothed) * alpha;
    this.lastYaw = currentYaw;
    this.lastSampleMs = nowMs;
    return this.smoothed;
  }
}

// Resolves the depth field parameter, applying the post-mount intro
// boost. Returns the steady-state depth once the intro window has
// elapsed.
export class OrbIntroDepthEnvelope {
  private startMs: number | null = null;
  private completed = false;

  start(nowMs: number): void {
    this.startMs = nowMs;
    this.completed = false;
  }

  reset(): void {
    this.startMs = null;
    this.completed = false;
  }

  resolve(nowMs: number): number {
    if (this.completed || this.startMs == null) {
      return BLOB_DEPTH;
    }
    const elapsedSeconds = Math.max(0, (nowMs - this.startMs) / 1000);
    const introProgress = clampFinite(
      elapsedSeconds / INTRO_DURATION_SECONDS,
      0,
      1,
    );
    const introEase = 1 - (1 - introProgress) * (1 - introProgress);
    const depthBoost = 1 + (INTRO_DEPTH_BOOST - 1) * (1 - introEase);
    if (introProgress >= 1) {
      this.completed = true;
    }
    return BLOB_DEPTH * depthBoost;
  }
}

export interface OrbFrameUniformInputs {
  time: number;
  motionDt: number;
  particleCount: number;
  zoom: number;
  aspect: number;
  radiusScale: number;
  yaw: number;
  colorTime: number;
  yawOmega: number;
  burst: number;
  depth: number;
  panX: number;
  panY: number;
  pitch: number;
  focusIndex: number;
}

// Pack the FrameUniforms struct into the reusable buffer. Burst-blended
// amplitude/frequency are computed inline from the envelope value —
// the envelope is itself smooth (asymmetric attack/release), so the
// shader sees a continuously-varying target without an extra
// smoothing layer between them. The rotation matrix is computed here
// from yaw + pitch and written as 3 padded vec3 columns; the shader
// reads it as a single mat3x3<f32> instead of recomputing cos/sin per
// particle.
export function packOrbFrameUniforms(
  view: DataView,
  inputs: OrbFrameUniformInputs,
): void {
  view.setFloat32(0, inputs.time, true);
  view.setFloat32(4, inputs.motionDt, true);
  view.setUint32(8, inputs.particleCount, true);
  view.setFloat32(12, inputs.zoom, true);
  view.setFloat32(16, inputs.aspect, true);
  view.setFloat32(20, inputs.radiusScale, true);
  view.setFloat32(24, inputs.colorTime, true);
  view.setInt32(28, inputs.focusIndex, true);
  view.setFloat32(32, ORB_BASE_COLOR[0], true);
  view.setFloat32(36, ORB_BASE_COLOR[1], true);
  view.setFloat32(40, ORB_BASE_COLOR[2], true);
  view.setFloat32(44, inputs.yawOmega, true);
  const burst = inputs.burst;
  const amplitudeNow =
    BLOB_AMPLITUDE +
    (INTERACTION_BURST_AMPLITUDE - BLOB_AMPLITUDE) * burst;
  const frequencyNow =
    BLOB_FREQUENCY +
    (INTERACTION_BURST_FREQUENCY - BLOB_FREQUENCY) * burst;
  view.setFloat32(48, amplitudeNow, true);
  view.setFloat32(52, inputs.depth, true);
  view.setFloat32(56, frequencyNow, true);
  view.setFloat32(60, BLOB_WAVE_SPEED, true);
  view.setFloat32(64, inputs.panX, true);
  view.setFloat32(68, inputs.panY, true);
  // Offsets 72..79 are natural padding so the mat3 below lands at its
  // 16-byte alignment boundary. Left at zero (ArrayBuffer init).
  // Rotation matrix = Rx(pitch) * Ry(yaw); applied to a column vector
  // it yaws first, then pitches around screen-X. Stored as 3 column
  // vectors each padded to 16 bytes to satisfy WGSL mat3x3<f32> layout.
  const cy = Math.cos(inputs.yaw);
  const sy = Math.sin(inputs.yaw);
  const cp = Math.cos(inputs.pitch);
  const sp = Math.sin(inputs.pitch);
  // col 0 = (cy, sp*sy, -cp*sy)
  view.setFloat32(80, cy, true);
  view.setFloat32(84, sp * sy, true);
  view.setFloat32(88, -cp * sy, true);
  // 92: pad
  // col 1 = (0, cp, sp)
  view.setFloat32(96, 0, true);
  view.setFloat32(100, cp, true);
  view.setFloat32(104, sp, true);
  // 108: pad
  // col 2 = (sy, -sp*cy, cp*cy)
  view.setFloat32(112, sy, true);
  view.setFloat32(116, -sp * cy, true);
  view.setFloat32(120, cp * cy, true);
  // 124: pad
}

export function createOrbFrameUniformBytes(): {
  bytes: ArrayBuffer;
  view: DataView;
} {
  const bytes = new ArrayBuffer(FRAME_UNIFORM_BYTES);
  return { bytes, view: new DataView(bytes) };
}
