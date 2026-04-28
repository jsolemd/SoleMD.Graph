import type { PaperChunk } from "../stores/geometry-mutation-store";
import type { OrbFocusVisualState } from "../stores/focus-visual-store";
import {
  deriveLocalPaperCorpusStats,
  mapOrbPaperVisualAttributes,
} from "../bake/orb-paper-visual-mapping";
import { ORB_PARTICLE_CAPACITY } from "../bake/orb-particle-constants";
import { resolveFieldPointSources } from "../../field/asset/point-source-registry";
import type { FieldPointSource } from "../../field/asset/point-source-types";

export const ORB_WEBGPU_HOVER_FLAG = 1 << 0;
export const ORB_WEBGPU_FOCUS_FLAG = 1 << 1;
export const ORB_WEBGPU_SELECTION_FLAG = 1 << 2;
export const ORB_WEBGPU_SCOPE_FLAG = 1 << 3;
export const ORB_WEBGPU_NEIGHBOR_FLAG = 1 << 4;
export const ORB_WEBGPU_EVIDENCE_FLAG = 1 << 5;
export const ORB_WEBGPU_SCOPE_DIM_FLAG = 1 << 6;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEFAULT_RADIUS = 0.0018;
// Single radius on every axis so the body is an actual sphere. The
// prior Maze-blob triaxial scales (0.64 / 0.61 / 0.56) read as oblong
// once free 3D rotation surfaced the Z-axis squash.
const BLOB_RADIUS = 0.62;
const BLOB_X_SCALE = BLOB_RADIUS;
const BLOB_Y_SCALE = BLOB_RADIUS;
const BLOB_Z_SCALE = BLOB_RADIUS;
const MOVE_SCALE = 0.0028;

export interface OrbWebGpuParticleArrays {
  count: number;
  positions: Float32Array;
  velocities: Float32Array;
  attributes: Float32Array;
  flags: Uint32Array;
}

export interface OrbWebGpuChunkRange {
  /** First particle index touched by the chunk (inclusive). */
  fromIndex: number;
  /** Last particle index touched by the chunk (inclusive). */
  toIndex: number;
}

/**
 * Allocate and seed the orb's typed arrays once. The seed is the
 * paper-agnostic baseline drawn straight from the field blob source —
 * paper-bound chunks only adjust each particle's size (position.w) and
 * speed (velocity.w) on top of these values. Splitting the seed step
 * from chunk application is what lets us apply chunk deltas in place,
 * avoiding the O(N²) full-rebuild that re-running this loop on every
 * chunk produced.
 */
export function seedOrbWebGpuParticleArrays(
  requestedCount: number | null | undefined,
): OrbWebGpuParticleArrays {
  const count = resolveOrbWebGpuParticleCount(requestedCount);
  const source = getOrbBlobPointSource();
  const positions = new Float32Array(count * 4);
  const velocities = new Float32Array(count * 4);
  const attributes = new Float32Array(count * 4);
  const flags = new Uint32Array(count);

  for (let index = 0; index < count; index += 1) {
    const seed = createSeedOrbParticle(index, count, source);
    writeVec4(positions, index, seed.position);
    writeVec4(velocities, index, seed.velocity);
    writeVec4(attributes, index, seed.attributes);
  }

  return { count, positions, velocities, attributes, flags };
}

/**
 * Apply one streamed chunk in place. Idempotent: re-applying the same
 * chunk yields the same arrays because base radius/speed are recomputed
 * from the (cached) blob source rather than read out of the live arrays.
 *
 * Returns the contiguous index range the chunk actually wrote to so the
 * caller can do a partial GPU upload covering just that slice. Returns
 * null if the chunk wrote nothing.
 */
export function applyOrbWebGpuChunkInPlace(
  arrays: OrbWebGpuParticleArrays,
  chunk: PaperChunk,
): OrbWebGpuChunkRange | null {
  const stats =
    chunk.stats ?? deriveLocalPaperCorpusStats(chunk.attributes.values());
  const source = getOrbBlobPointSource();
  let minIndex = Number.POSITIVE_INFINITY;
  let maxIndex = Number.NEGATIVE_INFINITY;

  for (const [index, attrs] of chunk.attributes) {
    if (!isResidentIndex(index, arrays.count)) continue;
    const mapping = mapOrbPaperVisualAttributes(attrs, stats);
    arrays.positions[index * 4 + 3] = DEFAULT_RADIUS * mapping.sizeFactor;
    arrays.velocities[index * 4 + 3] =
      baseSeedSpeedForIndex(index, source) * mapping.speedFactor;
    if (index < minIndex) minIndex = index;
    if (index > maxIndex) maxIndex = index;
  }

  if (minIndex === Number.POSITIVE_INFINITY) return null;
  return { fromIndex: minIndex, toIndex: maxIndex };
}

export function buildOrbWebGpuParticleArrays(args: {
  requestedCount: number | null | undefined;
  chunks: readonly PaperChunk[];
  focus: Pick<
    OrbFocusVisualState,
    | "focusIndex"
    | "hoverIndex"
    | "selectionIndices"
    | "scopeIndices"
    | "neighborIndices"
    | "evidenceIndices"
  >;
}): OrbWebGpuParticleArrays {
  const arrays = seedOrbWebGpuParticleArrays(args.requestedCount);
  for (const chunk of args.chunks) {
    applyOrbWebGpuChunkInPlace(arrays, chunk);
  }
  arrays.flags.set(buildOrbWebGpuFlagArray(arrays.count, args.focus));
  return arrays;
}

