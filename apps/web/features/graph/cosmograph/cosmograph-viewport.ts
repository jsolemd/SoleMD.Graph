import type { CosmographRef } from "@cosmograph/react";
import type { CameraSnapshot } from "@solemd/graph/cosmograph";

/**
 * Adapter for the Cosmograph internal d3-zoom transform.
 *
 * Cosmograph's public API exposes `setZoomLevel`, `fitView`, and
 * `zoomToPoint` but no direct pan / arbitrary-camera-set method. Camera
 * persistence and keyboard pan both need read+write access to the live
 * `(zoomLevel, transformX, transformY)` triple, which lives on the
 * underlying `_cosmos.zoomInstance.eventTransform`. This module is the
 * one place that reaches into `_cosmos`; consumers stay above the
 * adapter line.
 *
 * If Cosmograph ever ships a public viewport-set method, swap the body
 * of these two functions and every caller stays unchanged.
 */

interface ZoomTransformLike {
  constructor: new (k: number, x: number, y: number) => ZoomTransformLike;
  k: number;
  x: number;
  y: number;
}

interface CosmographInternalHandle {
  _cosmos?: {
    canvasD3Selection?: unknown;
    zoomInstance?: {
      behavior?: {
        transform?: (selection: unknown, transform: ZoomTransformLike) => void;
      };
      eventTransform?: ZoomTransformLike;
    };
  };
}

export function getViewportTransform(
  cosmograph: CosmographRef | undefined | null,
): CameraSnapshot | null {
  if (!cosmograph) return null;
  const internal = cosmograph as unknown as CosmographInternalHandle;
  const transform = internal._cosmos?.zoomInstance?.eventTransform;
  if (!transform) return null;
  if (
    !Number.isFinite(transform.k) ||
    !Number.isFinite(transform.x) ||
    !Number.isFinite(transform.y)
  ) {
    return null;
  }
  return {
    zoomLevel: transform.k,
    transformX: transform.x,
    transformY: transform.y,
  };
}

export function applyViewportCamera(
  cosmograph: CosmographRef | undefined | null,
  camera: CameraSnapshot,
): boolean {
  if (!cosmograph) return false;
  const internal = cosmograph as unknown as CosmographInternalHandle;
  const zoomInstance = internal._cosmos?.zoomInstance;
  const selection = internal._cosmos?.canvasD3Selection;
  const transformFn = zoomInstance?.behavior?.transform;
  const Transform = zoomInstance?.eventTransform?.constructor;
  if (!selection || !transformFn || !Transform) return false;
  const transform = new Transform(
    camera.zoomLevel,
    camera.transformX,
    camera.transformY,
  );
  transformFn.call(zoomInstance.behavior, selection, transform);
  return true;
}
