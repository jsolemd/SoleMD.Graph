"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import {
  Camera,
  Texture,
  Color,
  Group,
  NormalBlending,
  ShaderMaterial,
  Vector3,
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
  onHotspotsFrame?: (hotspots: AmbientFieldHotspotFrame[]) => void;
}

export interface AmbientFieldHotspotFrame {
  color: string;
  id: string;
  opacity: number;
  scale: number;
  showCard: boolean;
  visible: boolean;
  x: number;
  y: number;
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
const AMBIENT_FIELD_LOOP_EPOCH_MS =
  typeof performance === "undefined" ? 0 : performance.now();
const BLOB_HOTSPOT_COUNT = 40;
const BLOB_HOTSPOT_CARD_COUNT = 3;
const BLOB_HOTSPOT_IDS = Array.from(
  { length: BLOB_HOTSPOT_COUNT },
  (_, index) => `blob-hotspot-${index}`,
);

interface BlobHotspotRuntime {
  candidateIndex: number | null;
  cycleDurationMs: number;
  cycleStartAtMs: number;
  phaseKey: "card" | "dot" | "hidden";
}

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

function getAmbientFieldLoopSeconds() {
  if (typeof performance === "undefined") return 0;
  return Math.max(0, (performance.now() - AMBIENT_FIELD_LOOP_EPOCH_MS) / 1000);
}

function sampleBlobHotspotDelayMs() {
  return Math.random() * 2000;
}

function getBlobHotspotCycleDurationMs(isSingleVisible: boolean) {
  return isSingleVisible ? 4000 : 2000;
}

function getBlobHotspotPulseEnvelope(progress: number) {
  if (progress <= 0 || progress >= 1) {
    return 0;
  }

  if (progress < 0.2) {
    return smoothstep(0, 0.2, progress);
  }

  if (progress <= 0.8) {
    return 1;
  }

  return 1 - smoothstep(0.8, 1, progress);
}

function getBlobHotspotVerticalBand(hotspotIndex: number) {
  const bands = [
    [0.28, 0.42],
    [0.45, 0.58],
    [0.62, 0.76],
  ] as const;

  return bands[hotspotIndex] ?? [0.18, 0.82];
}

function getPointColorCss(
  source: AmbientFieldPointSource,
  candidateIndex: number,
) {
  const colorOffset = candidateIndex * 3;
  const red = Math.max(
    0,
    Math.min(255, Math.round((source.buffers.color[colorOffset] ?? 0) * 255)),
  );
  const green = Math.max(
    0,
    Math.min(255, Math.round((source.buffers.color[colorOffset + 1] ?? 0) * 255)),
  );
  const blue = Math.max(
    0,
    Math.min(255, Math.round((source.buffers.color[colorOffset + 2] ?? 0) * 255)),
  );

  return `rgb(${red} ${green} ${blue})`;
}

function projectBlobHotspotCandidate({
  blobModel,
  camera,
  candidateIndex,
  height,
  hotspotIndex,
  pinVerticalBand,
  source,
  vector,
  width,
}: {
  blobModel: Group;
  camera: Camera;
  candidateIndex: number;
  height: number;
  hotspotIndex: number;
  pinVerticalBand: boolean;
  source: AmbientFieldPointSource;
  vector: Vector3;
  width: number;
}) {
  const positionOffset = candidateIndex * 3;
  const localZ = source.buffers.position[positionOffset + 2] ?? 0;
  if (localZ > 0) {
    return null;
  }

  vector.set(
    source.buffers.position[positionOffset] ?? 0,
    source.buffers.position[positionOffset + 1] ?? 0,
    source.buffers.position[positionOffset + 2] ?? 0,
  );
  blobModel.localToWorld(vector);
  vector.project(camera);

  const x = ((vector.x + 1) * width) / 2;
  const y = ((-vector.y + 1) * height) / 2;
  const scale = Math.max(0.72, Math.min(1.36, (1 - vector.z) * 2));
  const withinViewport =
    x > 24 &&
    x < width - 24 &&
    y > 24 &&
    y < height - 24 &&
    vector.z < 0.84;
  const [bandMin, bandMax] = getBlobHotspotVerticalBand(hotspotIndex);
  const withinVerticalBand =
    !pinVerticalBand || (y >= height * bandMin && y <= height * bandMax);

  if (!withinViewport || !withinVerticalBand) {
    return null;
  }

  return {
    candidateIndex,
    scale,
    x,
    y,
  };
}

function selectBlobHotspotCandidate({
  blobModel,
  camera,
  hotspotIndex,
  maxAttempts = 20,
  pinVerticalBand,
  source,
  usedCandidateIndices,
  vector,
  viewportHeight,
  viewportWidth,
}: {
  blobModel: Group;
  camera: Camera;
  hotspotIndex: number;
  maxAttempts?: number;
  pinVerticalBand: boolean;
  source: AmbientFieldPointSource;
  usedCandidateIndices: Set<number>;
  vector: Vector3;
  viewportHeight: number;
  viewportWidth: number;
}) {
  if (source.pointCount === 0) {
    return null;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidateIndex = Math.floor(Math.random() * source.pointCount);
    if (usedCandidateIndices.has(candidateIndex)) {
      continue;
    }

    const projected = projectBlobHotspotCandidate({
      blobModel,
      camera,
      candidateIndex,
      height: viewportHeight,
      hotspotIndex,
      pinVerticalBand,
      source,
      vector,
      width: viewportWidth,
    });

    if (!projected) {
      continue;
    }

    return projected;
  }

  return null;
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
  onHotspotsFrame,
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
  const hotspotVectorRef = useRef(new Vector3());
  const blobHotspotRuntimeRef = useRef<BlobHotspotRuntime[]>(
    BLOB_HOTSPOT_IDS.map(() => ({
      candidateIndex: null,
      cycleDurationMs: 0,
      cycleStartAtMs: 0,
      phaseKey: "hidden",
    })),
  );

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
    const loopSeconds = getAmbientFieldLoopSeconds();
    const {
      paperCards,
      paperHighlights,
      detailInspection,
      reform,
      synthesisLinks,
    } = sceneState.phases;

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
      const visibility = runtimeState?.visibility ?? 0;
      const localProgress = runtimeState?.localProgress ?? 0;
      const motionScale = motionEnabled ? 1 : 0.16;
      const driftBlend = lerpFactor(delta, DECAY.standard);
      const timeFactor = motionEnabled
        ? (itemId === "pcb" ? 0.6 : 0.12)
        : (itemId === "pcb" ? 0.2 : 0.04);
      const time = loopSeconds * timeFactor;
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
      const sourceHotspotIntro =
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
      const targetPulseRate = shader.pulseRate;
      const targetPulseThreshold = shader.pulseThreshold;
      const targetPulseStrength = shader.pulseStrength;
      const targetSelection =
        itemId === "blob"
          ? shader.selection -
            (shader.selection - 0.3) *
              clamp01(
                Math.max(
                  sourceHotspotIntro,
                  paperHighlights * 0.52,
                  paperCards * 0.72,
                  detailInspection * 0.48,
                ),
              )
          : shader.selection;
      const targetFunnelDistortion = shader.funnelDistortion;
      const targetFunnelStartShift = shader.funnelStartShift;
      const targetFunnelEndShift = shader.funnelEndShift;
      const targetScale =
        itemId === "blob"
          ? baseScale * (1 + 0.8 * blobScaleBurst + reform * 0.16)
          : baseScale;
      const targetPositionY =
        sceneUnits * (preset.sceneOffset[1] + (itemId === "blob" ? blobEnd * 0.12 : 0));
      const targetRotationX =
        preset.sceneRotation[0] + preset.scrollRotation[0] * localProgress;
      const targetRotationY =
        preset.sceneRotation[1] + preset.scrollRotation[1] * localProgress;
      const targetRotationZ =
        preset.sceneRotation[2] + preset.scrollRotation[2] * localProgress;
      const idleRotationY = loopSeconds * preset.rotationVelocity[1] * motionScale;

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

    if (onHotspotsFrame) {
      const loopMs = loopSeconds * 1000;
      const frames = BLOB_HOTSPOT_IDS.map((id, index) => ({
        color: "var(--color-soft-blue)",
        id,
        opacity: 0,
        scale: 0.9,
        showCard: index < BLOB_HOTSPOT_CARD_COUNT,
        visible: false,
        x: -9999,
        y: -9999,
      }));
      const blobModel = stageModelRefs.current.blob;
      const blobWrapper = stageWrapperRefs.current.blob;
      const blobRuntime = sceneState.items.blob;
      const blobVisibility = blobRuntime?.visibility ?? 0;
      const blobLocalProgress = blobRuntime?.localProgress ?? 0;

      if (blobModel && blobWrapper && blobVisibility > 0.01) {
        blobWrapper.updateWorldMatrix(true, true);

        const paperHighlightDots = clamp01(
          paperHighlights * (1 - smoothstep(0.14, 0.82, paperCards)),
        );
        const paperCardWindow = clamp01(
          paperCards * (1 - smoothstep(0.04, 0.52, detailInspection)),
        );
        const paperCardDots = paperCardWindow;
        const detailDots = clamp01(detailInspection * 0.46);
        const synthesisDots = clamp01(synthesisLinks * 0.54);
        const dotOpacity =
          Math.max(
            paperHighlightDots,
            paperCardDots * 0.82,
            detailDots * 0.52,
            synthesisDots * 0.64,
          ) * blobVisibility;
        const cardOpacity = paperCardWindow * blobVisibility;
        const paperHighlightDotCount =
          paperHighlightDots <= 0.01
            ? 0
            : blobLocalProgress < 0.32
              ? Math.round(
                  3 +
                    (BLOB_HOTSPOT_COUNT - 3) *
                      clamp01((blobLocalProgress - 0.2) / 0.12),
                )
              : BLOB_HOTSPOT_COUNT;
        const paperCardDotCount = paperCardDots > 0.01 ? 12 : 0;
        const detailDotCount = detailDots > 0.01 ? 8 : 0;
        const synthesisDotCount = synthesisDots > 0.01 ? 10 : 0;
        const usedCandidateIndices = new Set<number>();

        for (let hotspotIndex = 0; hotspotIndex < BLOB_HOTSPOT_COUNT; hotspotIndex += 1) {
          const frame = frames[hotspotIndex]!;
          const runtime = blobHotspotRuntimeRef.current[hotspotIndex]!;
          const shouldShowCard =
            cardOpacity > 0.01 && hotspotIndex < BLOB_HOTSPOT_CARD_COUNT;
          const shouldShowDot =
            dotOpacity > 0.01 &&
            hotspotIndex <
              Math.max(
                shouldShowCard ? BLOB_HOTSPOT_CARD_COUNT : 0,
                paperHighlightDotCount,
                paperCardDotCount,
                detailDotCount,
                synthesisDotCount,
              );
          const phaseKey: BlobHotspotRuntime["phaseKey"] = shouldShowCard
            ? "card"
            : shouldShowDot
              ? "dot"
              : "hidden";
          const isSingleVisible =
            phaseKey === "dot" &&
            paperHighlightDotCount > 0 &&
            paperHighlightDotCount <= BLOB_HOTSPOT_CARD_COUNT;
          const pinVerticalBand =
            hotspotIndex < BLOB_HOTSPOT_CARD_COUNT &&
            (shouldShowCard || isSingleVisible);

          if (runtime.phaseKey !== phaseKey) {
            runtime.phaseKey = phaseKey;
            runtime.cycleDurationMs =
              phaseKey === "dot" ? getBlobHotspotCycleDurationMs(isSingleVisible) : 0;
            runtime.cycleStartAtMs =
              phaseKey === "dot" ? loopMs + sampleBlobHotspotDelayMs() : loopMs;
          }

          if (phaseKey === "hidden") {
            continue;
          }

          const vector = hotspotVectorRef.current;
          const shouldReseed =
            runtime.candidateIndex == null ||
            (phaseKey === "dot" &&
              runtime.cycleDurationMs > 0 &&
              loopMs >= runtime.cycleStartAtMs + runtime.cycleDurationMs);

          if (shouldReseed) {
            runtime.candidateIndex = null;
            runtime.cycleDurationMs =
              phaseKey === "dot" ? getBlobHotspotCycleDurationMs(isSingleVisible) : 0;
            runtime.cycleStartAtMs =
              phaseKey === "dot" ? loopMs + sampleBlobHotspotDelayMs() : loopMs;

            const reseeded = selectBlobHotspotCandidate({
              blobModel,
              camera: state.camera,
              hotspotIndex,
              maxAttempts: shouldShowCard ? 80 : 20,
              pinVerticalBand,
              source: pointSources.blob,
              usedCandidateIndices,
              vector,
              viewportHeight: state.size.height,
              viewportWidth: state.size.width,
            });
            runtime.candidateIndex = reseeded?.candidateIndex ?? null;
          }

          if (runtime.candidateIndex == null) {
            continue;
          }

          const cycleEnvelope =
            phaseKey === "dot"
              ? getBlobHotspotPulseEnvelope(
                  (loopMs - runtime.cycleStartAtMs) /
                    Math.max(runtime.cycleDurationMs, 1),
                )
              : 1;

          if (cycleEnvelope <= 0.001) {
            continue;
          }

          let projected = projectBlobHotspotCandidate({
            blobModel,
            camera: state.camera,
            candidateIndex: runtime.candidateIndex,
            height: state.size.height,
            hotspotIndex,
            pinVerticalBand,
            source: pointSources.blob,
            vector,
            width: state.size.width,
          });
          if (!projected) {
            if (phaseKey === "card") {
              runtime.candidateIndex = null;
              const reseeded = selectBlobHotspotCandidate({
                blobModel,
                camera: state.camera,
                hotspotIndex,
                maxAttempts: 80,
                pinVerticalBand,
                source: pointSources.blob,
                usedCandidateIndices,
                vector,
                viewportHeight: state.size.height,
                viewportWidth: state.size.width,
              });
              runtime.candidateIndex = reseeded?.candidateIndex ?? null;
              if (runtime.candidateIndex != null) {
                projected = projectBlobHotspotCandidate({
                  blobModel,
                  camera: state.camera,
                  candidateIndex: runtime.candidateIndex,
                  height: state.size.height,
                  hotspotIndex,
                  pinVerticalBand,
                  source: pointSources.blob,
                  vector,
                  width: state.size.width,
                });
              }
            }

            if (!projected) {
              frame.color = getPointColorCss(
                pointSources.blob,
                runtime.candidateIndex ?? 0,
              );
              frame.showCard = shouldShowCard;
              continue;
            }

            frame.color = getPointColorCss(
              pointSources.blob,
              runtime.candidateIndex ?? projected.candidateIndex,
            );
          }
          usedCandidateIndices.add(projected.candidateIndex);

          frame.visible = true;
          frame.color = getPointColorCss(pointSources.blob, projected.candidateIndex);
          frame.opacity =
            (shouldShowCard ? cardOpacity : dotOpacity * cycleEnvelope) * projected.scale;
          frame.scale = shouldShowCard ? projected.scale : projected.scale * cycleEnvelope;
          frame.showCard = shouldShowCard;
          frame.x = projected.x;
          frame.y = projected.y;
        }
      }

      onHotspotsFrame(frames);
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
