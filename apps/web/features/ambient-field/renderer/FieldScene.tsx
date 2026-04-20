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
import {
  fieldLoopClock,
  getAmbientFieldElapsedSeconds,
} from "./field-loop-clock";
import { resolveAmbientFieldPointSources } from "../asset/point-source-registry";
import type { AmbientFieldPointSource } from "../asset/point-source-types";
import {
  AMBIENT_FIELD_STAGE_ITEM_IDS,
  DEFAULT_AMBIENT_FIELD_SCENE,
  visualPresets,
  type AmbientFieldSceneState,
  type AmbientFieldStageItemId,
} from "../scene/visual-presets";
import {
  FIELD_FRAGMENT_SHADER,
  FIELD_VERTEX_SHADER,
} from "./field-shaders";
import { getFieldPointTexture } from "./field-point-texture";
import { BlobController } from "../controller/BlobController";
import { StreamController } from "../controller/StreamController";
import { PcbController } from "../controller/PcbController";
import type { FieldController, LayerUniforms } from "../controller/FieldController";

export type { AmbientFieldHotspotFrame } from "../controller/BlobController";

interface FieldSceneProps {
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
  densityScale?: number;
  onBlobControllerReady?: (controller: BlobController) => void;
  onStreamControllerReady?: (controller: StreamController) => void;
  onPcbControllerReady?: (controller: PcbController) => void;
}

