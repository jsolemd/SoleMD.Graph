"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { Camera } from "three";
import type { FieldController } from "../controller/FieldController";
import { FieldCanvas } from "./FieldCanvas";
import {
  FieldModeProvider,
  type FieldMode,
} from "./field-mode-context";
import {
  FieldRuntimeContext,
  type FieldRuntimeBridge,
} from "./field-runtime-context";
import {
  createFieldSceneState,
  FIELD_STAGE_ITEM_IDS,
  type FieldSceneState,
  type FieldStageItemId,
} from "../scene/visual-presets";
import {
  createFieldSceneStore,
  FieldSceneStoreProvider,
} from "../scroll/field-scene-store";

interface FieldRuntimeShellProps {
  children: ReactNode;
  mode: FieldMode;
}

export function FieldRuntimeShell({
  children,
  mode,
}: FieldRuntimeShellProps) {
  const sceneStateRef = useMemo<MutableRefObject<FieldSceneState>>(
    () => ({ current: createFieldSceneState() }),
    [],
  );
  const sceneStore = useMemo(
    () => createFieldSceneStore(sceneStateRef.current),
    [sceneStateRef],
  );

  const cameraRef = useRef<Camera | null>(null);
  const controllersRef = useRef<
    Partial<Record<FieldStageItemId, FieldController>>
  >({});
  const [controllerEpoch, setControllerEpoch] = useState(0);
  const [stageReady, setStageReady] = useState(false);

  const handleControllerReady = useCallback(
    (id: FieldStageItemId, controller: FieldController) => {
      if (controllersRef.current[id] === controller) return;
      controllersRef.current[id] = controller;
      setControllerEpoch((n) => n + 1);
    },
    [],
  );

  const bridge = useMemo<FieldRuntimeBridge>(
    () => ({
      cameraRef,
      controllersRef,
      controllerEpoch,
      sceneStateRef,
      setStageReady,
      stageReady,
    }),
    [controllerEpoch, sceneStateRef, stageReady],
  );

  return (
    <FieldModeProvider mode={mode}>
      <FieldSceneStoreProvider store={sceneStore}>
        <FieldRuntimeContext.Provider value={bridge}>
          {mode === "landing" ? (
            <FieldCanvas
              activeIds={FIELD_STAGE_ITEM_IDS}
              cameraRef={cameraRef}
              onControllerReady={handleControllerReady}
              sceneStateRef={sceneStateRef}
              stageReady={stageReady}
            />
          ) : null}
          {children}
        </FieldRuntimeContext.Provider>
      </FieldSceneStoreProvider>
    </FieldModeProvider>
  );
}
