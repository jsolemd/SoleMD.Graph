"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  AdditiveBlending,
  Group,
  NormalBlending,
  ShaderMaterial,
} from "three";
import { AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT } from "../ambient-field-breakpoints";
import type { BlobController } from "../controller/BlobController";
import { BlobController as BlobControllerClass } from "../controller/BlobController";
import type { FieldController, LayerUniforms } from "../controller/FieldController";
import { PcbController } from "../controller/PcbController";
import { StreamController } from "../controller/StreamController";
import {
  DEFAULT_AMBIENT_FIELD_SCENE,
  AMBIENT_FIELD_STAGE_ITEM_IDS,
  visualPresets,
  type AmbientFieldSceneState,
  type AmbientFieldStageItemId,
} from "../scene/visual-presets";
import {
  fieldLoopClock,
  getAmbientFieldElapsedSeconds,
} from "./field-loop-clock";
import {
  resolveAmbientFieldPointSources,
} from "../asset/point-source-registry";
import type { AmbientFieldPointSource } from "../asset/point-source-types";
import {
  FIELD_FRAGMENT_SHADER,
  FIELD_VERTEX_SHADER,
} from "./field-shaders";
import { getFieldPointTexture } from "./field-point-texture";

export type { AmbientFieldHotspotFrame } from "../controller/BlobController";

interface FieldSceneProps {
  densityScale?: number;
  onBlobControllerReady?: (controller: BlobController) => void;
  onControllerReady?: (
    id: AmbientFieldStageItemId,
    controller: FieldController,
  ) => void;
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
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

function AmbientFieldStageLayer({
  handles,
  source,
  uniforms,
}: {
  handles: StageLayerHandle;
  source: AmbientFieldPointSource;
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

// Shared landing FieldScene: blob, stream, and pcb layers all mount once.
// Visibility, carry windows, and chapter overlap are now owned by the
// FixedStageManager manifest and scroll binder rather than the page shell.
export function FieldScene({
  densityScale = 1,
  onBlobControllerReady,
  onControllerReady,
  sceneStateRef,
  stageReady = true,
}: FieldSceneProps) {
  const viewportWidth = useThree((state) => state.size.width);
  const isMobile = viewportWidth < AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT;
  const pointSources = useMemo(
    () =>
      resolveAmbientFieldPointSources({
        densityScale,
        ids: AMBIENT_FIELD_STAGE_ITEM_IDS,
        isMobile,
      }),
    [densityScale, isMobile],
  );
  const pointTexture = useMemo(() => getFieldPointTexture(), []);

  const blobController = useMemo(
    () => new BlobControllerClass({ id: "blob", preset: visualPresets.blob }),
    [],
  );
  const streamController = useMemo(
    () => new StreamController({ id: "stream", preset: visualPresets.stream }),
    [],
  );
  const pcbController = useMemo(
    () => new PcbController({ id: "pcb", preset: visualPresets.pcb }),
    [],
  );

  const blobUniformsRef = useRef<LayerUniforms>(
    blobController.createLayerUniforms(isMobile, pointTexture),
  );
  const streamUniformsRef = useRef<LayerUniforms>(
    streamController.createLayerUniforms(isMobile, pointTexture),
  );
  const pcbUniformsRef = useRef<LayerUniforms>(
    pcbController.createLayerUniforms(isMobile, pointTexture),
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
  const pcbUniforms = syncLayerUniforms(
    pcbController,
    isMobile,
    pointTexture,
    pcbUniformsRef,
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
  const pcbHandles: StageLayerHandle = {
    material: useRef<ShaderMaterial | null>(null),
    model: useRef<Group | null>(null),
    mouseWrapper: useRef<Group | null>(null),
    wrapper: useRef<Group | null>(null),
  };

  useEffect(() => {
    blobController.setPointSource(pointSources.blob);
  }, [blobController, pointSources]);

  useEffect(() => {
    onBlobControllerReady?.(blobController);
    onControllerReady?.("blob", blobController);
    onControllerReady?.("stream", streamController);
    onControllerReady?.("pcb", pcbController);
  }, [
    blobController,
    onBlobControllerReady,
    onControllerReady,
    pcbController,
    streamController,
  ]);

  useEffect(() => {
    return () => {
      blobController.destroy();
      streamController.destroy();
      pcbController.destroy();
    };
  }, [blobController, pcbController, streamController]);

  useEffect(() => {
    attachController(blobController, blobHandles);
  });

  useEffect(() => {
    attachController(streamController, streamHandles);
  });

  useEffect(() => {
    attachController(pcbController, pcbHandles);
  });

  useFrame((state, delta) => {
    const sceneState = sceneStateRef.current ?? DEFAULT_AMBIENT_FIELD_SCENE;
    const elapsedSec = getAmbientFieldElapsedSeconds();
    const pixelRatio = Math.min(state.gl.getPixelRatio(), 2);
    const camera = state.camera;
    const viewportW = state.gl.domElement.width;
    const viewportH = state.gl.domElement.height;

    if (!stageReady) {
      fieldLoopClock.tick(delta);
      return;
    }

    const layers = [
      {
        controller: blobController,
        itemState: sceneState.items.blob,
        source: pointSources.blob,
        uniforms: blobUniforms,
      },
      {
        controller: streamController,
        itemState: sceneState.items.stream,
        source: pointSources.stream,
        uniforms: streamUniforms,
      },
      {
        controller: pcbController,
        itemState: sceneState.items.pcb,
        source: pointSources.pcb,
        uniforms: pcbUniforms,
      },
    ] as const;

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

    blobController.projectHotspots(
      camera,
      viewportW,
      viewportH,
      elapsedSec,
      sceneState,
      pixelRatio,
    );

    fieldLoopClock.tick(delta);
  });

  return (
    <>
      <AmbientFieldStageLayer
        handles={blobHandles}
        source={pointSources.blob}
        uniforms={blobUniforms}
      />
      <AmbientFieldStageLayer
        handles={streamHandles}
        source={pointSources.stream}
        uniforms={streamUniforms}
      />
      <AmbientFieldStageLayer
        handles={pcbHandles}
        source={pointSources.pcb}
        uniforms={pcbUniforms}
      />
    </>
  );
}
