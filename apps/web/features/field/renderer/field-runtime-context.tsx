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
 * Bridge between the layout-owned FieldCanvas and the surfaces that render
 * inside `{children}` (landing, orb).
 *
 * The Canvas/FieldScene are mounted once at the (dashboard) layout level so
 * the WebGL context survives `router.replace('/' ↔ '/graph')` under Next
 * 16's `cacheComponents` + React `<Activity>`. But per-route surfaces still
 * need access to the in-R3F artifacts — controllers (for hotspot overlays),
 * camera (for DOM projection), stageReady signal, sceneStateRef. This
 * context is that thin handoff.
 *
 * Landing reads it to wire FixedStageManager.registerController and to
 * gate its ready-state through. Orb reads it to attach picking and
 * subscribe to paper-mutation publishing. Neither surface *creates* any
 * of these refs — the layout owns them.
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
   * Surface signals readiness to tick. Landing drives this from its
   * FixedStageManager.ready; orb drives it true once the paper bake
   * has a connection. FieldCanvas consumes via the `stageReady` prop.
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
