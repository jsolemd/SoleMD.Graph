import { Camera, Group, Vector3 } from "three";
import type { FieldPointSource } from "../asset/point-source-types";

// Canonical projection layer. Controllers and runtime helpers delegate
// here so every overlay surface (blob hotspot DOM, stream popups,
// objectFormation labels, wiki anchors) shares one source of truth.
//
// Coordinate contract:
//   - viewportWidth / viewportHeight are PHYSICAL pixels
//     (state.gl.domElement.{width,height})
//   - pixelRatio is explicit; no window.devicePixelRatio read here
//   - output x / y are CSS pixels (ready for DOM translate3d)
//   - world-space input vectors are mutated to NDC during projection;
//     callers that need to preserve the input must pass a scratch vector.

const DEFAULT_MARGIN_PX = 24;
const DEFAULT_MAX_Z = 0.84;
const MIN_HOTSPOT_SCALE = 0.72;
const MAX_HOTSPOT_SCALE = 1.36;

export interface FieldScreenProjection {
  x: number;
  y: number;
  z: number;
}

export interface FieldViewportProjection extends FieldScreenProjection {
  inViewport: boolean;
}

export interface FieldHotspotVertexProjection {
  candidateIndex: number;
  scale: number;
  x: number;
  y: number;
}

// Pure projection to CSS-pixel screen space.
//
// Mutates `worldVector` (via `.project(camera)`) unless `scratch` is
// provided, in which case `scratch` receives the copy and is mutated
// instead.
export function projectToScreen(
  worldVector: Vector3,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
  pixelRatio: number,
  scratch?: Vector3,
): FieldScreenProjection {
  const target = scratch ? scratch.copy(worldVector) : worldVector;
  target.project(camera);
  const cssWidth = viewportWidth / pixelRatio;
  const cssHeight = viewportHeight / pixelRatio;
  return {
    x: ((target.x + 1) * cssWidth) / 2,
    y: ((-target.y + 1) * cssHeight) / 2,
    z: target.z,
  };
}

export interface ProjectInViewportOptions {
  marginPx?: number;
  maxZ?: number;
  scratch?: Vector3;
}

// Project + cull. CSS-pixel output; cull bounds compared in the same
// CSS-pixel space so HiDPI viewports stay correct.
export function projectInViewport(
  worldVector: Vector3,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
  pixelRatio: number,
  options: ProjectInViewportOptions = {},
): FieldViewportProjection {
  const marginPx = options.marginPx ?? DEFAULT_MARGIN_PX;
  const maxZ = options.maxZ ?? DEFAULT_MAX_Z;
  const { x, y, z } = projectToScreen(
    worldVector,
    camera,
    viewportWidth,
    viewportHeight,
    pixelRatio,
    options.scratch,
  );
  const cssWidth = viewportWidth / pixelRatio;
  const cssHeight = viewportHeight / pixelRatio;
  const inViewport =
    x > marginPx &&
    x < cssWidth - marginPx &&
    y > marginPx &&
    y < cssHeight - marginPx &&
    z < maxZ;
  return { x, y, z, inViewport };
}

// Named-arg convenience for surfaces that hold a world-space anchor.
export function projectFieldAnchor({
  anchor,
  camera,
  viewportWidth,
  viewportHeight,
  pixelRatio,
  marginPx,
  maxZ,
  scratch,
}: {
  anchor: Vector3;
  camera: Camera;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  marginPx?: number;
  maxZ?: number;
  scratch?: Vector3;
}): FieldViewportProjection {
  return projectInViewport(anchor, camera, viewportWidth, viewportHeight, pixelRatio, {
    marginPx,
    maxZ,
    scratch,
  });
}

// Project a single point-source vertex through a model group, returning
// the hotspot-shaped projection used by BlobController's DOM writer.
// Returns null when the vertex is on the far side of the model
// (`localZ > 0`) or falls outside the viewport cull window.
export function projectPointSourceVertex({
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
}): FieldHotspotVertexProjection | null {
  const positionOffset = candidateIndex * 3;
  const localZ = source.buffers.position[positionOffset + 2] ?? 0;
  if (localZ > 0) return null;

  vector.set(
    source.buffers.position[positionOffset] ?? 0,
    source.buffers.position[positionOffset + 1] ?? 0,
    source.buffers.position[positionOffset + 2] ?? 0,
  );
  blobModel.localToWorld(vector);
  const { x, y, z, inViewport } = projectInViewport(
    vector,
    camera,
    width,
    height,
    pixelRatio,
  );
  if (!inViewport) return null;
  const scale = Math.max(
    MIN_HOTSPOT_SCALE,
    Math.min(MAX_HOTSPOT_SCALE, (1 - z) * 2),
  );
  return { candidateIndex, scale, x, y };
}