export function buildOrbWebGpuFlagArray(
  count: number,
  focus: Pick<
    OrbFocusVisualState,
    | "focusIndex"
    | "hoverIndex"
    | "selectionIndices"
    | "scopeIndices"
    | "neighborIndices"
    | "evidenceIndices"
  >,
): Uint32Array {
  const flags = new Uint32Array(count);
  const hasScope = focus.scopeIndices.length > 0;
  if (hasScope) {
    flags.fill(ORB_WEBGPU_SCOPE_DIM_FLAG);
  }
  for (const index of focus.evidenceIndices) {
    if (isResidentIndex(index, count)) flags[index] |= ORB_WEBGPU_EVIDENCE_FLAG;
  }
  for (const index of focus.neighborIndices) {
    if (isResidentIndex(index, count)) flags[index] |= ORB_WEBGPU_NEIGHBOR_FLAG;
  }
  for (const index of focus.scopeIndices) {
    if (isResidentIndex(index, count)) {
      flags[index] |= ORB_WEBGPU_SCOPE_FLAG;
      flags[index] &= ~ORB_WEBGPU_SCOPE_DIM_FLAG;
    }
  }
  for (const index of focus.selectionIndices) {
    if (isResidentIndex(index, count)) flags[index] |= ORB_WEBGPU_SELECTION_FLAG;
  }
  if (isResidentIndex(focus.hoverIndex, count)) {
    flags[focus.hoverIndex] |= ORB_WEBGPU_HOVER_FLAG;
  }
  if (isResidentIndex(focus.focusIndex, count)) {
    flags[focus.focusIndex] |= ORB_WEBGPU_FOCUS_FLAG;
  }
  return flags;
}

export function resolveOrbWebGpuParticleCount(
  requestedCount: number | null | undefined,
): number {
  if (!Number.isFinite(requestedCount) || requestedCount == null) {
    return ORB_PARTICLE_CAPACITY;
  }
  return Math.max(0, Math.min(ORB_PARTICLE_CAPACITY, Math.trunc(requestedCount)));
}

function createSeedOrbParticle(
  index: number,
  count: number,
  source: FieldPointSource | null,
) {
  if (source && source.pointCount > 0) {
    const sourceIndex = index % source.pointCount;
    const position = source.buffers.position;
    const move = source.buffers.aMove;
    const speed = source.buffers.aSpeed;
    const alpha = source.buffers.aAlpha;
    const size = source.buffers.aClickPack;

    return {
      position: [
        (position[sourceIndex * 3] ?? 0) * BLOB_X_SCALE,
        (position[sourceIndex * 3 + 1] ?? 0) * BLOB_Y_SCALE,
        (position[sourceIndex * 3 + 2] ?? 0) * BLOB_Z_SCALE,
        DEFAULT_RADIUS * (size[sourceIndex * 4 + 3] ?? 1),
      ] as const,
      velocity: [
        (move[sourceIndex * 3] ?? 0) * MOVE_SCALE,
        (move[sourceIndex * 3 + 1] ?? 0) * MOVE_SCALE,
        (move[sourceIndex * 3 + 2] ?? 0) * MOVE_SCALE,
        averageSpeed(speed, sourceIndex),
      ] as const,
      attributes: [
        speed[sourceIndex * 3] ?? 0.5,
        speed[sourceIndex * 3 + 1] ?? 0.5,
        speed[sourceIndex * 3 + 2] ?? 0.5,
        alpha[sourceIndex] ?? 0.82,
      ] as const,
    };
  }

  const t = count <= 1 ? 0.5 : index / Math.max(1, count - 1);
  const y = 1 - 2 * t;
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * GOLDEN_ANGLE;
  const x = Math.cos(theta) * radial;
  const z = Math.sin(theta) * radial;
  const drift = 0.04 + ((index % 17) / 17) * 0.035;

  return {
    position: [x * 0.72, y * 0.64, z * 0.38, DEFAULT_RADIUS] as const,
    velocity: [
      -z * drift,
      Math.sin(theta * 0.31) * 0.01,
      x * drift,
      0,
    ] as const,
    attributes: [0.55, 0.65, 0.75, 1] as const,
  };
}

function baseSeedSpeedForIndex(
  index: number,
  source: FieldPointSource | null,
): number {
  if (source && source.pointCount > 0) {
    return averageSpeed(source.buffers.aSpeed, index % source.pointCount);
  }
  return 0;
}

function writeVec4(
  target: Float32Array,
  index: number,
  value: readonly [number, number, number, number],
): void {
  target[index * 4] = value[0];
  target[index * 4 + 1] = value[1];
  target[index * 4 + 2] = value[2];
  target[index * 4 + 3] = value[3];
}

function isResidentIndex(index: number | null | undefined, count: number): index is number {
  return (
    index != null &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < count &&
    index < ORB_PARTICLE_CAPACITY
  );
}

function averageSpeed(speed: Float32Array, sourceIndex: number): number {
  const x = speed[sourceIndex * 3] ?? 0.5;
  const y = speed[sourceIndex * 3 + 1] ?? 0.5;
  const z = speed[sourceIndex * 3 + 2] ?? 0.5;
  return (x + y + z) / 3;
}

// Module-level cache. The underlying registry already memoizes by
// (env, density, id), but resolving — even on a hit — does map lookups,
// catch-block setup, and object construction. Holding the result here
// turns the chunk hot path into a single dereference, which matters
// when 16k particles each used to call into the registry.
let cachedOrbBlobPointSource: FieldPointSource | null | undefined;

function getOrbBlobPointSource(): FieldPointSource | null {
  if (cachedOrbBlobPointSource !== undefined) return cachedOrbBlobPointSource;
  try {
    cachedOrbBlobPointSource =
      resolveFieldPointSources({
        densityScale: 1,
        ids: ["blob"],
        isMobile: false,
      }).blob ?? null;
  } catch {
    cachedOrbBlobPointSource = null;
  }
  return cachedOrbBlobPointSource;
}
