"use client";

import { useComputedColorScheme } from "@mantine/core";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  BufferGeometry,
  Group,
  ShaderMaterial,
  type Camera,
  type Points,
} from "three";
import { FIELD_NON_DESKTOP_BREAKPOINT } from "../field-breakpoints";
import { BlobController as BlobControllerClass } from "../controller/BlobController";
import type { FieldController, LayerUniforms } from "../controller/FieldController";
import { ObjectFormationController } from "../controller/ObjectFormationController";
import { StreamController } from "../controller/StreamController";
import {
  DEFAULT_FIELD_SCENE,
  FIELD_STAGE_ITEM_IDS,
  visualPresets,
  type FieldSceneState,
  type FieldStageItemId,
} from "../scene/visual-presets";
import {
  fieldLoopClock,
  getFieldElapsedSeconds,
} from "./field-loop-clock";
import { resolveFieldPointSources } from "../asset/point-source-registry";
import type { FieldPointSource } from "../asset/point-source-types";
import { getFieldPointTexture } from "./field-point-texture";
import {
  FieldStageLayer,
  type StageLayerHandle,
} from "./FieldStageLayer";

export type { FieldHotspotFrame } from "../controller/BlobController";

interface FieldSceneProps {
  activeIds?: readonly FieldStageItemId[];
  cameraRef?: MutableRefObject<Camera | null>;
  densityScale?: number;
  onControllerReady?: (
    id: FieldStageItemId,
    controller: FieldController,
  ) => void;
  sceneStateRef: MutableRefObject<FieldSceneState>;
  stageReady?: boolean;
}

function syncLayerUniforms(
  controller: FieldController,
  isMobile: boolean,
  pointTexture: ReturnType<typeof getFieldPointTexture>,
  uniformsRef: MutableRefObject<LayerUniforms>,
) {
  if (uniformsRef.current.uIsMobile.value !== isMobile) {
    const scopeDimEnabled =
      uniformsRef.current.uScopeDimEnabled.value > 0.5;
    const lightMode = uniformsRef.current.uLightMode.value;
    uniformsRef.current = controller.createLayerUniforms(
      isMobile,
      pointTexture,
      lightMode,
      {
        initialAlpha: uniformsRef.current.uAlpha.value,
        scopeDimEnabled,
      },
    );
  }
  return uniformsRef.current;
}

function resolveInitialLayerAlpha(
  controller: FieldController,
  id: FieldStageItemId,
  isMobile: boolean,
  sceneState: FieldSceneState,
) {
  const shader = controller.params.shader;
  const shaderAlpha = isMobile
    ? shader.alphaMobile ?? shader.alpha
    : shader.alpha;
  const visibility =
    sceneState.items[id]?.visibility ??
    DEFAULT_FIELD_SCENE.items[id]?.visibility ??
    0;
  return shaderAlpha * visibility;
}

function attachController(
  controller: FieldController,
  handles: StageLayerHandle,
) {
  const wrapper = handles.wrapper.current;
  const mouseWrapper = handles.mouseWrapper.current;
  const model = handles.model.current;
  const material = handles.material.current;
  if (!wrapper || !mouseWrapper || !model || !material) return;
  if (
    controller.wrapper === wrapper &&
    controller.mouseWrapper === mouseWrapper &&
    controller.model === model &&
    controller.material === material
  ) {
    return;
  }
  controller.attach({
    material,
    model,
    mouseWrapper,
    view: null,
    wrapper,
  });
}

function ensureControllerReady({
  activeIdSet,
  controller,
  handles,
  id,
  onControllerReady,
  readyIds,
}: {
  activeIdSet: ReadonlySet<FieldStageItemId>;
  controller: FieldController;
  handles: StageLayerHandle;
  id: FieldStageItemId;
  onControllerReady?: (
    id: FieldStageItemId,
    controller: FieldController,
  ) => void;
  readyIds: Set<FieldStageItemId>;
}) {
  if (!activeIdSet.has(id)) return;
  if (
    !handles.wrapper.current ||
    !handles.mouseWrapper.current ||
    !handles.model.current ||
    !handles.material.current
  ) {
    return;
  }

  attachController(controller, handles);
  if (readyIds.has(id)) return;
  readyIds.add(id);
  onControllerReady?.(id, controller);
}

