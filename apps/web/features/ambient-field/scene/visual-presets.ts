"use client";

import {
  brandPastelFallbackHexByKey,
  brandPastelVarNameByKey,
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

const brandToken = (
  key: keyof typeof brandPastelVarNameByKey,
): ColorToken => ({
  cssVarName: brandPastelVarNameByKey[key],
  fallbackHex: brandPastelFallbackHexByKey[key],
});

const semanticToken = (
  key: keyof typeof semanticColorVarNameByKey,
): ColorToken => ({
  cssVarName: semanticColorVarNameByKey[key],
  fallbackHex: semanticColorFallbackHexByKey[key],
});

const ZERO_VEC3 = [0, 0, 0] as const satisfies Vec3;

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
    sceneScale: 4.35,
    sceneScaleMobile: 3.2,
    sceneOffset: [0.1, 0.24, -0.65],
    sceneRotation: [0.24, 0.08, -0.05],
    rotationVelocity: [0.018, 0.11, 0.012],
    scrollRotation: [0.06, 0.92, 0.04],
    shader: {
      alpha: 1,
      alphaMobile: 1,
      amplitude: 0.05,
      colorBase: brandToken("soft-blue"),
      colorNoise: brandToken("soft-lavender"),
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
      selection: 0.74,
      size: 5.8,
      sizeMobile: 3.9,
      speed: 0.58,
      stream: 0,
      width: 0,
    },
  },
  stream: {
    sceneScale: 2.3,
    sceneScaleMobile: 2.7,
    sceneOffset: [0.2, -0.18, -0.35],
    sceneRotation: [0.0, 0.1, -0.04],
    rotationVelocity: [0.008, 0.024, 0.012],
    scrollRotation: [0.04, 0.34, 0.16],
    shader: {
      alpha: 1,
      alphaMobile: 1,
      amplitude: 0.05,
      colorBase: brandToken("soft-blue"),
      colorNoise: brandToken("golden-yellow"),
      depth: 0.69,
      frequency: 1.7,
      funnelDistortion: 0.92,
      funnelEnd: 0.42,
      funnelEndShift: -0.1,
      funnelNarrow: -0.18,
      funnelStart: -0.24,
      funnelStartShift: 0.08,
      funnelThick: 0.08,
      height: 0.42,
      selection: 0.92,
      size: 7.2,
      sizeMobile: 4.8,
      speed: 0.72,
      stream: 1,
      width: 4,
    },
  },
  pcb: {
    sceneScale: 4.6,
    sceneScaleMobile: 4.2,
    sceneOffset: [0.0, -0.06, -0.48],
    sceneRotation: [0.08, -0.12, 0.0],
    rotationVelocity: [0.004, 0.04, 0.008],
    scrollRotation: [0.02, 0.46, 0.02],
    shader: {
      alpha: 0.9,
      alphaMobile: 0.82,
      amplitude: 0.05,
      colorBase: brandToken("muted-indigo"),
      colorNoise: semanticToken("paper"),
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
      selection: 0.86,
      size: 4.4,
      sizeMobile: 3.0,
      speed: 0.22,
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
