"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import {
  AdditiveBlending,
  Texture,
  Color,
  Group,
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
  itemId,
  onGroupRef,
  onMaterialRef,
  source,
  uniforms,
}: {
  itemId: AmbientFieldStageItemId;
  onGroupRef: (group: Group | null) => void;
  onMaterialRef: (material: ShaderMaterial | null) => void;
  source: AmbientFieldPointSource;
  uniforms: LayerUniforms;
}) {
  const preset = visualPresets[itemId];
  const { buffers } = source;

  return (
    <group
      ref={onGroupRef}
      position={[0, 0, 0]}
      rotation={preset.sceneRotation}
      scale={[1, 1, 1]}
    >
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
          blending={AdditiveBlending}
          uniforms={uniforms}
          vertexShader={FIELD_VERTEX_SHADER}
          fragmentShader={FIELD_FRAGMENT_SHADER}
        />
      </points>
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

  const stageGroupRefs = useRef<Record<AmbientFieldStageItemId, Group | null>>({
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
        group: stageGroupRefs.current[itemId],
        material: stageMaterialRefs.current[itemId],
      };
      if (!layer.group || !layer.material) continue;

      const preset = visualPresets[itemId];
      const { shader } = preset;
      const uniforms = layerUniforms[itemId];
      const runtimeState = sceneState.items[itemId];
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
        itemId === "blob" ? smoothstep(0.0, 0.17, localProgress) : 0;
      const blobStats = itemId === "blob" ? smoothstep(0.11, 0.16, localProgress) : 0;
      const blobSelection =
        itemId === "blob" ? smoothstep(0.38, 0.44, localProgress) : 0;
      const blobDiagram = itemId === "blob" ? smoothstep(0.54, 0.63, localProgress) : 0;
      const blobShrink = itemId === "blob" ? smoothstep(0.7, 0.8, localProgress) : 0;
      const blobEnd = itemId === "blob" ? smoothstep(0.9, 1.0, localProgress) : 0;
      const blobAlphaDip = clamp01(blobDiagram - blobShrink);
      const blobScaleBurst = clamp01(blobDiagram - blobShrink);

      const targetAlpha =
        itemId === "blob"
          ? shaderAlpha * visibility * (1 - blobAlphaDip)
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
      const targetSelection =
        itemId === "blob"
          ? shader.selection - (shader.selection - 0.3) * blobSelection
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
      const targetRotationX = preset.sceneRotation[0];
      const targetRotationY =
        preset.sceneRotation[1] +
        time * preset.rotationVelocity[1] * motionScale +
        (itemId === "blob" ? localProgress * Math.PI : 0);
      const targetRotationZ = preset.sceneRotation[2];

      uniforms.uTime.value = time;
      uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);
      uniforms.uIsMobile.value = isMobile;
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

      layer.group.visible = visibility > 0.01;
      layer.group.position.x +=
        (sceneUnits * preset.sceneOffset[0] - layer.group.position.x) * driftBlend;
      layer.group.position.y +=
        (targetPositionY - layer.group.position.y) * driftBlend;
      layer.group.position.z +=
        (preset.sceneOffset[2] - layer.group.position.z) * driftBlend;

      layer.group.rotation.x +=
        (targetRotationX - layer.group.rotation.x) *
        driftBlend;
      layer.group.rotation.y +=
        (targetRotationY - layer.group.rotation.y) *
        driftBlend;
      layer.group.rotation.z +=
        (targetRotationZ - layer.group.rotation.z) *
        driftBlend;

      layer.group.scale.x += (targetScale - layer.group.scale.x) * driftBlend;
      layer.group.scale.y += (targetScale - layer.group.scale.y) * driftBlend;
      layer.group.scale.z += (targetScale - layer.group.scale.z) * driftBlend;
    }
  });

  return (
    <>
      {stageItemIds.map((itemId) => (
        <AmbientFieldStageLayer
          key={itemId}
          itemId={itemId}
          source={pointSources[itemId]}
          onGroupRef={(group) => {
            stageGroupRefs.current[itemId] = group;
          }}
          onMaterialRef={(material) => {
            stageMaterialRefs.current[itemId] = material;
          }}
          uniforms={layerUniforms[itemId]}
        />
      ))}
    </>
  );
}
