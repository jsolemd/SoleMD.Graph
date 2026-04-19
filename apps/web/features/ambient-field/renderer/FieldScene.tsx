"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import {
  Texture,
  Color,
  Group,
  NormalBlending,
  ShaderMaterial,
} from "three";
import { DECAY, lerpFactor } from "@/lib/motion3d";
import { AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT } from "../ambient-field-breakpoints";
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

interface FieldSceneProps {
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
  densityScale?: number;
  onFrame?: (timestamp: number) => void;
}

interface LayerUniforms {
  [uniform: string]: { value: unknown };
  pointTexture: { value: Texture };
  uAlpha: { value: number };
  uAmplitude: { value: number };
  uColorBase: { value: Color };
  uColorNoise: { value: Color };
  uDepth: { value: number };
  uFrequency: { value: number };
  uFunnelDistortion: { value: number };
  uFunnelEnd: { value: number };
  uFunnelEndShift: { value: number };
  uFunnelNarrow: { value: number };
  uFunnelStart: { value: number };
  uFunnelStartShift: { value: number };
  uFunnelThick: { value: number };
  uHeight: { value: number };
  uIsMobile: { value: boolean };
  uPixelRatio: { value: number };
  uPulsePhase: { value: number };
  uPulseRate: { value: number };
  uPulseSoftness: { value: number };
  uPulseSpatialScale: { value: number };
  uPulseStrength: { value: number };
  uPulseThreshold: { value: number };
  uScale: { value: number };
  uSelection: { value: number };
  uSize: { value: number };
  uSpeed: { value: number };
  uStream: { value: number };
  uTime: { value: number };
  uWidth: { value: number };
}

const stageItemIds = AMBIENT_FIELD_STAGE_ITEM_IDS;

function createColorFromFallbackHex(hex: string): Color {
  return new Color(hex);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function createLayerUniforms(
  itemId: AmbientFieldStageItemId,
  isMobile: boolean,
  pointTexture: Texture,
): LayerUniforms {
  const preset = visualPresets[itemId];
  const { shader } = preset;

  return {
    pointTexture: { value: pointTexture },
    uIsMobile: { value: isMobile },
    uPixelRatio: { value: 1 },
    uPulsePhase: { value: shader.pulsePhase },
    uPulseRate: { value: shader.pulseRate },
    uPulseSoftness: { value: shader.pulseSoftness },
    uPulseSpatialScale: { value: shader.pulseSpatialScale },
    uPulseStrength: { value: shader.pulseStrength },
    uPulseThreshold: { value: shader.pulseThreshold },
    uTime: { value: 0 },
    uScale: { value: 1 / preset.sceneScale },
    uSpeed: { value: shader.speed },
    uSize: { value: shader.size },
    uAlpha: { value: shader.alpha },
    uDepth: { value: shader.depth },
    uAmplitude: { value: shader.amplitude },
    uFrequency: { value: shader.frequency },
    uSelection: { value: shader.selection },
    uWidth: { value: shader.width },
    uHeight: { value: shader.height },
    uStream: { value: shader.stream },
    uFunnelStart: { value: shader.funnelStart },
    uFunnelEnd: { value: shader.funnelEnd },
    uFunnelThick: { value: shader.funnelThick },
    uFunnelNarrow: { value: shader.funnelNarrow },
    uFunnelStartShift: { value: shader.funnelStartShift },
    uFunnelEndShift: { value: shader.funnelEndShift },
    uFunnelDistortion: { value: shader.funnelDistortion },
    uColorBase: { value: createColorFromFallbackHex(shader.colorBase.fallbackHex) },
    uColorNoise: { value: createColorFromFallbackHex(shader.colorNoise.fallbackHex) },
  };
}

function AmbientFieldStageLayer({
  onModelRef,
  onMaterialRef,
  onWrapperRef,
  source,
  uniforms,
}: {
  onModelRef: (group: Group | null) => void;
  onMaterialRef: (material: ShaderMaterial | null) => void;
  onWrapperRef: (group: Group | null) => void;
  source: AmbientFieldPointSource;
  uniforms: LayerUniforms;
}) {
  const { buffers } = source;

  return (
    <group
      ref={onWrapperRef}
      position={[0, 0, 0]}
      scale={[1, 1, 1]}
    >
      <group ref={onModelRef}>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[buffers.position, 3]} />
            <bufferAttribute attach="attributes-color" args={[buffers.color, 3]} />
            <bufferAttribute attach="attributes-aMove" args={[buffers.aMove, 3]} />
            <bufferAttribute attach="attributes-aSpeed" args={[buffers.aSpeed, 3]} />
            <bufferAttribute
              attach="attributes-aRandomness"
              args={[buffers.aRandomness, 3]}
            />
            <bufferAttribute attach="attributes-aIndex" args={[buffers.aIndex, 1]} />
            <bufferAttribute attach="attributes-aAlpha" args={[buffers.aAlpha, 1]} />
            <bufferAttribute
              attach="attributes-aSelection"
              args={[buffers.aSelection, 1]}
            />
            <bufferAttribute
              attach="attributes-aStreamFreq"
              args={[buffers.aStreamFreq, 1]}
            />
            <bufferAttribute
              attach="attributes-aFunnelNarrow"
              args={[buffers.aFunnelNarrow, 1]}
            />
            <bufferAttribute
              attach="attributes-aFunnelThickness"
              args={[buffers.aFunnelThickness, 1]}
            />
            <bufferAttribute
              attach="attributes-aFunnelStartShift"
              args={[buffers.aFunnelStartShift, 1]}
            />
            <bufferAttribute
              attach="attributes-aFunnelEndShift"
              args={[buffers.aFunnelEndShift, 1]}
            />
          </bufferGeometry>
          <shaderMaterial
            ref={onMaterialRef}
            transparent
            depthTest={false}
            depthWrite={false}
            blending={NormalBlending}
            uniforms={uniforms}
            vertexShader={FIELD_VERTEX_SHADER}
            fragmentShader={FIELD_FRAGMENT_SHADER}
          />
        </points>
      </group>
    </group>
  );
}

