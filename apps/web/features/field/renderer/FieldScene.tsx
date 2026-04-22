"use client";

import { useComputedColorScheme } from "@mantine/core";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  AdditiveBlending,
  Group,
  NormalBlending,
  ShaderMaterial,
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

interface FieldSceneProps {
  activeIds?: readonly FieldStageItemId[];
  densityScale?: number;
  onControllerReady?: (
    id: FieldStageItemId,
    controller: FieldController,
  ) => void;
  sceneStateRef: MutableRefObject<FieldSceneState>;
  stageReady?: boolean;
}

interface StageLayerHandle {
  material: MutableRefObject<ShaderMaterial | null>;
  model: MutableRefObject<Group | null>;
  mouseWrapper: MutableRefObject<Group | null>;
  wrapper: MutableRefObject<Group | null>;
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
          <points frustumCulled={false}>
            <bufferGeometry>
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

  const blobHandles: StageLayerHandle = {
    material: useRef<ShaderMaterial | null>(null),
    model: useRef<Group | null>(null),
    mouseWrapper: useRef<Group | null>(null),
    wrapper: useRef<Group | null>(null),
  };
  const streamHandles: StageLayerHandle = {
    material: useRef<ShaderMaterial | null>(null),
    model: useRef<Group | null>(null),
    mouseWrapper: useRef<Group | null>(null),
    wrapper: useRef<Group | null>(null),
  };
  const objectFormationHandles: StageLayerHandle = {
    material: useRef<ShaderMaterial | null>(null),
    model: useRef<Group | null>(null),
    mouseWrapper: useRef<Group | null>(null),
    wrapper: useRef<Group | null>(null),
  };

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

  useEffect(() => {
    return () => {
      blobController.destroy();
      streamController.destroy();
      objectFormationController.destroy();
    };
  }, [blobController, objectFormationController, streamController]);

  useEffect(() => {
    attachController(blobController, blobHandles);
  });

  useEffect(() => {
    attachController(streamController, streamHandles);
  });

  useEffect(() => {
    attachController(objectFormationController, objectFormationHandles);
  });

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
  });

  useFrame((state, delta) => {
    const sceneState = sceneStateRef.current ?? DEFAULT_FIELD_SCENE;
    const elapsedSec = getFieldElapsedSeconds();
    const pixelRatio = Math.min(state.gl.getPixelRatio(), 2);
    const camera = state.camera;
    const viewportW = state.gl.domElement.width;
    const viewportH = state.gl.domElement.height;

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
