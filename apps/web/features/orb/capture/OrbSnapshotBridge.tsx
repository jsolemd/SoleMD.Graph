"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { Camera, Scene, WebGLRenderer } from "three";

import {
  useOrbSnapshotStore,
  type OrbSnapshotHandle,
} from "../stores/snapshot-store";

const ORB_SNAPSHOT_FILENAME = "solemd-graph-orb.png";

export function downloadCanvasBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function captureOrbSnapshot({
  camera,
  filename = ORB_SNAPSHOT_FILENAME,
  gl,
  scene,
}: {
  camera: Camera;
  filename?: string;
  gl: WebGLRenderer;
  scene: Scene;
}): void {
  gl.render(scene, camera);
  gl.domElement.toBlob((blob) => {
    if (!blob) return;
    downloadCanvasBlob(blob, filename);
  }, "image/png");
}

/**
 * Publishes a snapshot handle from inside the R3F tree so 3D chrome can
 * export the live orb without importing three.js renderer internals.
 */
export function OrbSnapshotBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  const handle = useMemo<OrbSnapshotHandle>(
    () => ({
      captureSnapshot: () => captureOrbSnapshot({ camera, gl, scene }),
    }),
    [camera, gl, scene],
  );

  useEffect(() => {
    const store = useOrbSnapshotStore.getState();
    store.setHandle(handle);
    return () => {
      useOrbSnapshotStore.getState().clearHandleIfMatches(handle);
    };
  }, [handle]);

  return null;
}
