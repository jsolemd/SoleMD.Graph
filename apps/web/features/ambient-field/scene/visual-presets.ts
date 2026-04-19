"use client";

import {
  semanticColorFallbackHexByKey,
  semanticColorVarNameByKey,
} from "@/lib/pastel-tokens";

export type AmbientFieldVisualPreset = "blob" | "stream" | "pcb";
export type AmbientFieldStageItemId = AmbientFieldVisualPreset;

type ColorToken = {
  cssVarName: string;
  fallbackHex: string;
};

type Vec3 = readonly [number, number, number];

export interface AmbientFieldShaderPreset {
  alpha: number;
  alphaMobile?: number;
  amplitude: number;
  colorBase: ColorToken;
  colorNoise: ColorToken;
  depth: number;
  frequency: number;
  funnelDistortion: number;
  funnelEnd: number;
  funnelEndShift: number;
  funnelNarrow: number;
  funnelStart: number;
  funnelStartShift: number;
  funnelThick: number;
  height: number;
  selection: number;
  size: number;
  sizeMobile?: number;
  speed: number;
  stream: number;
  width: number;
}

export interface AmbientFieldVisualPresetConfig {
  rotationVelocity: Vec3;
  sceneOffset: Vec3;
  sceneRotation: Vec3;
  sceneScale: number;
  sceneScaleMobile?: number;
  scrollRotation: Vec3;
  shader: AmbientFieldShaderPreset;
}

export interface AmbientFieldStageItemState {
  emphasis: number;
  localProgress: number;
  visibility: number;
}

export interface AmbientFieldSceneState {
  activeSectionId: string;
  items: Record<AmbientFieldStageItemId, AmbientFieldStageItemState>;
  motionEnabled: boolean;
  processProgress: number;
  scrollProgress: number;
}

const semanticToken = (
  key: keyof typeof semanticColorVarNameByKey,
): ColorToken => ({
  cssVarName: semanticColorVarNameByKey[key],
  fallbackHex: semanticColorFallbackHexByKey[key],
});

const ZERO_VEC3 = [0, 0, 0] as const satisfies Vec3;
const SHARED_PARTICLE_BASE = semanticToken("phys");
const SHARED_PARTICLE_NOISE = semanticToken("section");

export const AMBIENT_FIELD_STAGE_ITEM_IDS = [
  "blob",
  "stream",
  "pcb",
] as const satisfies readonly AmbientFieldStageItemId[];

export const visualPresets: Record<
  AmbientFieldVisualPreset,
  AmbientFieldVisualPresetConfig
> = {
  blob: {
    sceneScale: 0.75,
    sceneScaleMobile: 0.55,
    sceneOffset: [0, -0.02, 0],
    sceneRotation: [0, 0, 0],
    rotationVelocity: [0.004, 0.085, 0.004],
    scrollRotation: [0, 0.38, 0],
    shader: {
      alpha: 1,
      alphaMobile: 1,
      amplitude: 0.05,
      colorBase: SHARED_PARTICLE_BASE,
      colorNoise: SHARED_PARTICLE_NOISE,
      depth: 0.3,
      frequency: 0.5,
      funnelDistortion: 0,
      funnelEnd: 0,
      funnelEndShift: 0,
      funnelNarrow: 0,
      funnelStart: 0,
      funnelStartShift: 0,
      funnelThick: 0,
      height: 0,
      selection: 1,
      size: 8,
      sizeMobile: 5.6,
      speed: 1,
      stream: 0,
      width: 0,
    },
  },
  stream: {
    sceneScale: 0.85,
    sceneScaleMobile: 1,
    sceneOffset: [0.12, -0.02, 0],
    sceneRotation: [0, 0, 0],
    rotationVelocity: ZERO_VEC3,
    scrollRotation: ZERO_VEC3,
    shader: {
      alpha: 1,
      alphaMobile: 1,
      amplitude: 0.05,
      colorBase: SHARED_PARTICLE_BASE,
      colorNoise: SHARED_PARTICLE_NOISE,
      depth: 0.69,
      frequency: 1.7,
      funnelDistortion: 1,
      funnelEnd: 0.3,
      funnelEndShift: 0,
      funnelNarrow: 0,
      funnelStart: -0.18,
      funnelStartShift: 0,
      funnelThick: 0,
      height: 0.4,
      selection: 1,
      size: 10,
      sizeMobile: 6.6,
      speed: 1,
      stream: 1,
      width: 2,
    },
  },
  pcb: {
    sceneScale: 0.5,
    sceneScaleMobile: 0.5,
    sceneOffset: [0, 0, 0.3],
    sceneRotation: [-1.3962634016, 0, 0],
    rotationVelocity: ZERO_VEC3,
    scrollRotation: [0, 0.12, 0],
    shader: {
      alpha: 0.9,
      alphaMobile: 0.82,
      amplitude: 0.05,
      colorBase: SHARED_PARTICLE_BASE,
      colorNoise: SHARED_PARTICLE_NOISE,
      depth: 0.3,
      frequency: 0.1,
      funnelDistortion: 0,
      funnelEnd: 0,
      funnelEndShift: 0,
      funnelNarrow: 0,
      funnelStart: 0,
      funnelStartShift: 0,
      funnelThick: 0,
      height: 0,
      selection: 1,
      size: 6,
      sizeMobile: 4.4,
      speed: 1,
      stream: 0,
      width: 0,
    },
  },
};

function createStageItemState(
  visibility = 0,
  localProgress = 0,
  emphasis = 0,
): AmbientFieldStageItemState {
  return {
    emphasis,
    localProgress,
    visibility,
  };
}

export function createAmbientFieldSceneState(): AmbientFieldSceneState {
  return {
    activeSectionId: "section-welcome",
    scrollProgress: 0,
    processProgress: 0,
    motionEnabled: true,
    items: {
      blob: createStageItemState(1, 0, 1),
      stream: createStageItemState(),
      pcb: createStageItemState(),
    },
  };
}

export const DEFAULT_AMBIENT_FIELD_SCENE = createAmbientFieldSceneState();
export const DEFAULT_AMBIENT_FIELD_ROTATION = ZERO_VEC3;
