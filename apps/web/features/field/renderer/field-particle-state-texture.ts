import * as THREE from "three";

/**
 * Per-particle dynamic state, delivered to the GPU as a sidecar
 * `THREE.DataTexture` keyed by `aIndex`.
 *
 * ### Why a texture, not vertex attributes
 *
 * The field shader is at the WebGL `MAX_VERTEX_ATTRIBS` budget on
 * conforming devices: `position` + 13 custom lanes (`aMove`, `aSpeed`,
 * `aRandomness`, `aAlpha`, `aSelection`, `aIndex`, `aStreamFreq`,
 * `aFunnelNarrow`, `aFunnelThickness`, `aFunnelStartShift`,
 * `aFunnelEndShift`, `aBucket`, `aClickPack`). Adding a 15th lane
 * trips "Too many attributes" link failures on devices that reserve
 * slots for varying packing or transform-feedback bookkeeping. WebGL
 * spec guarantees only 16; iOS Safari + several Mali / Adreno parts
 * report exactly 16 with header reservation.
 *
 * Per-particle dynamic state lives here instead. The texture is
 * sized `ceil(sqrt(MAX_PARTICLES))` square (128² = 16384 lanes for
 * the field's 16k-particle baseline) and uses `RGBAFormat` so future
 * dynamic state joins on G/B/A without growing the attribute set:
 *
 *   R: filter / timeline in-scope (1.0 = in, 0.0 = out)         [slice 8]
 *   G: focus / selection excitation (1.0 = click focus,
 *      0.5 = hover)                                              [slice C]
 *      PROBE-5 hard wall: G-lane writers must derive state from
 *      useGraphStore.selectedNode only. Reading selected_point_indices
 *      or currentPointScopeSql from a G-lane writer is a slice C
 *      contract violation; see
 *      docs/future/orb-3d-cosmograph-parity-plan.md PROBE-5.
 *   B: evidence / search pulse                                   [reserved]
 *   A: future band / stage / ring state                          [reserved]
 *
 * 64 KiB total per 16k-particle field. The migration target when
 * WebGPU/TSL lands is a `StorageBufferAttribute` — same shape, no
 * texture indirection.
 *
 * ### Lifecycle
 *
 * Module-level singleton so the texture survives Activity-cached
 * route swaps (landing ↔ /graph) without re-uploading. `reset()`
 * clears every lane back to its lane default when the orb unmounts:
 * R = 255 (full-bright scope), G/B/A = 0 (no excitation / pulse /
 * band state). Stream / objectFormation layers reference the same
 * instance but never sample it (gated by `uScopeDimEnabled = 0`).
 *
 * Writes go through `writeLane()` / `clearLane()`, which update the
 * `Uint8Array` and set `texture.needsUpdate = true`. Callers that need
 * to wake `frameloop="demand"` still own the revision bump / invalidate
 * signal so batches can upload once instead of once per particle.
 */

export const PARTICLE_STATE_TEXTURE_SIZE = 128; // 128² = 16384 lanes
export const PARTICLE_STATE_LANES = 4; // RGBA8
export const PARTICLE_STATE_CAPACITY =
  PARTICLE_STATE_TEXTURE_SIZE * PARTICLE_STATE_TEXTURE_SIZE;

export type ParticleStateLane = "R" | "G" | "B" | "A";

export const LANE_DEFAULTS = {
  R: 255,
  G: 0,
  B: 0,
  A: 0,
} as const satisfies Record<ParticleStateLane, number>;

const LANE_OFFSETS = {
  R: 0,
  G: 1,
  B: 2,
  A: 3,
} as const satisfies Record<ParticleStateLane, number>;

const TOTAL_BYTES = PARTICLE_STATE_CAPACITY * PARTICLE_STATE_LANES;

let cachedTexture: THREE.DataTexture | null = null;
let cachedData: Uint8Array | null = null;

function fillLaneDefaults(data: Uint8Array): void {
  for (let index = 0; index < PARTICLE_STATE_CAPACITY; index += 1) {
    const base = index * PARTICLE_STATE_LANES;
    data[base + LANE_OFFSETS.R] = LANE_DEFAULTS.R;
    data[base + LANE_OFFSETS.G] = LANE_DEFAULTS.G;
    data[base + LANE_OFFSETS.B] = LANE_DEFAULTS.B;
    data[base + LANE_OFFSETS.A] = LANE_DEFAULTS.A;
  }
}

function build(): { texture: THREE.DataTexture; data: Uint8Array } {
  const data = new Uint8Array(TOTAL_BYTES);
  fillLaneDefaults(data);
  const texture = new THREE.DataTexture(
    data,
    PARTICLE_STATE_TEXTURE_SIZE,
    PARTICLE_STATE_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, data };
}

export function getParticleStateTexture(): THREE.DataTexture {
  if (!cachedTexture) {
    const built = build();
    cachedTexture = built.texture;
    cachedData = built.data;
  }
  return cachedTexture;
}

export function getParticleStateData(): Uint8Array {
  if (!cachedData) {
    const built = build();
    cachedTexture = built.texture;
    cachedData = built.data;
  }
  return cachedData;
}

function laneOffset(lane: ParticleStateLane, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= PARTICLE_STATE_CAPACITY) {
    throw new RangeError(
      `Particle state lane index ${index} is outside 0..${
        PARTICLE_STATE_CAPACITY - 1
      }`,
    );
  }
  return index * PARTICLE_STATE_LANES + LANE_OFFSETS[lane];
}

export function writeLane(
  lane: ParticleStateLane,
  index: number,
  value: number,
): void {
  const data = getParticleStateData();
  data[laneOffset(lane, index)] = value & 0xff;
  getParticleStateTexture().needsUpdate = true;
}

export function clearLane(lane: ParticleStateLane): void {
  const data = getParticleStateData();
  const laneOffset = LANE_OFFSETS[lane];
  const value = LANE_DEFAULTS[lane];
  for (let i = laneOffset; i < data.length; i += PARTICLE_STATE_LANES) {
    data[i] = value;
  }
  getParticleStateTexture().needsUpdate = true;
}

/**
 * Reset every lane to its lane default. Call when the orb surface
 * unmounts so the next mount doesn't replay stale dynamic state.
 */
export function resetParticleStateTexture(): void {
  if (!cachedData || !cachedTexture) return;
  fillLaneDefaults(cachedData);
  cachedTexture.needsUpdate = true;
}
