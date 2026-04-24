"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { Camera } from "three";
import { FieldCanvas } from "@/features/field/renderer/FieldCanvas";
import {
  FieldModeProvider,
  type FieldMode,
} from "@/features/field/renderer/field-mode-context";
import {
  FieldRuntimeContext,
  type FieldRuntimeBridge,
} from "@/features/field/renderer/field-runtime-context";
import {
  createFieldSceneState,
  FIELD_STAGE_ITEM_IDS,
  type FieldSceneState,
  type FieldStageItemId,
} from "@/features/field/scene/visual-presets";
import {
  createFieldSceneStore,
  FieldSceneStoreProvider,
} from "@/features/field/scroll/field-scene-store";
import type { FieldController } from "@/features/field/controller/FieldController";
import { installBlobMutationSubscriber } from "@/features/orb/bake/install-blob-mutation-subscriber";
import { useOrbGeometryMutationStore } from "@/features/orb/stores/geometry-mutation-store";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import { useShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import { useEffect } from "react";

/**
 * Layout-owned client shell for the (dashboard) route group.
 *
 * Mounts the R3F FieldCanvas once at the layout level and exposes a
 * FieldRuntimeBridge so `/` (landing) and `/graph` (orb) can drive it
 * without remounting the WebGL context across navigations. Next 16's
 * `cacheComponents: true` keeps this subtree alive across
 * `router.replace('/' ↔ '/graph')` — only `{children}` swaps.
 *
 * Scope contract:
 * - Canvas + scene store + field mode live HERE.
 * - FixedStageManager + scroll bindings + DOM overlays stay in the
 *   landing surface (the manifest is landing-specific).
 * - Orb picking + detail panel + paper bake live in features/orb/.
 */
export function DashboardClientShell({
  children,
}: {
  children: ReactNode;
}) {
  const shellVariant = useShellVariant();
  const pathname = usePathname();
  const fieldMode: FieldMode = pathname === "/graph" ? "orb" : "landing";

  // sceneStateRef + sceneStore must survive route swaps. useMemo with an
  // empty dep array gives us layout-stable references as long as the
  // layout itself is cached.
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

  // Only wire the orb → blob mutation bridge when /graph is active. On
  // navigation back to landing, reset the store so stale chunks don't
  // replay when the user returns to /graph without a full bundle refetch.
  const blobGeometrySubscriber =
    fieldMode === "orb" ? installBlobMutationSubscriber : undefined;

  useEffect(() => {
    if (fieldMode === "orb") return;
    useOrbGeometryMutationStore.getState().reset();
  }, [fieldMode]);

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
    <ShellVariantProvider value={shellVariant}>
      <FieldModeProvider mode={fieldMode}>
        <FieldSceneStoreProvider store={sceneStore}>
          <FieldRuntimeContext.Provider value={bridge}>
            <FieldCanvas
              activeIds={FIELD_STAGE_ITEM_IDS}
              blobGeometrySubscriber={blobGeometrySubscriber}
              cameraRef={cameraRef}
              className="fixed inset-0"
              onControllerReady={handleControllerReady}
              sceneStateRef={sceneStateRef}
              stageReady={stageReady}
            />
            {children}
          </FieldRuntimeContext.Provider>
        </FieldSceneStoreProvider>
      </FieldModeProvider>
    </ShellVariantProvider>
  );
}