// Shared landing FieldScene: blob, stream, and object-formation layers all
// mount once. Visibility, carry windows, and chapter overlap are now owned
// by the FixedStageManager manifest and scroll binder rather than the page
// shell.
export function FieldScene({
  activeIds = FIELD_STAGE_ITEM_IDS,
  cameraRef,
  densityScale = 1,
  onControllerReady,
  sceneStateRef,
  stageReady = true,
}: FieldSceneProps) {
  const viewportWidth = useThree((state) => state.size.width);
  const isMobile = viewportWidth < FIELD_NON_DESKTOP_BREAKPOINT;
  const colorScheme = useComputedColorScheme("dark");
  const lightModeValue = colorScheme === "light" ? 1 : 0;
  const activeIdSet = useMemo(() => new Set(activeIds), [activeIds]);
  const pointSources = useMemo(
    () =>
      resolveFieldPointSources({
        densityScale,
        ids: activeIds,
        isMobile,
      }),
    [activeIds, densityScale, isMobile],
  );
  const pointTexture = useMemo(() => getFieldPointTexture(), []);
  const readyIdsRef = useRef<Set<FieldStageItemId>>(new Set());

  const blobController = useMemo(
    () => new BlobControllerClass({ id: "blob", preset: visualPresets.blob }),
    [],
  );
  const streamController = useMemo(
    () => new StreamController({ id: "stream", preset: visualPresets.stream }),
    [],
  );
  const objectFormationController = useMemo(
    () =>
      new ObjectFormationController({
        id: "objectFormation",
        preset: visualPresets.objectFormation,
      }),
    [],
  );

  const blobUniformsRef = useRef<LayerUniforms>(
    // Slice 8: only blob honors scope dim. Stream / objectFormation
    // are ambient layers — they reference the same particle-state
    // texture (singleton) but skip the sampler read via uScopeDimEnabled=0.
    blobController.createLayerUniforms(isMobile, pointTexture, lightModeValue, {
      initialAlpha: resolveInitialLayerAlpha(
        blobController,
        "blob",
        isMobile,
        sceneStateRef.current,
      ),
      scopeDimEnabled: true,
    }),
  );
  const streamUniformsRef = useRef<LayerUniforms>(
    streamController.createLayerUniforms(isMobile, pointTexture, lightModeValue, {
      initialAlpha: resolveInitialLayerAlpha(
        streamController,
        "stream",
        isMobile,
        sceneStateRef.current,
      ),
    }),
  );
  const objectFormationUniformsRef = useRef<LayerUniforms>(
    objectFormationController.createLayerUniforms(
      isMobile,
      pointTexture,
      lightModeValue,
      {
        initialAlpha: resolveInitialLayerAlpha(
          objectFormationController,
          "objectFormation",
          isMobile,
          sceneStateRef.current,
        ),
      },
    ),
  );

  const blobUniforms = syncLayerUniforms(
    blobController,
    isMobile,
    pointTexture,
    blobUniformsRef,
  );
  const streamUniforms = syncLayerUniforms(
    streamController,
    isMobile,
    pointTexture,
    streamUniformsRef,
  );
  const objectFormationUniforms = syncLayerUniforms(
    objectFormationController,
    isMobile,
    pointTexture,
    objectFormationUniformsRef,
  );

  // Hoist the per-layer ref bundles into useMemo so the handle OBJECT
  // itself is referentially stable across renders (the individual refs
  // already are). This lets downstream useEffects list handles in their
  // dep arrays without re-running every commit, which was the original
  // audit finding C2.
  const blobMaterialRef = useRef<ShaderMaterial | null>(null);
  const blobModelRef = useRef<Group | null>(null);
  const blobMouseWrapperRef = useRef<Group | null>(null);
  const blobWrapperRef = useRef<Group | null>(null);
  const blobGeometryRef = useRef<BufferGeometry | null>(null);
  const blobPointsRef = useRef<Points | null>(null);
  const streamMaterialRef = useRef<ShaderMaterial | null>(null);
  const streamModelRef = useRef<Group | null>(null);
  const streamMouseWrapperRef = useRef<Group | null>(null);
  const streamWrapperRef = useRef<Group | null>(null);
  const streamGeometryRef = useRef<BufferGeometry | null>(null);
  const streamPointsRef = useRef<Points | null>(null);
  const objectFormationMaterialRef = useRef<ShaderMaterial | null>(null);
  const objectFormationModelRef = useRef<Group | null>(null);
  const objectFormationMouseWrapperRef = useRef<Group | null>(null);
  const objectFormationWrapperRef = useRef<Group | null>(null);
  const objectFormationGeometryRef = useRef<BufferGeometry | null>(null);
  const objectFormationPointsRef = useRef<Points | null>(null);

  const blobHandles = useMemo<StageLayerHandle>(
    () => ({
      material: blobMaterialRef,
      model: blobModelRef,
      mouseWrapper: blobMouseWrapperRef,
      wrapper: blobWrapperRef,
      geometry: blobGeometryRef,
      points: blobPointsRef,
    }),
    [],
  );
  const streamHandles = useMemo<StageLayerHandle>(
    () => ({
      material: streamMaterialRef,
      model: streamModelRef,
      mouseWrapper: streamMouseWrapperRef,
      wrapper: streamWrapperRef,
      geometry: streamGeometryRef,
      points: streamPointsRef,
    }),
    [],
  );
  const objectFormationHandles = useMemo<StageLayerHandle>(
    () => ({
      material: objectFormationMaterialRef,
      model: objectFormationModelRef,
      mouseWrapper: objectFormationMouseWrapperRef,
      wrapper: objectFormationWrapperRef,
      geometry: objectFormationGeometryRef,
      points: objectFormationPointsRef,
    }),
    [],
  );

  const controllerRegistrations = useMemo<
    Array<{
      controller: FieldController;
      handles: StageLayerHandle;
      id: FieldStageItemId;
    }>
  >(
    () => [
      { controller: blobController, handles: blobHandles, id: "blob" },
      { controller: streamController, handles: streamHandles, id: "stream" },
      {
        controller: objectFormationController,
        handles: objectFormationHandles,
        id: "objectFormation",
      },
    ],
    [
      blobController,
      blobHandles,
      objectFormationController,
      objectFormationHandles,
      streamController,
      streamHandles,
    ],
  );

  useEffect(() => {
    if (activeIdSet.has("blob") && pointSources.blob) {
      blobController.setPointSource(pointSources.blob);
    }
  }, [activeIdSet, blobController, pointSources]);

  // Mutate uLightMode in place on theme toggle. Recreating the uniforms
  // object would reset the BlobController rainbow tween on uColorNoise.
  useEffect(() => {
    blobUniformsRef.current.uLightMode.value = lightModeValue;
    streamUniformsRef.current.uLightMode.value = lightModeValue;
    objectFormationUniformsRef.current.uLightMode.value = lightModeValue;
  }, [lightModeValue]);

  // Unmount-only GPU cleanup. Controller.destroy() kills GSAP tweens but
  // does not dispose the ShaderMaterial refs owned by this component. R3F
  // auto-disposes geometries/attributes declared as JSX children, but the
  // material refs we hold explicitly must be disposed here. The
  // pointTexture is module-cached (shared across instances) and must NOT
  // be disposed. dispose() is idempotent so double-calls under StrictMode
  // are safe.
  useEffect(() => {
    // Capture refs at effect time so cleanup closure doesn't chase stale
    // values if the parent remounts.
    const materialRefs = [
      blobHandles.material,
      streamHandles.material,
      objectFormationHandles.material,
    ];
    return () => {
      blobController.destroy();
      streamController.destroy();
      objectFormationController.destroy();
      for (const ref of materialRefs) {
        const material = ref.current;
        if (material && typeof material.dispose === "function") {
          material.dispose();
        }
        ref.current = null;
      }
    };
  }, [
    blobController,
    blobHandles,
    objectFormationController,
    objectFormationHandles,
    streamController,
    streamHandles,
  ]);

  // Reconcile the R3F refs after commit. The frame-loop below repeats the
  // same idempotent check so controller ownership recovers if a layer ref
  // appears after React effects have already run.
  useEffect(() => {
    for (const registration of controllerRegistrations) {
      ensureControllerReady({
        activeIdSet,
        controller: registration.controller,
        handles: registration.handles,
        id: registration.id,
        onControllerReady,
        readyIds: readyIdsRef.current,
      });
    }
  }, [
    activeIdSet,
    controllerRegistrations,
    onControllerReady,
  ]);

  useFrame((state, delta) => {
    for (const registration of controllerRegistrations) {
      ensureControllerReady({
        activeIdSet,
        controller: registration.controller,
        handles: registration.handles,
        id: registration.id,
        onControllerReady,
        readyIds: readyIdsRef.current,
      });
    }

    const camera = state.camera;

    // Publish the live R3F camera to the optional cameraRef so stage-level
    // DOM overlays can call projectPointSourceVertex without owning the
    // camera themselves.
    if (cameraRef) cameraRef.current = camera;

    // Pre-ready frames must not advance or START the field clock: the
    // module epoch is set by the first getFieldElapsedSeconds() call, so
    // deferring that call until stageReady makes elapsedSec begin at 0 on
    // the first ticked frame. BlobController's sphere-formation intro and
    // the absolute wrapper rotation read this clock — starting it during
    // the loading window silently consumes the intro (INTRO_DURATION is
    // shorter than a cold chunk load). Layers cannot paint in this window
    // either: wrappers mount visible={false} until their controller ticks.
    if (!stageReady) return;

    const sceneState = sceneStateRef.current ?? DEFAULT_FIELD_SCENE;
    const elapsedSec = getFieldElapsedSeconds();
    const pixelRatio = Math.min(state.gl.getPixelRatio(), 2);
    const viewportW = state.gl.domElement.width;
    const viewportH = state.gl.domElement.height;

    const layers = [
      activeIdSet.has("blob") && pointSources.blob
        ? {
            controller: blobController,
            itemState: sceneState.items.blob,
            source: pointSources.blob,
            uniforms: blobUniforms,
          }
        : null,
      activeIdSet.has("stream") && pointSources.stream
        ? {
            controller: streamController,
            itemState: sceneState.items.stream,
            source: pointSources.stream,
            uniforms: streamUniforms,
          }
        : null,
      activeIdSet.has("objectFormation") && pointSources.objectFormation
        ? {
            controller: objectFormationController,
            itemState: sceneState.items.objectFormation,
            source: pointSources.objectFormation,
            uniforms: objectFormationUniforms,
          }
        : null,
    ].filter(Boolean) as Array<{
      controller: FieldController;
      itemState: FieldSceneState["items"][FieldStageItemId];
      source: FieldPointSource;
      uniforms: LayerUniforms;
    }>;

    for (const layer of layers) {
      layer.controller.tick({
        camera,
        dtSec: delta,
        elapsedSec,
        isMobile,
        itemState: layer.itemState,
        pixelRatio,
        sceneState,
        sourceBounds: layer.source.bounds,
        uniforms: layer.uniforms,
        viewportHeight: viewportH,
        viewportWidth: viewportW,
        wrapperInitialized: true,
        markWrapperInitialized: () => {},
      });
    }

    if (activeIdSet.has("blob")) {
      blobController.projectHotspots(
        camera,
        viewportW,
        viewportH,
        elapsedSec,
        sceneState,
        pixelRatio,
      );
    }

    fieldLoopClock.tick(delta);
  });

  return (
    <>
      {activeIdSet.has("blob") && pointSources.blob ? (
        <FieldStageLayer
          handles={blobHandles}
          source={pointSources.blob}
          uniforms={blobUniforms}
        />
      ) : null}
      {activeIdSet.has("stream") && pointSources.stream ? (
        <FieldStageLayer
          handles={streamHandles}
          source={pointSources.stream}
          uniforms={streamUniforms}
        />
      ) : null}
      {activeIdSet.has("objectFormation") && pointSources.objectFormation ? (
        <FieldStageLayer
          handles={objectFormationHandles}
          source={pointSources.objectFormation}
          uniforms={objectFormationUniforms}
        />
      ) : null}
    </>
  );
}
