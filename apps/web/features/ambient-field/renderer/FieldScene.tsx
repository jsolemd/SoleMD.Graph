"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import {
  AdditiveBlending,
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
import { getAmbientFieldElapsedSeconds } from "./field-loop-clock";
import {
  AMBIENT_FIELD_BUCKET_INDEX,
} from "../asset/point-source-registry";
import {
  LANDING_ACCENT_RAINBOW_RGB,
  PHASE_TO_BUCKET,
  SOLEMD_BURST_COLORS,
} from "../scene/burst-config";
import { createBurstController } from "./burst-controller";
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
  focusDismissProgress: number;
  focusProgress: number;
  id: string;
  mode: "card" | "dot" | "focus" | "hidden";
  opacity: number;
  scale: number;
  showCard: boolean;
  visible: boolean;
  x: number;
  y: number;
}

interface BlobHotspotProjection {
  candidateIndex: number;
  scale: number;
  x: number;
  y: number;
}

interface LayerUniforms {
  [uniform: string]: { value: unknown };
  pointTexture: { value: Texture };
  uAlpha: { value: number };
  uAmplitude: { value: number };
  uBaseColor: { value: Color };
  uBucketAccents: { value: Color[] };
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
  uBurstType: { value: number };
  uBurstStrength: { value: number };
  uBurstColor: { value: Color };
  uBurstRegionScale: { value: number };
  uBurstSoftness: { value: number };
}

const BUCKET_ACCENT_COUNT = 4;
// Four simultaneous hues 90° apart on the shared rainbow ring. Choosing
// quarter-period phase offsets guarantees the blob is never monochromatic:
// at any instant the four buckets display four distinct hues, and over one
// cycle each bucket traces the full palette.
const BLOB_BUCKET_ACCENT_PHASE_OFFSETS: readonly number[] = [
  0 / BUCKET_ACCENT_COUNT,
  1 / BUCKET_ACCENT_COUNT,
  2 / BUCKET_ACCENT_COUNT,
  3 / BUCKET_ACCENT_COUNT,
];

const stageItemIds = AMBIENT_FIELD_STAGE_ITEM_IDS;
// Base (`uR/G/Bcolor`) stays at its Maze-cyan init value from
// visual-presets.ts. Only the noise side (`uR/G/Bnoise`) walks, smoothly
// lerping through the 8-stop semantic rainbow — 10 s per stop = 80 s full
// cycle, slow enough that at any instant the field reads as a single
// accent color punctuating the cyan base (native Maze read) while over a
// minute+ the burst hue walks through peach → yellow → green → mint →
// blue → purple → lavender → pink.
const ACCENT_CYCLE_STEP_SECONDS = 10;
// Intro: kill the globe-expand (wrapper scale lerping from 1 on mount by
// snapping to baseScale on first frame) and ramp uDepth down from a boost
// multiplier over ~0.9 s, so particles start scattered along their per-
// particle aMove axes and converge onto the sphere surface — the Maze
// "particles assembling" read, produced entirely by the native shader's
// existing position + uDepth * aMove * aSpeed * snoise displacement term.
const INTRO_DURATION_SECONDS = 0.9;
const INTRO_DEPTH_BOOST = 2.6;
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
  invalidSinceAtMs: number | null;
  lastProjected: BlobHotspotProjection | null;
  phaseKey: "card" | "dot" | "focus" | "hidden";
}

// Maze parity toggle: the source exposes `?blending` to swap
// AdditiveBlending in for debug. SoleMD mirrors this as `?field-blending=additive`.
// Default stays NormalBlending (Maze homepage default).
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function sampleBlobHotspotDelayMs() {
  return Math.random() * 2000;
}

function getBlobHotspotCycleDurationMs({
  hotspotIndex,
  isSingleVisible,
  phaseKey,
}: {
  hotspotIndex: number;
  isSingleVisible: boolean;
  phaseKey: BlobHotspotRuntime["phaseKey"];
}) {
  return isSingleVisible ? 4000 : 2000;
}

