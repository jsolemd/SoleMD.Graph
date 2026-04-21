import { Camera, Group, Vector3 } from "three";
import type { FieldPointSource } from "../asset/point-source-types";

export interface BlobHotspotState {
  interval: number;
  maxNumber: number;
  onlyReds: number;
  opacity: number;
}

export interface FieldHotspotFrame {
  color: string;
  id: string;
  mode: "card" | "dot" | "hidden";
  opacity: number;
  scale: number;
  showCard: boolean;
  visible: boolean;
  x: number;
  y: number;
}

export interface BlobHotspotProjection {
  candidateIndex: number;
  scale: number;
  x: number;
  y: number;
}

export interface BlobHotspotRuntime {
  candidateIndex: number | null;
  cycleDurationMs: number;
  cycleStartAtMs: number;
  invalidSinceAtMs: number | null;
  lastProjected: BlobHotspotProjection | null;
  phaseKey: "card" | "dot" | "hidden";
}

export const BLOB_HOTSPOT_COUNT = 40;
export const BLOB_HOTSPOT_CARD_COUNT = 3;
export const BLOB_HOTSPOT_IDS = Array.from(
  { length: BLOB_HOTSPOT_COUNT },
  (_, index) => `blob-hotspot-${index}`,
);

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

export function sampleBlobHotspotDelayMs() {
  return Math.random() * 2000;
}

export function getBlobHotspotCycleDurationMs({
  isSingleVisible,
}: {
  hotspotIndex: number;
  isSingleVisible: boolean;
  phaseKey: BlobHotspotRuntime["phaseKey"];
}) {
  return isSingleVisible ? 4000 : 2000;
}

export function hotspotPhaseUsesCycle(
  phaseKey: BlobHotspotRuntime["phaseKey"],
) {
  return phaseKey === "dot";
}

export function getBlobHotspotPulseEnvelope(progress: number) {
  if (progress <= 0 || progress >= 1) return 0;
  if (progress < 0.2) return smoothstep(0, 0.2, progress);
  if (progress <= 0.8) return 1;
  return 1 - smoothstep(0.8, 1, progress);
}

export function getPointColorCss(
  source: FieldPointSource,
  candidateIndex: number,
) {
  const colorOffset = candidateIndex * 3;
  const red = Math.max(
    0,
    Math.min(255, Math.round((source.buffers.color[colorOffset] ?? 0) * 255)),
  );
  const green = Math.max(
    0,
    Math.min(
      255,
      Math.round((source.buffers.color[colorOffset + 1] ?? 0) * 255),
    ),
  );
  const blue = Math.max(
    0,
    Math.min(
      255,
      Math.round((source.buffers.color[colorOffset + 2] ?? 0) * 255),
    ),
  );
  return `rgb(${red} ${green} ${blue})`;
}

export function projectBlobHotspotCandidate({
  blobModel,
  camera,
  candidateIndex,
  height,
  pixelRatio = 1,
  source,
  vector,
  width,
}: {
  blobModel: Group;
  camera: Camera;
  candidateIndex: number;
  height: number;
  pixelRatio?: number;
  source: FieldPointSource;
  vector: Vector3;
  width: number;
}): BlobHotspotProjection | null {
  const positionOffset = candidateIndex * 3;
  const localZ = source.buffers.position[positionOffset + 2] ?? 0;
  if (localZ > 0) return null;

  vector.set(
    source.buffers.position[positionOffset] ?? 0,
    source.buffers.position[positionOffset + 1] ?? 0,
    source.buffers.position[positionOffset + 2] ?? 0,
  );
  blobModel.localToWorld(vector);
  vector.project(camera);

  const x = ((vector.x + 1) * width) / 2 / pixelRatio;
  const y = ((-vector.y + 1) * height) / 2 / pixelRatio;
  const scale = Math.max(0.72, Math.min(1.36, (1 - vector.z) * 2));
  const withinViewport =
    x > 24 &&
    x < width - 24 &&
    y > 24 &&
    y < height - 24 &&
    vector.z < 0.84;

  if (!withinViewport) return null;
  return { candidateIndex, scale, x, y };
}

export function selectBlobHotspotCandidate({
  blobModel,
  camera,
  maxAttempts = 20,
  pixelRatio = 1,
  source,
  usedCandidateIndices,
  vector,
  viewportHeight,
  viewportWidth,
}: {
  blobModel: Group;
  camera: Camera;
  maxAttempts?: number;
  pixelRatio?: number;
  source: FieldPointSource;
  usedCandidateIndices: Set<number>;
  vector: Vector3;
  viewportHeight: number;
  viewportWidth: number;
}) {
  if (source.pointCount === 0) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidateIndex = Math.floor(Math.random() * source.pointCount);
    if (usedCandidateIndices.has(candidateIndex)) continue;
    const projected = projectBlobHotspotCandidate({
      blobModel,
      camera,
      candidateIndex,
      height: viewportHeight,
      pixelRatio,
      source,
      vector,
      width: viewportWidth,
    });
    if (!projected) continue;
    return projected;
  }
  return null;
}