export function FieldScene({
  sceneStateRef,
  densityScale = 1,
  onFrame,
}: FieldSceneProps) {
  const viewportWidth = useThree((state) => state.size.width);
  const isMobile = viewportWidth < AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT;
  const pointSources = useMemo(
    () => resolveAmbientFieldPointSources({ densityScale, isMobile }),
    [densityScale, isMobile],
  );
  const pointTexture = useMemo(() => getFieldPointTexture(), []);

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
  const stageMaterialRefs = useRef<
    Record<AmbientFieldStageItemId, ShaderMaterial | null>
  >({
    blob: null,
    stream: null,
    pcb: null,
  });
  const stageIdleRotationRefs = useRef<Record<AmbientFieldStageItemId, number>>({
    blob: 0,
    stream: 0,
    pcb: 0,
  });

  const layerUniformsRef = useRef({
    blob: createLayerUniforms("blob", isMobile, pointTexture),
    stream: createLayerUniforms("stream", isMobile, pointTexture),
    pcb: createLayerUniforms("pcb", isMobile, pointTexture),
  });
  if (layerUniformsRef.current.blob.uIsMobile.value !== isMobile) {
    layerUniformsRef.current = {
      blob: createLayerUniforms("blob", isMobile, pointTexture),
      stream: createLayerUniforms("stream", isMobile, pointTexture),
      pcb: createLayerUniforms("pcb", isMobile, pointTexture),
    };
  }
  const layerUniforms = layerUniformsRef.current;
  const colorTargets = useMemo(
    () =>
      Object.fromEntries(
        stageItemIds.map((itemId) => {
          const preset = visualPresets[itemId];
          return [
            itemId,
            {
              base: createColorFromFallbackHex(preset.shader.colorBase.fallbackHex),
              noise: createColorFromFallbackHex(preset.shader.colorNoise.fallbackHex),
            },
          ];
        }),
      ) as Record<AmbientFieldStageItemId, { base: Color; noise: Color }>,
    [],
  );

  useFrame((state, delta) => {
    onFrame?.(state.clock.elapsedTime * 1000);
    const sceneState = sceneStateRef.current ?? DEFAULT_AMBIENT_FIELD_SCENE;
    const motionEnabled = sceneState.motionEnabled;

    for (const itemId of stageItemIds) {
      const layer = {
        model: stageModelRefs.current[itemId],
        material: stageMaterialRefs.current[itemId],
        wrapper: stageWrapperRefs.current[itemId],
      };
      if (!layer.model || !layer.material || !layer.wrapper) continue;

      const preset = visualPresets[itemId];
      const { shader } = preset;
      const uniforms = layerUniforms[itemId];
      const runtimeState = sceneState.items[itemId];
      const emphasis = runtimeState?.emphasis ?? 0;
      const visibility = runtimeState?.visibility ?? 0;
      const localProgress = runtimeState?.localProgress ?? 0;
      const motionScale = motionEnabled ? 1 : 0.16;
      const driftBlend = lerpFactor(delta, DECAY.standard);
      const time = uniforms.uTime.value + (
        motionEnabled
          ? delta * (itemId === "pcb" ? 0.6 : 0.12)
          : delta * (itemId === "pcb" ? 0.2 : 0.04)
      );
      const sceneScale = isMobile
        ? (preset.sceneScaleMobile ?? preset.sceneScale)
        : preset.sceneScale;
      const bounds = pointSources[itemId].bounds;
      const sourceHeight = Math.max(bounds.maxY - bounds.minY, 0.001);
      const camera = state.camera;
      const sceneUnits =
        "fov" in camera
          ? 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
          : 0;
      const baseScale = (sceneUnits / sourceHeight) * sceneScale;
      const shaderAlpha = isMobile
        ? (shader.alphaMobile ?? shader.alpha)
        : shader.alpha;
      const shaderSize = isMobile
        ? (shader.sizeMobile ?? shader.size)
        : shader.size;
      const blobFrequencyRamp =
        itemId === "blob" ? smoothstep(0.0, 0.15, localProgress) : 0;
      const blobStats =
        itemId === "blob" ? smoothstep(0.1, 0.14, localProgress) : 0;
      const blobSelection =
        itemId === "blob" ? smoothstep(0.34, 0.4, localProgress) : 0;
      const blobDiagram =
        itemId === "blob" ? smoothstep(0.49, 0.59, localProgress) : 0;
      const blobAlphaWindow =
        itemId === "blob" ? smoothstep(0.49, 0.53, localProgress) : 0;
      const blobAlphaReturn =
        itemId === "blob" ? smoothstep(0.63, 0.66, localProgress) : 0;
      const blobShrink =
        itemId === "blob" ? smoothstep(0.63, 0.73, localProgress) : 0;
      const blobEnd = itemId === "blob" ? smoothstep(0.9, 1.0, localProgress) : 0;
      const blobAlphaDip = clamp01(blobAlphaWindow - blobAlphaReturn);
      const blobScaleBurst = clamp01(blobDiagram - blobShrink);
      const pulseProgress =
        itemId === "blob"
          ? smoothstep(0.1, 0.59, localProgress)
          : clamp01(emphasis);

      const targetAlpha =
        itemId === "blob"
          ? shaderAlpha * visibility * (0.42 + 0.58 * (1 - blobAlphaDip))
          : shaderAlpha * visibility;
      const blobStatsAmplitude =
        shader.amplitude + (0.25 - shader.amplitude) * blobStats;
      const targetAmplitude =
        itemId === "blob"
          ? (blobStatsAmplitude + (0.5 - blobStatsAmplitude) * blobDiagram) *
            motionScale
          : shader.amplitude * motionScale;
      const targetDepth =
        itemId === "blob"
          ? shader.depth + (1 - shader.depth) * blobDiagram
          : shader.depth;
      const targetFrequency =
        itemId === "blob"
          ? shader.frequency + (1.7 - shader.frequency) * blobFrequencyRamp
          : shader.frequency;
      const targetSpeed = shader.speed * motionScale;
      const targetSize = shaderSize;
      const targetPulseRate =
        shader.pulseRate + (3 - shader.pulseRate) * pulseProgress;
      const targetPulseThreshold =
        shader.pulseThreshold + (0.72 - shader.pulseThreshold) * pulseProgress;
      const targetPulseStrength =
        shader.pulseStrength +
        ((itemId === "blob" ? 0.9 : 0.82) - shader.pulseStrength) * pulseProgress;
      const targetSelection =
        itemId === "blob"
          ? shader.selection - (shader.selection - 0.45) * blobSelection
          : shader.selection;
      const targetFunnelDistortion = shader.funnelDistortion;
      const targetFunnelStartShift = shader.funnelStartShift;
      const targetFunnelEndShift = shader.funnelEndShift;
      const targetScale =
        itemId === "blob"
          ? baseScale * (1 + 0.8 * blobScaleBurst)
          : baseScale;
      const targetPositionY =
        sceneUnits * (preset.sceneOffset[1] + (itemId === "blob" ? blobEnd * 0.5 : 0));
      const targetRotationX =
        preset.sceneRotation[0] + preset.scrollRotation[0] * localProgress;
      const targetRotationY =
        preset.sceneRotation[1] + preset.scrollRotation[1] * localProgress;
      const targetRotationZ =
        preset.sceneRotation[2] + preset.scrollRotation[2] * localProgress;
      const idleRotationY =
        stageIdleRotationRefs.current[itemId] +
        delta * preset.rotationVelocity[1] * motionScale;
      stageIdleRotationRefs.current[itemId] = idleRotationY;

      uniforms.uTime.value = time;
      uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);
      uniforms.uIsMobile.value = isMobile;
      uniforms.uPulseRate.value = targetPulseRate;
      uniforms.uPulseSoftness.value = shader.pulseSoftness;
      uniforms.uPulseSpatialScale.value = shader.pulseSpatialScale;
      uniforms.uPulseStrength.value = targetPulseStrength;
      uniforms.uPulseThreshold.value = targetPulseThreshold;
      uniforms.uScale.value = 1 / baseScale;
      uniforms.uAlpha.value = targetAlpha;
      uniforms.uAmplitude.value = targetAmplitude;
      uniforms.uDepth.value = targetDepth;
      uniforms.uFrequency.value = targetFrequency;
      uniforms.uSize.value = targetSize;
      uniforms.uSpeed.value = targetSpeed;
      uniforms.uSelection.value = targetSelection;
      uniforms.uFunnelDistortion.value = targetFunnelDistortion;
      uniforms.uFunnelStartShift.value = targetFunnelStartShift;
      uniforms.uFunnelEndShift.value = targetFunnelEndShift;
      uniforms.uColorBase.value.copy(colorTargets[itemId].base);
      uniforms.uColorNoise.value.copy(colorTargets[itemId].noise);

      layer.wrapper.visible = visibility > 0.01;
      layer.wrapper.position.x +=
        (sceneUnits * preset.sceneOffset[0] - layer.wrapper.position.x) * driftBlend;
      layer.wrapper.position.y +=
        (targetPositionY - layer.wrapper.position.y) * driftBlend;
      layer.wrapper.position.z +=
        (preset.sceneOffset[2] - layer.wrapper.position.z) * driftBlend;
      layer.wrapper.rotation.x = 0;
      layer.wrapper.rotation.y = idleRotationY;
      layer.wrapper.rotation.z = 0;

      layer.model.rotation.x = targetRotationX;
      layer.model.rotation.y = targetRotationY;
      layer.model.rotation.z = targetRotationZ;

      layer.wrapper.scale.x += (targetScale - layer.wrapper.scale.x) * driftBlend;
      layer.wrapper.scale.y += (targetScale - layer.wrapper.scale.y) * driftBlend;
      layer.wrapper.scale.z += (targetScale - layer.wrapper.scale.z) * driftBlend;
    }
  });

  return (
    <>
      {stageItemIds.map((itemId) => (
        <AmbientFieldStageLayer
          key={itemId}
          source={pointSources[itemId]}
          onModelRef={(group) => {
            stageModelRefs.current[itemId] = group;
          }}
          onMaterialRef={(material) => {
            stageMaterialRefs.current[itemId] = material;
          }}
          onWrapperRef={(group) => {
            stageWrapperRefs.current[itemId] = group;
          }}
          uniforms={layerUniforms[itemId]}
        />
      ))}
    </>
  );
}
