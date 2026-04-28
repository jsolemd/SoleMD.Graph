"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
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
import {
  OrbInteractionContext,
  type OrbInteractionBridge,
} from "@/features/orb/interaction/orb-interaction-context";
import { useOrbGeometryMutationStore } from "@/features/orb/stores/geometry-mutation-store";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import { useShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import {
  useDashboardStore,
  useShellStore,
  type RendererMode,
} from "@/features/graph/stores";

export function resolveFieldMode(
  pathname: string | null,
  rendererMode: RendererMode,
): FieldMode {
  // /graph in '3d' mode is owned by the raw WebGPU orb runtime mounted
  // inside OrbSurface. Toggling to '2d' (native Cosmograph) keeps the
  // dashboard layout mounted while the layout-level landing FieldCanvas
  // remains unmounted for /graph.
  return pathname === "/graph" && rendererMode === "3d" ? "orb" : "landing";
}

/**
 * Layout-owned client shell for the (dashboard) route group.
 *
 * Mounts the R3F FieldCanvas for landing. The /graph 3D path owns its
 * own raw WebGPU canvas in OrbSurface; the layout no longer installs
 * WebGL blob mutation or picking subscribers for orb mode.
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
  const rendererMode = useDashboardStore((s) => s.rendererMode);
  const fieldMode = resolveFieldMode(pathname, rendererMode);

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
  // The OrbInteractionSurface lives inside `{children}`; the bridge is
  // hoisted here so touch/hover/selection bindings can follow the live
  // DOM element across the 3D ↔ 2D toggle.
  const [orbSurfaceElement, setOrbSurfaceElement] =
    useState<HTMLDivElement | null>(null);

  const handleControllerReady = useCallback(
    (id: FieldStageItemId, controller: FieldController) => {
      if (controllersRef.current[id] === controller) return;
      controllersRef.current[id] = controller;
      setControllerEpoch((n) => n + 1);
    },
    [],
  );

  useEffect(() => {
    if (fieldMode === "orb") return;
    useOrbGeometryMutationStore.getState().reset();
  }, [fieldMode]);

  // Slice 9: OS reduced-motion bridge. Mirrors the media-query into
  // useShellStore.prefersReducedMotion so consumers can collapse the
  // three orthogonal motion
  // inputs (user-controlled pauseMotion, user/auto lowPowerProfile,
  // system-controlled OS preference) into a single derived flag
  // without each call site re-running window.matchMedia. Critical
  // contract: we do NOT write into setPauseMotion here — the OS
  // preference is a separate input so a future pause-motion UI
  // toggle doesn't fight a system event.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setPrefersReducedMotion =
      useShellStore.getState().setPrefersReducedMotion;
    setPrefersReducedMotion(media.matches);
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    media.addEventListener("change", handler);
    return () => {
      media.removeEventListener("change", handler);
    };
  }, []);

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

  const orbInteractionBridge = useMemo<OrbInteractionBridge>(
    () => ({
      surfaceElement: orbSurfaceElement,
      registerSurface: setOrbSurfaceElement,
    }),
    [orbSurfaceElement],
  );

  return (
    <ShellVariantProvider value={shellVariant}>
      <FieldModeProvider mode={fieldMode}>
        <FieldSceneStoreProvider store={sceneStore}>
          <FieldRuntimeContext.Provider value={bridge}>
            <OrbInteractionContext.Provider value={orbInteractionBridge}>
              {fieldMode === "landing" ? (
                <FieldCanvas
                  activeIds={FIELD_STAGE_ITEM_IDS}
                  cameraRef={cameraRef}
                  className="fixed inset-0"
                  onControllerReady={handleControllerReady}
                  sceneStateRef={sceneStateRef}
                  stageReady={stageReady}
                />
              ) : null}
              {children}
            </OrbInteractionContext.Provider>
          </FieldRuntimeContext.Provider>
        </FieldSceneStoreProvider>
      </FieldModeProvider>
    </ShellVariantProvider>
  );
}
