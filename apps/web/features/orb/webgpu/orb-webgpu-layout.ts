/// <reference types="@webgpu/types" />

export const COMPUTE_POSITION_INDEX = 0;
export const COMPUTE_VELOCITY_INDEX = 1;
export const COMPUTE_ATTRIBUTE_INDEX = 2;
export const COMPUTE_FRAME_INDEX = 3;
export const COMPUTE_WEIGHT_INDEX = 4;
export const COMPUTE_PALETTE_TEXTURE_INDEX = 5;
export const COMPUTE_PALETTE_SAMPLER_INDEX = 6;
export const RENDER_FRAME_INDEX = 7;
export const PICK_PARAM_INDEX = 10;
export const PICK_RESULT_INDEX = 11;
export const RECT_PARAM_INDEX = 12;
export const RECT_RESULT_INDEX = 13;
export const COMPUTE_FLAG_INDEX = 16;
export const COMPUTE_DISPLAY_INDEX = 17;
export const RENDER_DISPLAY_INDEX = 18;
export const PICK_DISPLAY_INDEX = 19;
export const RENDER_SPRITE_TEXTURE_INDEX = 20;
export const RENDER_SPRITE_SAMPLER_INDEX = 21;

export const U32_BYTES = 4;
export const VEC4_BYTES = 16;
export const DISPLAY_PARTICLE_BYTES = VEC4_BYTES * 3;
// FrameUniforms layout (128 bytes, 16-byte aligned):
//  0  time, dt, count, viewZoom
// 16  aspect, radiusScale, colorTime, focusIndex (i32, -1 = none)
// 32  baseColor (vec4f) — RGB + yawOmega in .w
// 48  fieldParams (vec4f) — amplitude, depth, frequency, waveSpeed
// 64  viewPan (vec2f), 8 bytes pad to align mat3 at 80
// 80  rotation (mat3x3<f32>) — 3 vec3 columns, each padded to 16 bytes
// Yaw + pitch are baked into this matrix CPU-side so the per-particle
// compute shader does one mat3 × vec3 instead of 4 cos + 4 sin.
export const FRAME_UNIFORM_BYTES = 128;
export const PICK_PARAM_BYTES = 16;
export const RECT_PARAM_BYTES = 32;

export function createBuffer(
  device: GPUDevice,
  size: number,
  usage: GPUBufferUsageFlags,
  label: string,
) {
  return device.createBuffer({
    label,
    size: Math.max(4, alignTo(size, 4)),
    usage,
  });
}

export function storageEntry(
  binding: number,
  visibility: GPUShaderStageFlags,
  type: GPUBufferBindingType,
): GPUBindGroupLayoutEntry {
  return {
    binding,
    buffer: { type },
    visibility,
  };
}

export function writePickParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  args: { x: number; y: number; aspect: number; count: number },
): void {
  const bytes = new ArrayBuffer(PICK_PARAM_BYTES);
  const view = new DataView(bytes);
  view.setFloat32(0, args.x, true);
  view.setFloat32(4, args.y, true);
  view.setFloat32(8, args.aspect, true);
  view.setUint32(12, args.count, true);
  device.queue.writeBuffer(buffer, 0, bytes);
}

export function writeRectParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  args: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    aspect: number;
    count: number;
    mode: number;
  },
): void {
  const bytes = new ArrayBuffer(RECT_PARAM_BYTES);
  const view = new DataView(bytes);
  view.setFloat32(0, args.left, true);
  view.setFloat32(4, args.top, true);
  view.setFloat32(8, args.right, true);
  view.setFloat32(12, args.bottom, true);
  view.setFloat32(16, args.aspect, true);
  view.setUint32(20, args.count, true);
  view.setUint32(24, args.mode, true);
  view.setUint32(28, 0, true);
  device.queue.writeBuffer(buffer, 0, bytes);
}

export function normalizeRadians(value: number): number {
  const tau = Math.PI * 2;
  return ((value % tau) + tau) % tau;
}

export function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// Half-life decay factor for an exponentially smoothed signal: after
// `halfLifeSeconds` of dt, the residual is exactly 0.5. Shared by every
// orb camera controller (zoom, pan, rotation nudges) so the ease feels
// consistent across input axes.
export function halfLifeDecay(dtSeconds: number, halfLifeSeconds: number): number {
  if (dtSeconds <= 0) return 1;
  return Math.pow(0.5, dtSeconds / halfLifeSeconds);
}

// Per-frame ease of a scalar value toward a target with an exponential
// half-life. Snaps to the target once within `snapEpsilon` so a
// long-running ease eventually settles exactly rather than drifting on
// floating-point residue.
export function easeTowardTarget(
  value: number,
  target: number,
  dtSeconds: number,
  halfLifeSeconds: number,
  snapEpsilon = 1e-4,
): number {
  if (dtSeconds <= 0) return value;
  const next = target + (value - target) * halfLifeDecay(dtSeconds, halfLifeSeconds);
  return Math.abs(next - target) < snapEpsilon ? target : next;
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
