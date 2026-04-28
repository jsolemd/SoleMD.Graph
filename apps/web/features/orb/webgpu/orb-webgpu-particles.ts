import type { PaperChunk } from "../stores/geometry-mutation-store";
import type { OrbFocusVisualState } from "../stores/focus-visual-store";
import type { PaperAttrs } from "../bake/use-paper-attributes-baker";
import {
  deriveLocalPaperCorpusStats,
  mapOrbPaperVisualAttributes,
} from "../bake/orb-paper-visual-mapping";
import { ORB_PARTICLE_CAPACITY } from "../bake/orb-particle-constants";

export const ORB_WEBGPU_HOVER_FLAG = 1 << 0;
export const ORB_WEBGPU_FOCUS_FLAG = 1 << 1;
export const ORB_WEBGPU_SELECTION_FLAG = 1 << 2;
export const ORB_WEBGPU_SCOPE_FLAG = 1 << 3;
export const ORB_WEBGPU_NEIGHBOR_FLAG = 1 << 4;
export const ORB_WEBGPU_EVIDENCE_FLAG = 1 << 5;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEFAULT_RADIUS = 0.0065;

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
  const positions = new Float32Array(count * 4);
  const velocities = new Float32Array(count * 4);
  const attributes = new Float32Array(count * 4);
  const flags = new Uint32Array(count);

  for (let index = 0; index < count; index += 1) {
    const seed = createSeedOrbParticle(index, count);
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
  for (const index of focus.evidenceIndices) {
    if (isResidentIndex(index, count)) flags[index] |= ORB_WEBGPU_EVIDENCE_FLAG;
  }
  for (const index of focus.neighborIndices) {
    if (isResidentIndex(index, count)) flags[index] |= ORB_WEBGPU_NEIGHBOR_FLAG;
  }
  for (const index of focus.scopeIndices) {
    if (isResidentIndex(index, count)) flags[index] |= ORB_WEBGPU_SCOPE_FLAG;
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

function createSeedOrbParticle(index: number, count: number) {
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
    attributes: [0.62, 0.72, 0.86, 1] as const,
  };
}

function mapPaperToOrbWebGpuParticle(
  index: number,
  count: number,
  attrs: PaperAttrs,
  stats: Parameters<typeof mapOrbPaperVisualAttributes>[1],
) {
  const seed = createSeedOrbParticle(index, count);
  const mapping = mapOrbPaperVisualAttributes(attrs, stats);
  const graphX = normalizeGraphCoordinate(attrs.x);
  const graphY = normalizeGraphCoordinate(attrs.y);
  const hasGraphCoordinates =
    Number.isFinite(attrs.x) && Number.isFinite(attrs.y);
  const clusterPhase = ((attrs.clusterId % 37) / 37) * Math.PI * 2;
  const z = Math.sin(clusterPhase + index * 0.017) * 0.36;
  const position = hasGraphCoordinates
    ? [
        graphX * 0.78,
        graphY * 0.62,
        z,
        DEFAULT_RADIUS * mapping.sizeFactor,
      ] as const
    : ([
        seed.position[0],
        seed.position[1],
        seed.position[2],
        DEFAULT_RADIUS * mapping.sizeFactor,
      ] as const);
  const color = colorFromCluster(attrs.clusterId, mapping.referenceWeight);

  return {
    position,
    velocity: [
      seed.velocity[0] * mapping.speedFactor,
      seed.velocity[1] * mapping.speedFactor,
      seed.velocity[2] * mapping.speedFactor,
      0,
    ] as const,
    attributes: [color[0], color[1], color[2], mapping.speedFactor] as const,
  };
}

function normalizeGraphCoordinate(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.tanh((value ?? 0) / 650);
}

function colorFromCluster(clusterId: number, weight: number): [number, number, number] {
  const hue = (((clusterId * 47) % 360) + 360) % 360;
  const saturation = 0.58 + weight * 0.18;
  const lightness = 0.58 + weight * 0.12;
  return hslToRgb(hue / 360, saturation, lightness);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hueToRgb = (p: number, q: number, tIn: number) => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, h + 1 / 3),
    hueToRgb(p, q, h),
    hueToRgb(p, q, h - 1 / 3),
  ];
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
