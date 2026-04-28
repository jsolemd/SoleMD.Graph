import type { PaperChunk } from "../stores/geometry-mutation-store";
import type { OrbFocusVisualState } from "../stores/focus-visual-store";
import type { PaperAttrs } from "../bake/use-paper-attributes-baker";
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
const DEFAULT_RADIUS = 0.0043;
const BLOB_X_SCALE = 0.64;
const BLOB_Y_SCALE = 0.61;
const BLOB_Z_SCALE = 0.56;
const MOVE_SCALE = 0.0028;

export interface OrbWebGpuParticleArrays {
  count: number;
  positions: Float32Array;
  velocities: Float32Array;
  attributes: Float32Array;
  flags: Uint32Array;
}

export function createOrbWebGpuParticleArrays(
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
  const arrays = createOrbWebGpuParticleArrays(args.requestedCount);

  for (const chunk of args.chunks) {
    const stats =
      chunk.stats ?? deriveLocalPaperCorpusStats(chunk.attributes.values());
    for (const [index, attrs] of chunk.attributes) {
      if (!isResidentIndex(index, arrays.count)) continue;
      const particle = mapPaperToOrbWebGpuParticle(index, arrays.count, attrs, stats);
      writeVec4(arrays.positions, index, particle.position);
      writeVec4(arrays.velocities, index, particle.velocity);
      writeVec4(arrays.attributes, index, particle.attributes);
    }
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

function resolveOrbWebGpuParticleCount(
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

function mapPaperToOrbWebGpuParticle(
  index: number,
  count: number,
  attrs: PaperAttrs,
  stats: Parameters<typeof mapOrbPaperVisualAttributes>[1],
) {
  const seed = createSeedOrbParticle(index, count, getOrbBlobPointSource());
  const mapping = mapOrbPaperVisualAttributes(attrs, stats);
  return {
    position: [
      seed.position[0],
      seed.position[1],
      seed.position[2],
      DEFAULT_RADIUS * mapping.sizeFactor,
    ] as const,
    velocity: [
      seed.velocity[0],
      seed.velocity[1],
      seed.velocity[2],
      seed.velocity[3] * mapping.speedFactor,
    ] as const,
    attributes: [
      seed.attributes[0],
      seed.attributes[1],
      seed.attributes[2],
      seed.attributes[3],
    ] as const,
  };
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

function getOrbBlobPointSource(): FieldPointSource | null {
  try {
    return resolveFieldPointSources({
      densityScale: 1,
      ids: ["blob"],
      isMobile: false,
    }).blob;
  } catch {
    return null;
  }
}
