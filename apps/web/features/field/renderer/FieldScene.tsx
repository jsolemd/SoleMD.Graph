"use client";

import { useComputedColorScheme } from "@mantine/core";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Group,
  NormalBlending,
  ShaderMaterial,
  type Camera,
  type Points,
  type Scene,
  type WebGLRenderer,
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
import {
  FIELD_FRAGMENT_SHADER,
  FIELD_VERTEX_SHADER,
} from "./field-shaders";
import { getFieldPointTexture } from "./field-point-texture";

export type { FieldHotspotFrame } from "../controller/BlobController";

/**
 * Out-of-tree subscriber for the blob layer's BufferGeometry.
 *
 * FieldScene calls this once the blob geometry has been attached to the
 * scene graph, passing (geometry, invalidate). The callback installs
 * whatever subscription it wants — e.g. an orb-mode paper-mutation store
 * — and returns a disposer run on scene unmount or prop-change.
 *
 * The callback is opaque from FieldScene's perspective: this is the
 * substrate→feature boundary. Renderer code stays unaware of orb.
 */
export type BlobGeometrySubscriber = (args: {
  geometry: BufferGeometry;
  invalidate: () => void;
}) => () => void;

/**
 * Out-of-tree subscriber for the blob layer's THREE.Points handle +
 * the R3F renderer + scene + camera.
 *
 * Passed to FieldScene by orb mode so the picker can render the blob's
 * geometry against the same shader uniforms as the display pass. The
 * subscriber is responsible for enabling the blob's picking layer
 * (typically `points.layers.enable(1)`) and publishing a pickSync
 * handle; cleanup disables the layer and retracts the handle.
 */
export type BlobPointsSubscriber = (args: {
  points: Points;
  material: ShaderMaterial;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  invalidate: () => void;
}) => () => void;

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
  /**
   * Optional blob-geometry subscriber. When provided, FieldScene installs
   * it once the blob layer's BufferGeometry is attached and tears it
   * down on unmount. Used by orb mode to stream paper-attribute chunks
   * into the same 16384-particle buffer.
   */
  blobGeometrySubscriber?: BlobGeometrySubscriber;
  /**
   * Optional blob-points subscriber. When provided, FieldScene installs
   * it once the blob THREE.Points handle is attached. Used by orb mode
   * to wire GPU picking against the live renderer/scene/camera — the
   * subscriber enables a layer mask bit on blob so the picker can
   * exclude stream/objectFormation from the picking pass.
   */
  blobPointsSubscriber?: BlobPointsSubscriber;
}

interface StageLayerHandle {
  material: MutableRefObject<ShaderMaterial | null>;
  model: MutableRefObject<Group | null>;
  mouseWrapper: MutableRefObject<Group | null>;
  wrapper: MutableRefObject<Group | null>;
  geometry: MutableRefObject<BufferGeometry | null>;
  points: MutableRefObject<Points | null>;
}

// Maze parity toggle: source exposes `?blending` to swap AdditiveBlending
// for debug. SoleMD mirrors as `?field-blending=additive`.
function resolveFieldBlending() {
  if (typeof window === "undefined") return NormalBlending;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("field-blending") === "additive"
      ? AdditiveBlending
      : NormalBlending;
  } catch {
    return NormalBlending;
  }
}

function FieldStageLayer({
  handles,
  source,
  uniforms,
}: {
  handles: StageLayerHandle;
  source: FieldPointSource;
  uniforms: LayerUniforms;
}) {
  const { buffers } = source;

  return (
    <group ref={handles.wrapper} position={[0, 0, 0]} scale={[1, 1, 1]}>
      <group ref={handles.mouseWrapper}>
        <group ref={handles.model}>
          <points ref={handles.points} frustumCulled={false}>
            <bufferGeometry ref={handles.geometry}>
              <bufferAttribute attach="attributes-position" args={[buffers.position, 3]} />
              <bufferAttribute attach="attributes-aMove" args={[buffers.aMove, 3]} />
              <bufferAttribute attach="attributes-aSpeed" args={[buffers.aSpeed, 3]} />
              <bufferAttribute attach="attributes-aRandomness" args={[buffers.aRandomness, 3]} />
              <bufferAttribute attach="attributes-aIndex" args={[buffers.aIndex, 1]} />
              <bufferAttribute attach="attributes-aAlpha" args={[buffers.aAlpha, 1]} />
              <bufferAttribute attach="attributes-aSelection" args={[buffers.aSelection, 1]} />
              <bufferAttribute attach="attributes-aStreamFreq" args={[buffers.aStreamFreq, 1]} />
              <bufferAttribute attach="attributes-aFunnelNarrow" args={[buffers.aFunnelNarrow, 1]} />
              <bufferAttribute attach="attributes-aFunnelThickness" args={[buffers.aFunnelThickness, 1]} />
              <bufferAttribute attach="attributes-aFunnelStartShift" args={[buffers.aFunnelStartShift, 1]} />
              <bufferAttribute attach="attributes-aFunnelEndShift" args={[buffers.aFunnelEndShift, 1]} />
              <bufferAttribute attach="attributes-aBucket" args={[buffers.aBucket, 1]} />
              <bufferAttribute attach="attributes-aClickPack" args={[buffers.aClickPack, 4]} />
            </bufferGeometry>
            <shaderMaterial
              ref={handles.material}
              transparent
              depthTest={false}
              depthWrite={false}
              blending={resolveFieldBlending()}
              uniforms={uniforms}
              vertexShader={FIELD_VERTEX_SHADER}
              fragmentShader={FIELD_FRAGMENT_SHADER}
            />
          </points>
        </group>
      </group>
    </group>
  );
}

