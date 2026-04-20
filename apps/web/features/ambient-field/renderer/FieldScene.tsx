"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
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
  DEFAULT_AMBIENT_FIELD_SCENE,
  visualPresets,
  type AmbientFieldSceneState,
} from "../scene/visual-presets";
import {
  FIELD_FRAGMENT_SHADER,
  FIELD_VERTEX_SHADER,
} from "./field-shaders";
import { getFieldPointTexture } from "./field-point-texture";
import { BlobController } from "../controller/BlobController";
import type { LayerUniforms } from "../controller/FieldController";

export type { AmbientFieldHotspotFrame } from "../controller/BlobController";

interface FieldSceneProps {
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
  densityScale?: number;
  onBlobControllerReady?: (controller: BlobController) => void;
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

// Landing-only FieldScene: renders the blob layer only. Stream + pcb
// controllers + presets stay exported from the module for other surfaces
// (Maze's per-section "one particle system per view" pattern —
// `scripts.pretty.js:43030-43045`). See
// `.claude/skills/ambient-field-modules/references/image-particle-conformation.md`
// for how to rehydrate them on a new section.
export function FieldScene({
  sceneStateRef,
  densityScale = 1,
  onBlobControllerReady,
}: FieldSceneProps) {
  const viewportWidth = useThree((state) => state.size.width);
  const isMobile = viewportWidth < AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT;
  const pointSources = useMemo(
    () =>
      resolveAmbientFieldPointSources({
        densityScale,
        isMobile,
        ids: ["blob"],
      }),
    [densityScale, isMobile],
  );
  const pointTexture = useMemo(() => getFieldPointTexture(), []);

  // Only the blob controller is instantiated on this surface.
  const blobController = useMemo(
    () => new BlobController({ id: "blob", preset: visualPresets.blob }),
    [],
  );

  // Blob uniforms. Rebuild when `isMobile` flips; `uColorNoise` is a
  // live Three.Color that BlobController tweens at runtime, so the
  // uniform identity must be stable inside each (isMobile) epoch.
  const layerUniformsRef = useRef<LayerUniforms>(
    blobController.createLayerUniforms(isMobile, pointTexture),
  );
  if (layerUniformsRef.current.uIsMobile.value !== isMobile) {
    layerUniformsRef.current = blobController.createLayerUniforms(
      isMobile,
      pointTexture,
    );
  }
  const layerUniforms = layerUniformsRef.current;

  useEffect(() => {
    blobController.setPointSource(pointSources.blob);
  }, [blobController, pointSources]);

  useEffect(() => {
    onBlobControllerReady?.(blobController);
  }, [blobController, onBlobControllerReady]);

  // Kill the controller's GSAP timelines (rainbow color cycle + scroll
  // timeline + ScrollTrigger) on unmount so re-mounts don't stack
  // listeners or tweens.
  useEffect(() => {
    return () => {
      blobController.destroy();
    };
  }, [blobController]);

  const wrapperRef = useRef<Group | null>(null);
  const mouseWrapperRef = useRef<Group | null>(null);
  const modelRef = useRef<Group | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);

  const tryAttachController = () => {
    const wrapper = wrapperRef.current;
    const mouseWrapper = mouseWrapperRef.current;
    const model = modelRef.current;
    const material = materialRef.current;
    if (!wrapper || !mouseWrapper || !model || !material) return;
    blobController.attach({
      view: null,
      wrapper,
      mouseWrapper,
      model,
      material,
    });
  };

  useFrame((state, delta) => {
    const sceneState = sceneStateRef.current ?? DEFAULT_AMBIENT_FIELD_SCENE;
    const elapsedSec = getAmbientFieldElapsedSeconds();
    const pixelRatio = Math.min(state.gl.getPixelRatio(), 2);
    const camera = state.camera;
    const viewportW = state.size.width;
    const viewportH = state.size.height;

    const blobSource = pointSources.blob;
    const blobState = sceneState.items.blob;
    blobController.tick({
      camera,
      dtSec: delta,
      elapsedSec,
      isMobile,
      itemState: blobState,
      pixelRatio,
      sceneState,
      sourceBounds: blobSource.bounds,
      uniforms: layerUniforms,
      viewportHeight: viewportH,
      viewportWidth: viewportW,
      wrapperInitialized: true,
      markWrapperInitialized: () => {},
    });

    blobController.projectHotspots(
      camera,
      viewportW,
      viewportH,
      elapsedSec,
      sceneState,
    );

    // Single RAF fan-out: after the blob's per-frame tick, pump the
    // subscriber bus so priority 40+ consumers (overlays, chrome) advance
    // in the same render tick.
    fieldLoopClock.tick(delta);
  });

  return (
    <AmbientFieldStageLayer
      source={pointSources.blob}
      onModelRef={(group) => {
        modelRef.current = group;
        tryAttachController();
      }}
      onMaterialRef={(material) => {
        materialRef.current = material;
        tryAttachController();
      }}
      onMouseWrapperRef={(group) => {
        mouseWrapperRef.current = group;
        tryAttachController();
      }}
      onWrapperRef={(group) => {
        wrapperRef.current = group;
        tryAttachController();
      }}
      uniforms={layerUniforms}
    />
  );
}