function hotspotPhaseUsesCycle(phaseKey: BlobHotspotRuntime["phaseKey"]) {
  return phaseKey === "dot";
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

function getBlobHotspotScaleRange(
  hotspotIndex: number,
  phaseKey: BlobHotspotRuntime["phaseKey"],
) {
  if (phaseKey === "card") {
    if (hotspotIndex === 0) {
      return [0.74, 0.96] as const;
    }

    if (hotspotIndex < BLOB_HOTSPOT_CARD_COUNT) {
      return [0.98, 1.3] as const;
    }
  }

  return null;
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
  centerLeftBand,
  height,
  hotspotIndex,
  lockLeftHalf,
  pinVerticalBand,
  scaleRange,
  source,
  vector,
  width,
}: {
  blobModel: Group;
  camera: Camera;
  candidateIndex: number;
  centerLeftBand: boolean;
  height: number;
  hotspotIndex: number;
  lockLeftHalf: boolean;
  pinVerticalBand: boolean;
  scaleRange: readonly [number, number] | null;
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
  const withinLeftHalf = !lockLeftHalf || x <= width * 0.5;
  const withinCenterLeftBand =
    !centerLeftBand || (x >= width * 0.18 && x <= width * 0.48);
  const [bandMin, bandMax] = getBlobHotspotVerticalBand(hotspotIndex);
  const withinVerticalBand =
    !pinVerticalBand || (y >= height * bandMin && y <= height * bandMax);
  const withinScaleRange =
    !scaleRange || (scale >= scaleRange[0] && scale <= scaleRange[1]);

  if (
    !withinViewport ||
    !withinLeftHalf ||
    !withinCenterLeftBand ||
    !withinVerticalBand ||
    !withinScaleRange
  ) {
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
  centerLeftBand,
  hotspotIndex,
  lockLeftHalf,
  maxAttempts = 20,
  pinVerticalBand,
  scaleRange,
  source,
  usedCandidateIndices,
  vector,
  viewportHeight,
  viewportWidth,
}: {
  blobModel: Group;
  camera: Camera;
  centerLeftBand: boolean;
  hotspotIndex: number;
  lockLeftHalf: boolean;
  maxAttempts?: number;
  pinVerticalBand: boolean;
  scaleRange: readonly [number, number] | null;
  source: AmbientFieldPointSource;
  usedCandidateIndices: Set<number>;
  vector: Vector3;
  viewportHeight: number;
  viewportWidth: number;
}) {
  if (source.pointCount === 0) {
    return null;
  }

  const scaleRanges = scaleRange ? [scaleRange, null] : [null];

  for (const activeScaleRange of scaleRanges) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateIndex = Math.floor(Math.random() * source.pointCount);
      if (usedCandidateIndices.has(candidateIndex)) {
        continue;
      }

      const projected = projectBlobHotspotCandidate({
        blobModel,
        camera,
        candidateIndex,
        centerLeftBand,
        height: viewportHeight,
        hotspotIndex,
        lockLeftHalf,
        pinVerticalBand,
        scaleRange: activeScaleRange,
        source,
        vector,
        width: viewportWidth,
      });

      if (!projected) {
        continue;
      }

      return projected;
    }
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
    uBaseColor: {
      value: new Color(
        shader.baseColor[0] / 255,
        shader.baseColor[1] / 255,
        shader.baseColor[2] / 255,
      ),
    },
    uBucketAccents: {
      value: shader.bucketAccents.map(
        ([r, g, b]) => new Color(r / 255, g / 255, b / 255),
      ),
    },
    uBurstType: { value: -1 },
    uBurstStrength: { value: 0 },
    uBurstColor: { value: new Color("#000000") },
    uBurstRegionScale: { value: 1.2 },
    uBurstSoftness: { value: 0.2 },
  };
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
    <group
      ref={onWrapperRef}
      position={[0, 0, 0]}
      scale={[1, 1, 1]}
    >
      <group ref={onMouseWrapperRef}>
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
            <bufferAttribute
              attach="attributes-aBucket"
              args={[buffers.aBucket, 1]}
            />
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
  const stageMouseWrapperRefs = useRef<Record<AmbientFieldStageItemId, Group | null>>({
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
  const wrapperInitializedRef = useRef<Record<AmbientFieldStageItemId, boolean>>({
    blob: false,
    stream: false,
    pcb: false,
  });
  const blobHotspotRuntimeRef = useRef<BlobHotspotRuntime[]>(
    BLOB_HOTSPOT_IDS.map(() => ({
      candidateIndex: null,
      cycleDurationMs: 0,
      cycleStartAtMs: 0,
      invalidSinceAtMs: null,
      lastProjected: null,
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

  const blobBurstControllerRef = useRef(
    createBurstController({
      bucketIndex: AMBIENT_FIELD_BUCKET_INDEX,
      semanticColorMap: SOLEMD_BURST_COLORS,
    }),
  );

  useFrame((state, delta) => {
    onFrame?.(state.clock.elapsedTime * 1000);
    const sceneState = sceneStateRef.current ?? DEFAULT_AMBIENT_FIELD_SCENE;
    const motionEnabled = sceneState.motionEnabled;
    // Module-level clock — survives StrictMode + warmup remounts so uTime
    // never resets mid-session (Round 12 Phase 5).
    const loopSeconds = getAmbientFieldElapsedSeconds();
    const {
      paperCards,
      paperFocus,
      paperHighlights,
      detailInspection,
      reform,
      synthesisLinks,
    } = sceneState.phases;

    // Route the highest-weight phase to the burst controller. Ties break by
    // order below — later phases (reform) outrank earlier ones.
    const phaseStrengths = [
      { id: "paperHighlights", value: paperHighlights },
      { id: "paperCards", value: paperCards },
      { id: "paperFocus", value: paperFocus },
      { id: "detailInspection", value: detailInspection },
      { id: "synthesisLinks", value: synthesisLinks },
      { id: "reform", value: reform },
    ];
    let activePhase: string | null = null;
    let activeStrength = 0;
    for (const entry of phaseStrengths) {
      if (entry.value >= activeStrength) {
        activePhase = entry.id;
        activeStrength = entry.value;
      }
    }
    const activeBucket = activePhase ? PHASE_TO_BUCKET[activePhase] ?? null : null;
    const blobBurst = blobBurstControllerRef.current;
    blobBurst.setActive(
      activeStrength > 0.01 ? activeBucket : null,
      activeStrength,
    );
    blobBurst.step(delta * 1000);

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
      // uTime multiplier per layer. Maze drives `uTime` directly from a
      // GSAP timeline playhead (≈ 1:1 real-time coupling). SoleMD runs on
      // a module clock, so we scale. Blob previously ran at 0.12 which
      // reads as sluggish vs mazehq.com — 0.25 roughly doubles the
      // `snoise(aIndex, uTime * uSpeed)` update rate in field-shaders.ts
      // :256 and restores the Maze-level dynamism without uniform changes.
      const timeFactor = motionEnabled
        ? (itemId === "pcb" ? 0.6 : itemId === "blob" ? 0.25 : 0.12)
        : (itemId === "pcb" ? 0.2 : itemId === "blob" ? 0.1 : 0.04);
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
      // Hotspot phases dim `uSelection` to cull a chunk of particles so the
      // projected rings read cleanly. Maze does the same (scripts.pretty
      // .js:43344-43348) but reads denser because their floor removes less.
      // Floor raised from 0.3 → 0.55 so max cull is ~45 % of particles (at
      // paperFocus peak) instead of ~70 % — preserves the hotspot-visibility
      // intent while keeping the field visually dense throughout scroll.
      const targetSelection =
        itemId === "blob"
          ? shader.selection -
            (shader.selection - 0.55) *
              clamp01(
                Math.max(
                  sourceHotspotIntro,
                  paperHighlights * 0.52,
                  paperCards * 0.72,
                  paperFocus * 0.9,
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

      if (itemId === "blob") {
        // Multi-hue accent hijack. The base (uBaseColor) stays at its
        // Maze-cyan init from visual-presets.ts. Each of the four buckets
        // (aBucket 0..3 — paper/entity/relation/evidence) gets its own
        // accent sampled from LANDING_ACCENT_RAINBOW_RGB at a quarter-period
        // phase offset, so at any frame the blob carries four distinct hues
        // simultaneously. Over one cycle every bucket traces the full
        // rainbow; the quarter offsets keep the set visually separated.
        const palette = LANDING_ACCENT_RAINBOW_RGB;
        const len = palette.length;
        const cycle = loopSeconds / ACCENT_CYCLE_STEP_SECONDS;
        const accents = uniforms.uBucketAccents.value;
        for (let bucketIdx = 0; bucketIdx < BUCKET_ACCENT_COUNT; bucketIdx += 1) {
          const phase =
            (cycle + BLOB_BUCKET_ACCENT_PHASE_OFFSETS[bucketIdx]! * len) % len;
          const idx = Math.floor(phase);
          const t = phase - idx;
          const c0 = palette[idx]!;
          const c1 = palette[(idx + 1) % len]!;
          const accent = accents[bucketIdx]!;
          accent.setRGB(
            (c0[0] + (c1[0] - c0[0]) * t) / 255,
            (c0[1] + (c1[1] - c0[1]) * t) / 255,
            (c0[2] + (c1[2] - c0[2]) * t) / 255,
          );
        }
      }

      uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);
      uniforms.uIsMobile.value = isMobile;
      uniforms.uScale.value = 1 / baseScale;
      uniforms.uAlpha.value = targetAlpha;
      uniforms.uAmplitude.value = targetAmplitude;
      // Intro: boost uDepth above resting for the first INTRO_DURATION_SECONDS
      // so the per-particle `position + uDepth * aMove * aSpeed * snoise`
      // displacement starts large and decays — particles scatter, then
      // converge onto the sphere as the boost eases out. Blob only; stream
      // and pcb already carry their own scroll-driven uAlpha intros.
      if (itemId === "blob") {
        const introProgress = clamp01(loopSeconds / INTRO_DURATION_SECONDS);
        const introEase = 1 - (1 - introProgress) * (1 - introProgress);
        const depthBoost = 1 + (INTRO_DEPTH_BOOST - 1) * (1 - introEase);
        uniforms.uDepth.value = targetDepth * depthBoost;
      } else {
        uniforms.uDepth.value = targetDepth;
      }
      uniforms.uFrequency.value = targetFrequency;
      uniforms.uSize.value = targetSize;
      uniforms.uSpeed.value = targetSpeed;
      uniforms.uSelection.value = targetSelection;
      uniforms.uFunnelDistortion.value = targetFunnelDistortion;
      uniforms.uFunnelStartShift.value = targetFunnelStartShift;
      uniforms.uFunnelEndShift.value = targetFunnelEndShift;

      // Burst only affects the blob today; stream/pcb stay on the Maze
      // base palette unless a future module subscribes them as well.
      if (itemId === "blob") {
        blobBurst.apply(layer.material);
      }

      layer.wrapper.visible = visibility > 0.01;
      // First frame: snap transform to target values so the blob appears at
      // full size immediately (no globe-expand from the default scale=1).
      // Particle assembly is owned by the uDepth intro ramp above, not by
      // a wrapper-scale animation.
      if (!wrapperInitializedRef.current[itemId]) {
        layer.wrapper.position.x = sceneUnits * preset.sceneOffset[0];
        layer.wrapper.position.y = targetPositionY;
        layer.wrapper.position.z = preset.sceneOffset[2];
        layer.wrapper.scale.x = targetScale;
        layer.wrapper.scale.y = targetScale;
        layer.wrapper.scale.z = targetScale;
        wrapperInitializedRef.current[itemId] = true;
      } else {
        layer.wrapper.position.x +=
          (sceneUnits * preset.sceneOffset[0] - layer.wrapper.position.x) * driftBlend;
        layer.wrapper.position.y +=
          (targetPositionY - layer.wrapper.position.y) * driftBlend;
        layer.wrapper.position.z +=
          (preset.sceneOffset[2] - layer.wrapper.position.z) * driftBlend;
        layer.wrapper.scale.x += (targetScale - layer.wrapper.scale.x) * driftBlend;
        layer.wrapper.scale.y += (targetScale - layer.wrapper.scale.y) * driftBlend;
        layer.wrapper.scale.z += (targetScale - layer.wrapper.scale.z) * driftBlend;
      }
      layer.wrapper.rotation.x = 0;
      layer.wrapper.rotation.y = idleRotationY;
      layer.wrapper.rotation.z = 0;

      layer.model.rotation.x = targetRotationX;
      layer.model.rotation.y = targetRotationY;
      layer.model.rotation.z = targetRotationZ;
    }

    if (onHotspotsFrame) {
      const loopMs = loopSeconds * 1000;
      const frames: AmbientFieldHotspotFrame[] = BLOB_HOTSPOT_IDS.map((id, index) => ({
        color: "var(--color-soft-blue)",
        focusDismissProgress: 0,
        focusProgress: 0,
        id,
        mode: "hidden",
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
          paperCards * (1 - smoothstep(0.08, 0.48, paperFocus)),
        );
        const paperFocusWindow = clamp01(
          paperFocus * (1 - smoothstep(0.12, 0.62, detailInspection)),
        );
        const paperCardDots = 0;
        const paperFocusDots = 0;
        const detailDots = clamp01(detailInspection * 0.46);
        const synthesisDots = clamp01(synthesisLinks * 0.54);
        const dotOpacity =
          Math.max(
            paperHighlightDots,
            paperCardDots * 0.82,
            paperFocusDots * 0.44,
            detailDots * 0.52,
            synthesisDots * 0.64,
          ) * blobVisibility;
        const cardOpacity = paperCardWindow * blobVisibility;
        const focusOpacity = paperFocusWindow * blobVisibility;
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
        const paperFocusDotCount = paperFocusDots > 0.01 ? 4 : 0;
        const detailDotCount = detailDots > 0.01 ? 8 : 0;
        const synthesisDotCount = synthesisDots > 0.01 ? 10 : 0;
        const usedCandidateIndices = new Set<number>();

        for (let hotspotIndex = 0; hotspotIndex < BLOB_HOTSPOT_COUNT; hotspotIndex += 1) {
          const frame = frames[hotspotIndex]!;
          const runtime = blobHotspotRuntimeRef.current[hotspotIndex]!;
          const shouldShowFocus = focusOpacity > 0.01 && hotspotIndex === 0;
          const shouldShowCard =
            !shouldShowFocus &&
            cardOpacity > 0.01 &&
            hotspotIndex < BLOB_HOTSPOT_CARD_COUNT;
          const shouldShowDot =
            !shouldShowFocus &&
            dotOpacity > 0.01 &&
            hotspotIndex <
              Math.max(
                shouldShowCard ? BLOB_HOTSPOT_CARD_COUNT : 0,
                paperHighlightDotCount,
                paperCardDotCount,
                paperFocusDotCount,
                detailDotCount,
                synthesisDotCount,
              );
          const phaseKey: BlobHotspotRuntime["phaseKey"] = shouldShowFocus
            ? "focus"
            : shouldShowCard
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
            (shouldShowCard || shouldShowFocus || isSingleVisible);
          const centerLeftBand = shouldShowFocus;
          const lockLeftHalf = shouldShowCard || shouldShowFocus;
          const scaleRange = getBlobHotspotScaleRange(hotspotIndex, phaseKey);

          if (runtime.phaseKey !== phaseKey) {
            runtime.phaseKey = phaseKey;
            runtime.invalidSinceAtMs = null;
            runtime.cycleDurationMs =
              hotspotPhaseUsesCycle(phaseKey)
                ? getBlobHotspotCycleDurationMs({
                    hotspotIndex,
                    isSingleVisible,
                    phaseKey,
                  })
                : 0;
            runtime.cycleStartAtMs =
              hotspotPhaseUsesCycle(phaseKey)
                ? loopMs + sampleBlobHotspotDelayMs()
                : loopMs;
          }

          if (phaseKey === "hidden") {
            continue;
          }

          const vector = hotspotVectorRef.current;
          const shouldReseed =
            runtime.candidateIndex == null ||
            (hotspotPhaseUsesCycle(phaseKey) &&
              runtime.cycleDurationMs > 0 &&
              loopMs >= runtime.cycleStartAtMs + runtime.cycleDurationMs);

          if (shouldReseed) {
            runtime.candidateIndex = null;
            runtime.cycleDurationMs =
              hotspotPhaseUsesCycle(phaseKey)
                ? getBlobHotspotCycleDurationMs({
                    hotspotIndex,
                    isSingleVisible,
                    phaseKey,
                  })
                : 0;
            runtime.cycleStartAtMs =
              hotspotPhaseUsesCycle(phaseKey)
                ? loopMs + sampleBlobHotspotDelayMs()
                : loopMs;

            const reseeded = selectBlobHotspotCandidate({
              blobModel,
              camera: state.camera,
              centerLeftBand,
              hotspotIndex,
              lockLeftHalf,
              maxAttempts: shouldShowCard || shouldShowFocus ? 80 : 20,
              pinVerticalBand,
              scaleRange,
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

          if (phaseKey === "dot" && cycleEnvelope <= 0.001) {
            continue;
          }

          let projected = projectBlobHotspotCandidate({
            blobModel,
            camera: state.camera,
            candidateIndex: runtime.candidateIndex,
            centerLeftBand,
            height: state.size.height,
            hotspotIndex,
            lockLeftHalf,
            pinVerticalBand,
            scaleRange,
            source: pointSources.blob,
            vector,
            width: state.size.width,
          });
          if (!projected) {
            if (runtime.lastProjected && runtime.invalidSinceAtMs == null) {
              runtime.invalidSinceAtMs = loopMs;
            }
            const withinProjectionGrace =
              runtime.invalidSinceAtMs != null &&
              loopMs - runtime.invalidSinceAtMs < 240;

            if (
              (phaseKey === "card" || phaseKey === "focus") &&
              runtime.lastProjected &&
              withinProjectionGrace
            ) {
              projected = runtime.lastProjected;
            } else if (phaseKey === "card" || phaseKey === "focus") {
              runtime.candidateIndex = null;
              const reseeded = selectBlobHotspotCandidate({
                blobModel,
                camera: state.camera,
                centerLeftBand,
                hotspotIndex,
                lockLeftHalf,
                maxAttempts: 80,
                pinVerticalBand,
                scaleRange,
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
                  centerLeftBand,
                  height: state.size.height,
                  hotspotIndex,
                  lockLeftHalf,
                  pinVerticalBand,
                  scaleRange,
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
          runtime.invalidSinceAtMs = null;
          runtime.lastProjected = projected;

          frame.visible = true;
          frame.focusDismissProgress =
            phaseKey === "focus" && paperFocus > 0.001
              ? clamp01(1 - paperFocusWindow / paperFocus)
              : 0;
          frame.focusProgress = phaseKey === "focus" ? paperFocusWindow : 0;
          frame.mode = phaseKey;
          frame.color = getPointColorCss(pointSources.blob, projected.candidateIndex);
          if (phaseKey === "focus") {
            frame.opacity = focusOpacity * projected.scale;
            frame.scale = projected.scale;
            frame.x = projected.x;
            frame.y = projected.y;
          } else {
            frame.opacity =
              (shouldShowCard ? cardOpacity : dotOpacity * cycleEnvelope) *
              projected.scale;
            frame.scale = shouldShowCard
              ? projected.scale
              : projected.scale * cycleEnvelope;
            frame.x = projected.x;
            frame.y = projected.y;
          }
          frame.showCard = shouldShowCard;
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
          onMouseWrapperRef={(group) => {
            stageMouseWrapperRefs.current[itemId] = group;
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
