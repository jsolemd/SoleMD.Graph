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
import { installBlobMutationSubscriber } from "@/features/orb/bake/install-blob-mutation-subscriber";
import { OrbCameraControls } from "@/features/orb/camera/OrbCameraControls";
import { installBlobPointsSubscriber } from "@/features/orb/interaction/install-blob-points-subscriber";
import {
  OrbInteractionContext,
  type OrbInteractionBridge,
} from "@/features/orb/interaction/orb-interaction-context";
import { useOrbGeometryMutationStore } from "@/features/orb/stores/geometry-mutation-store";
import { useOrbScopeMutationStore } from "@/features/orb/stores/scope-mutation-store";
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
  // /graph in '3d' mode uses the field substrate as the orb. Toggling to
  // '2d' (native Cosmograph) keeps the dashboard layout mounted but the
  // field stays inert so blob mutation/picking subscribers don't run
  // pointlessly under Cosmograph.
  return pathname === "/graph" && rendererMode === "3d" ? "orb" : "landing";
}

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
  // Slice A0: the OrbInteractionSurface lives inside `{children}` (orb
  // mode), but slice A1's `<CameraControls>` lives inside FieldCanvas
  // which is its sibling. React context only flows downward, so the
  // bridge is hoisted here above both subtrees. `surfaceElement` is
  // reactive state (not a ref) so consumers can key effects on element
  // identity changing across the 3D ↔ 2D toggle.
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

  // Wire the orb → blob mutation bridge only while /graph is active.
  // Resetting the store on transition back to landing prevents a stale
  // chunk from replaying against a freshly-baked geometry when the user
  // returns to /graph — the baker will re-stream on re-mount.
  const blobGeometrySubscriber =
    fieldMode === "orb" ? installBlobMutationSubscriber : undefined;
  const blobPointsSubscriber =
    fieldMode === "orb" ? installBlobPointsSubscriber : undefined;

  useEffect(() => {
    if (fieldMode === "orb") return;
    useOrbGeometryMutationStore.getState().reset();
    useOrbScopeMutationStore.getState().reset();
  }, [fieldMode]);

  // Slice 9: OS reduced-motion bridge. Mirrors the media-query into
  // useShellStore.prefersReducedMotion so consumers (OrbSurface,
  // BlobController gate) can collapse the three orthogonal motion
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
              <FieldCanvas
                activeIds={FIELD_STAGE_ITEM_IDS}
                blobGeometrySubscriber={blobGeometrySubscriber}
                blobPointsSubscriber={blobPointsSubscriber}
                cameraRef={cameraRef}
                canvasChildren={
                  fieldMode === "orb" ? <OrbCameraControls /> : null
                }
                className="fixed inset-0"
                onControllerReady={handleControllerReady}
                sceneStateRef={sceneStateRef}
                stageReady={stageReady}
              />
              {children}
            </OrbInteractionContext.Provider>
          </FieldRuntimeContext.Provider>
        </FieldSceneStoreProvider>
      </FieldModeProvider>
    </ShellVariantProvider>
  );
}
