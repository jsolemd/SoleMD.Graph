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
      position={preset.sceneOffset}
      rotation={preset.sceneRotation}
      scale={[preset.sceneScale, preset.sceneScale, preset.sceneScale]}
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
          depthWrite={false}
          blending={NormalBlending}
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
      const emphasis = runtimeState?.emphasis ?? visibility;
      const localProgress = runtimeState?.localProgress ?? 0;
      const motionScale = motionEnabled ? 1 : 0.16;
      const driftBlend = lerpFactor(delta, DECAY.standard);
      const emphasisBlend = lerpFactor(delta, DECAY.micro);
      const visibilityScale = 0.24 + visibility * 0.76;
      const time = uniforms.uTime.value + (motionEnabled ? delta * 0.12 : delta * 0.015);
      const depthBoost = 0.82 + emphasis * 0.18;
      const sceneScale = isMobile
        ? (preset.sceneScaleMobile ?? preset.sceneScale)
        : preset.sceneScale;
      const shaderAlpha = isMobile
        ? (shader.alphaMobile ?? shader.alpha)
        : shader.alpha;
      const shaderSize = isMobile
        ? (shader.sizeMobile ?? shader.size)
        : shader.size;

      const targetAlpha = shaderAlpha * visibility;
      const targetAmplitude =
        shader.amplitude *
        (itemId === "blob"
          ? 0.88 + localProgress * 0.24
          : itemId === "stream"
            ? 0.82 + sceneState.processProgress * 0.3
            : 0.9 + localProgress * 0.1) *
        motionScale;
      const targetDepth = shader.depth * depthBoost;
      const targetFrequency =
        shader.frequency +
        (itemId === "stream"
          ? sceneState.processProgress * 0.08
          : localProgress * 0.04);
      const targetSpeed = shader.speed * (0.9 + emphasis * 0.14) * motionScale;
      const targetSize = shaderSize * (0.78 + emphasis * 0.12);
      const targetFunnelDistortion =
        shader.funnelDistortion *
        (itemId === "stream"
          ? 0.74 + sceneState.processProgress * 0.42
          : 1);
      const targetFunnelStartShift =
        shader.funnelStartShift +
        (itemId === "stream" ? (sceneState.processProgress - 0.5) * 0.06 : 0);
      const targetFunnelEndShift =
        shader.funnelEndShift +
        (itemId === "stream" ? (sceneState.processProgress - 0.5) * 0.14 : 0);
      const driftX =
        Math.sin(time * (0.16 + shader.speed * 0.1) + preset.sceneRotation[1]) *
        0.06 *
        visibilityScale *
        motionScale;
      const driftY =
        Math.cos(time * (0.12 + shader.speed * 0.08) + preset.sceneRotation[0]) *
        0.05 *
        visibilityScale *
        motionScale;
      const targetScale = sceneScale * (0.94 + emphasis * 0.08);

      uniforms.uTime.value = time;
      uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);
      uniforms.uIsMobile.value = isMobile;
      uniforms.uScale.value = 1 / sceneScale;
      uniforms.uAlpha.value += (targetAlpha - uniforms.uAlpha.value) * emphasisBlend;
      uniforms.uAmplitude.value +=
        (targetAmplitude - uniforms.uAmplitude.value) * driftBlend;
      uniforms.uDepth.value += (targetDepth - uniforms.uDepth.value) * driftBlend;
      uniforms.uFrequency.value +=
        (targetFrequency - uniforms.uFrequency.value) * driftBlend;
      uniforms.uSize.value += (targetSize - uniforms.uSize.value) * emphasisBlend;
      uniforms.uSpeed.value += (targetSpeed - uniforms.uSpeed.value) * driftBlend;
      uniforms.uSelection.value +=
        ((shader.selection * (0.86 + visibility * 0.14)) - uniforms.uSelection.value) *
        emphasisBlend;
      uniforms.uFunnelDistortion.value +=
        (targetFunnelDistortion - uniforms.uFunnelDistortion.value) * driftBlend;
      uniforms.uFunnelStartShift.value +=
        (targetFunnelStartShift - uniforms.uFunnelStartShift.value) * driftBlend;
      uniforms.uFunnelEndShift.value +=
        (targetFunnelEndShift - uniforms.uFunnelEndShift.value) * driftBlend;
      uniforms.uColorBase.value.lerp(colorTargets[itemId].base, driftBlend);
      uniforms.uColorNoise.value.lerp(colorTargets[itemId].noise, driftBlend);

      layer.group.visible = visibility > 0.01;
      layer.group.position.x +=
        (preset.sceneOffset[0] + driftX - layer.group.position.x) * driftBlend;
      layer.group.position.y +=
        (preset.sceneOffset[1] + driftY - layer.group.position.y) * driftBlend;
      layer.group.position.z +=
        (preset.sceneOffset[2] - layer.group.position.z) * driftBlend;

      layer.group.rotation.x +=
        ((preset.sceneRotation[0] +
          time * preset.rotationVelocity[0] * motionScale +
          localProgress * preset.scrollRotation[0]) -
          layer.group.rotation.x) *
        driftBlend;
      layer.group.rotation.y +=
        ((preset.sceneRotation[1] +
          time * preset.rotationVelocity[1] * motionScale +
          sceneState.scrollProgress * preset.scrollRotation[1]) -
          layer.group.rotation.y) *
        driftBlend;
      layer.group.rotation.z +=
        ((preset.sceneRotation[2] +
          time * preset.rotationVelocity[2] * motionScale +
          localProgress * preset.scrollRotation[2]) -
          layer.group.rotation.z) *
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