const stageItemIds = AMBIENT_FIELD_STAGE_ITEM_IDS;

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
  onModelRef,
  onMaterialRef,
  onMouseWrapperRef,
  onWrapperRef,
  source,
  uniforms,
}: {
  onModelRef: (group: Group | null) => void;
  onMaterialRef: (material: ShaderMaterial | null) => void;
  onMouseWrapperRef: (group: Group | null) => void;
  onWrapperRef: (group: Group | null) => void;
  source: AmbientFieldPointSource;
  uniforms: LayerUniforms;
}) {
  const { buffers } = source;

  return (
    <group ref={onWrapperRef} position={[0, 0, 0]} scale={[1, 1, 1]}>
      <group ref={onMouseWrapperRef}>
        <group ref={onModelRef}>
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
              ref={onMaterialRef}
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

export function FieldScene({
  sceneStateRef,
  densityScale = 1,
  onBlobControllerReady,
  onStreamControllerReady,
  onPcbControllerReady,
}: FieldSceneProps) {
  const viewportWidth = useThree((state) => state.size.width);
  const isMobile = viewportWidth < AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT;
  const pointSources = useMemo(
    () => resolveAmbientFieldPointSources({ densityScale, isMobile }),
    [densityScale, isMobile],
  );
  const pointTexture = useMemo(() => getFieldPointTexture(), []);

  // Controllers are stable for the lifetime of FieldScene; swapping
  // presets is not supported yet.
  const controllers = useMemo(() => {
    const blob = new BlobController({ id: "blob", preset: visualPresets.blob });
    const stream = new StreamController({ id: "stream", preset: visualPresets.stream });
    const pcb = new PcbController({ id: "pcb", preset: visualPresets.pcb });
    return { blob, stream, pcb } as const;
  }, []);

  // Layer uniforms: one bag per controller. Rebuild only when isMobile
  // flips, since bucket arrays + pointTexture bindings re-initialize.
  const layerUniformsRef = useRef<Record<AmbientFieldStageItemId, LayerUniforms>>({
    blob: controllers.blob.createLayerUniforms(isMobile, pointTexture),
    stream: controllers.stream.createLayerUniforms(isMobile, pointTexture),
    pcb: controllers.pcb.createLayerUniforms(isMobile, pointTexture),
  });
  if (layerUniformsRef.current.blob.uIsMobile.value !== isMobile) {
    layerUniformsRef.current = {
      blob: controllers.blob.createLayerUniforms(isMobile, pointTexture),
      stream: controllers.stream.createLayerUniforms(isMobile, pointTexture),
      pcb: controllers.pcb.createLayerUniforms(isMobile, pointTexture),
    };
  }
  const layerUniforms = layerUniformsRef.current;

  // Point sources feed BlobController's hotspot projection.
  useEffect(() => {
    controllers.blob.setPointSource(pointSources.blob);
  }, [controllers, pointSources]);

  // Hand controllers out so surfaces can wire hotspot refs, bind scroll
  // timelines, and subscribe to frame updates via the loop clock.
  useEffect(() => {
    onBlobControllerReady?.(controllers.blob);
  }, [controllers, onBlobControllerReady]);
  useEffect(() => {
    onStreamControllerReady?.(controllers.stream);
  }, [controllers, onStreamControllerReady]);
  useEffect(() => {
    onPcbControllerReady?.(controllers.pcb);
  }, [controllers, onPcbControllerReady]);

  const stageWrapperRefs = useRef<Record<AmbientFieldStageItemId, Group | null>>({
    blob: null,
    stream: null,
    pcb: null,
  });
  const stageModelRefs = useRef<Record<AmbientFieldStageItemId, Group | null>>({
    blob: null,
    stream: null,
    pcb: null,
  });
  const stageMouseWrapperRefs = useRef<Record<AmbientFieldStageItemId, Group | null>>({
    blob: null,
    stream: null,
    pcb: null,
  });
  const stageMaterialRefs = useRef<Record<AmbientFieldStageItemId, ShaderMaterial | null>>({
    blob: null,
    stream: null,
    pcb: null,
  });

  const tryAttachController = (itemId: AmbientFieldStageItemId) => {
    const wrapper = stageWrapperRefs.current[itemId];
    const mouseWrapper = stageMouseWrapperRefs.current[itemId];
    const model = stageModelRefs.current[itemId];
    const material = stageMaterialRefs.current[itemId];
    if (!wrapper || !mouseWrapper || !model || !material) return;
    const controller = controllers[itemId] as FieldController;
    controller.attach({ view: null, wrapper, mouseWrapper, model, material });
  };

  useFrame((state, delta) => {
    const sceneState = sceneStateRef.current ?? DEFAULT_AMBIENT_FIELD_SCENE;
    const elapsedSec = getAmbientFieldElapsedSeconds();
    const pixelRatio = Math.min(state.gl.getPixelRatio(), 2);
    const camera = state.camera;
    const viewportW = state.size.width;
    const viewportH = state.size.height;

    for (const itemId of stageItemIds) {
      const controller = controllers[itemId] as FieldController;
      const uniforms = layerUniforms[itemId];
      const pointSource = pointSources[itemId];
      const itemState = sceneState.items[itemId];
      controller.tick({
        camera,
        dtSec: delta,
        elapsedSec,
        isMobile,
        itemState,
        pixelRatio,
        sceneState,
        sourceBounds: pointSource.bounds,
        uniforms,
        viewportHeight: viewportH,
        viewportWidth: viewportW,
        wrapperInitialized: true,
        markWrapperInitialized: () => {},
      });
    }

    // Project hotspots once per frame; BlobController writes transform +
    // opacity directly onto the static DOM pool via its attached refs.
    controllers.blob.projectHotspots(
      camera,
      viewportW,
      viewportH,
      elapsedSec,
      sceneState,
    );

    // Single RAF fan-out: after FieldScene's own per-layer tick runs, pump
    // the subscriber bus so priority 40+ consumers (overlays, surface
    // chrome) advance in the same render tick.
    fieldLoopClock.tick(delta);
  });

  return (
    <>
      {stageItemIds.map((itemId) => (
        <AmbientFieldStageLayer
          key={itemId}
          source={pointSources[itemId]}
          onModelRef={(group) => {
            stageModelRefs.current[itemId] = group;
            tryAttachController(itemId);
          }}
          onMaterialRef={(material) => {
            stageMaterialRefs.current[itemId] = material;
            tryAttachController(itemId);
          }}
          onMouseWrapperRef={(group) => {
            stageMouseWrapperRefs.current[itemId] = group;
            tryAttachController(itemId);
          }}
          onWrapperRef={(group) => {
            stageWrapperRefs.current[itemId] = group;
            tryAttachController(itemId);
          }}
          uniforms={layerUniforms[itemId]}
        />
      ))}
    </>
  );
}
