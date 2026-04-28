"use client";

import {
  createContext,
  useContext,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Camera } from "three";
import type { FieldController } from "../controller/FieldController";
import type {
  FieldSceneState,
  FieldStageItemId,
} from "../scene/visual-presets";

/**
 * Bridge for the layout-owned landing FieldCanvas.
 *
 * The Canvas/FieldScene stay under the (dashboard) layout for the landing
 * storytelling surface. Landing still needs access to in-R3F artifacts:
 * controllers for hotspot overlays, camera for DOM projection,
 * stageReady, and sceneStateRef. This context is that thin handoff.
 *
 * The raw WebGPU `/graph` orb path does not use this bridge for picking,
 * particle state, or touch rotation.
 */

export interface FieldRuntimeBridge {
  cameraRef: MutableRefObject<Camera | null>;
  controllersRef: MutableRefObject<
    Partial<Record<FieldStageItemId, FieldController>>
  >;
  /**
   * Bumped whenever a controller registers. Consumers key effects on
   * this to mirror controllers into their own registries without
   * maintaining their own onControllerReady callback chains.
   */
  controllerEpoch: number;
  sceneStateRef: MutableRefObject<FieldSceneState>;
  /**
   * Landing signals readiness to tick from FixedStageManager.ready.
   * FieldCanvas consumes via the `stageReady` prop.
   */
  setStageReady: Dispatch<SetStateAction<boolean>>;
  stageReady: boolean;
}

export const FieldRuntimeContext = createContext<FieldRuntimeBridge | null>(
  null,
);

export function useFieldRuntime(): FieldRuntimeBridge {
  const ctx = useContext(FieldRuntimeContext);
  if (!ctx) {
    throw new Error(
      "useFieldRuntime must be used within DashboardClientShell",
    );
  }
  return ctx;
}
