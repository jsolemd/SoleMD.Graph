import {
  ORB_WEBGPU_FOCUS_FLAG,
  ORB_WEBGPU_HOVER_FLAG,
  ORB_WEBGPU_SELECTION_FLAG,
} from "./orb-webgpu-particles";

// Per-particle interaction-state decay weights. Replaces binary
// flag-driven if/max blocks in the shader with smoothly-interpolated
// targets so hover/select/focus visually fade in and out instead of
// snapping. Storage layout matches GPU expectation: vec4 per particle
// (hover, select, focus, _reserved).
export const HOVER_TAU_SECONDS = 0.1;
export const SELECT_TAU_SECONDS = 0.3;
export const FOCUS_TAU_SECONDS = 0.45;

const WEIGHT_VEC4 = 4;

export interface OrbInteractionWeights {
  readonly capacity: number;
  readonly data: Float32Array;
}

export function createOrbInteractionWeights(
  capacity: number,
): OrbInteractionWeights {
  return {
    capacity,
    data: new Float32Array(capacity * WEIGHT_VEC4),
  };
}

export function tickOrbInteractionWeights(
  weights: OrbInteractionWeights,
  flags: Uint32Array,
  count: number,
  dtSeconds: number,
): void {
  if (count <= 0 || dtSeconds <= 0) return;
  const hoverDecay = Math.exp(-dtSeconds / HOVER_TAU_SECONDS);
  const selectDecay = Math.exp(-dtSeconds / SELECT_TAU_SECONDS);
  const focusDecay = Math.exp(-dtSeconds / FOCUS_TAU_SECONDS);
  const limit = Math.min(count, weights.capacity, flags.length);
  const data = weights.data;
  for (let i = 0; i < limit; i += 1) {
    const flag = flags[i] ?? 0;
    const offset = i * WEIGHT_VEC4;
    const hoverTarget = (flag & ORB_WEBGPU_HOVER_FLAG) !== 0 ? 1 : 0;
    const selectTarget = (flag & ORB_WEBGPU_SELECTION_FLAG) !== 0 ? 1 : 0;
    const focusTarget = (flag & ORB_WEBGPU_FOCUS_FLAG) !== 0 ? 1 : 0;
    data[offset] =
      hoverTarget + ((data[offset] ?? 0) - hoverTarget) * hoverDecay;
    data[offset + 1] =
      selectTarget + ((data[offset + 1] ?? 0) - selectTarget) * selectDecay;
    data[offset + 2] =
      focusTarget + ((data[offset + 2] ?? 0) - focusTarget) * focusDecay;
  }
}

export function resetOrbInteractionWeights(
  weights: OrbInteractionWeights,
): void {
  weights.data.fill(0);
}