function syncLayerUniforms(
  controller: FieldController,
  isMobile: boolean,
  pointTexture: ReturnType<typeof getFieldPointTexture>,
  uniformsRef: MutableRefObject<LayerUniforms>,
) {
  if (uniformsRef.current.uIsMobile.value !== isMobile) {
    uniformsRef.current = controller.createLayerUniforms(isMobile, pointTexture);
  }
  return uniformsRef.current;
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
  wrapper.visible = false;
  controller.attach({
    material,
    model,
    mouseWrapper,
    view: null,
    wrapper,
  });
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
  blobGeometrySubscriber,
  blobPointsSubscriber,
}: FieldSceneProps) {
  const viewportWidth = useThree((state) => state.size.width);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
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
    blobController.createLayerUniforms(isMobile, pointTexture, lightModeValue),
  );
  const streamUniformsRef = useRef<LayerUniforms>(
    streamController.createLayerUniforms(isMobile, pointTexture, lightModeValue),
  );
  const objectFormationUniformsRef = useRef<LayerUniforms>(
    objectFormationController.createLayerUniforms(isMobile, pointTexture, lightModeValue),
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
        ref.current?.dispose();
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

  // Attach controllers whenever their layer becomes visible. The attach
  // call is idempotent in practice (it writes handle refs into the
  // controller), but gating on activeIdSet avoids running during renders
  // where the refs aren't populated yet because the JSX is unmounted.
  useEffect(() => {
    if (activeIdSet.has("blob")) {
      attachController(blobController, blobHandles);
    }
    if (activeIdSet.has("stream")) {
      attachController(streamController, streamHandles);
    }
    if (activeIdSet.has("objectFormation")) {
      attachController(objectFormationController, objectFormationHandles);
    }
  }, [
    activeIdSet,
    blobController,
    blobHandles,
    objectFormationController,
    objectFormationHandles,
    streamController,
    streamHandles,
  ]);

  useEffect(() => {
    const registrations: Array<[FieldStageItemId, FieldController, StageLayerHandle]> = [
      ["blob", blobController, blobHandles],
      ["stream", streamController, streamHandles],
      [
        "objectFormation",
        objectFormationController,
        objectFormationHandles,
      ],
    ];

    registrations.forEach(([id, controller, handles]) => {
      if (!activeIdSet.has(id)) return;
      if (readyIdsRef.current.has(id)) return;
      if (
        !handles.wrapper.current ||
        !handles.mouseWrapper.current ||
        !handles.model.current ||
        !handles.material.current
      ) {
        return;
      }
      readyIdsRef.current.add(id);
      onControllerReady?.(id, controller);
    });
  }, [
    activeIdSet,
    blobController,
    blobHandles,
    objectFormationController,
    objectFormationHandles,
    onControllerReady,
    streamController,
    streamHandles,
  ]);

  // Install the blob-geometry subscriber once blob is mounted AND the
  // subscriber prop is present (orb mode). Renderer stays agnostic about
  // what the subscriber does; it hands over (geometry, invalidate) and
  // tears down on unmount or prop change. With `frameloop="demand"`, the
  // subscriber MUST call `invalidate()` after mutating buffer attrs for
  // the GPU to observe the change — that's the contract.
  //
  // Effect keys on `pointSources.blob` so it reinstalls whenever the
  // blob layer's source (which owns the geometry attributes) is rebuilt.
  useEffect(() => {
    if (!blobGeometrySubscriber) return;
    if (!activeIdSet.has("blob")) return;
    if (!pointSources.blob) return;
    const geometry = blobHandles.geometry.current;
    if (!geometry) return;
    const dispose = blobGeometrySubscriber({ geometry, invalidate });
    return () => {
      dispose();
    };
  }, [
    activeIdSet,
    blobGeometrySubscriber,
    blobHandles,
    invalidate,
    pointSources.blob,
  ]);

  // Install the blob-points subscriber (orb-mode GPU picking). The
  // subscriber receives the blob THREE.Points + its ShaderMaterial + the
  // R3F renderer/scene/camera, publishes a pickSync handle to the orb
  // store, and enables a layers bit on blob so the picker can exclude
  // stream/objectFormation from the picking pass. Cleanup retracts the
  // handle (identity-guarded) and disables the layer bit.
  useEffect(() => {
    if (!blobPointsSubscriber) return;
    if (!activeIdSet.has("blob")) return;
    if (!pointSources.blob) return;
    const points = blobHandles.points.current;
    const material = blobHandles.material.current;
    if (!points || !material) return;
    const dispose = blobPointsSubscriber({
      points,
      material,
      renderer: gl,
      scene,
      camera,
      invalidate,
    });
    return () => {
      dispose();
    };
  }, [
    activeIdSet,
    blobHandles,
    blobPointsSubscriber,
    camera,
    gl,
    invalidate,
    pointSources.blob,
    scene,
  ]);

  useFrame((state, delta) => {
    const sceneState = sceneStateRef.current ?? DEFAULT_FIELD_SCENE;
    const elapsedSec = getFieldElapsedSeconds();
    const pixelRatio = Math.min(state.gl.getPixelRatio(), 2);
    const camera = state.camera;
    const viewportW = state.gl.domElement.width;
    const viewportH = state.gl.domElement.height;

    // Publish the live R3F camera to the optional cameraRef so stage-level
    // DOM overlays can call projectPointSourceVertex without owning the
    // camera themselves.
    if (cameraRef) cameraRef.current = camera;

    if (!stageReady) {
      fieldLoopClock.tick(delta);
      return;
    }

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
