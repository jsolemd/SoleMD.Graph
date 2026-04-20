"use client";

import {
  LANDING_BUCKET_BASES_RGB,
  LANDING_BUCKET_NOISES_RGB,
} from "./accent-palette";

// Maze-native visual presets for ambient-field stage items.
// Scalar uniforms mirror `scripts.pretty.js:42412-42543` (cs.default +
// cs.blob + cs.stream + cs.pcb). Colors are paired base/noise arrays
// (0-255 per channel) that feed the shader's paired binary lerp — see
// `scene/accent-palette.ts` and `renderer/field-shaders.ts`.

export type AmbientFieldVisualPreset = "blob" | "stream" | "pcb";
export type AmbientFieldStageItemId = AmbientFieldVisualPreset;

type Vec3 = readonly [number, number, number];
type BucketPairArray = readonly [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];

export interface AmbientFieldShaderPreset {
  alpha: number;
  alphaMobile?: number;
  amplitude: number;
  // Paired binary color contract. Each slot is one (base, noise) pair
  // feeding the shader's `base + clamp(vNoise,0,1) * 4 * (noise - base)`
  // lerp. Eight slots so the rainbow palette can live on-field in a
  // single frame via `int b = int(aBucket) % 8`. Values are 0-255 for
  // readability against Maze palette notes.
  bucketBases: BucketPairArray;
  bucketNoises: BucketPairArray;
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
  alphaOut: number;
  amplitudeOut: number;
  depthOut: number;
  // Visibility carry window: enter when scrollY + vh * entryFactor > y
  // && y + height > scrollY + vh * exitFactor. Maze defaults are 0.5/0.5;
  // stream tightens to 0.7/0.3.
  entryFactor: number;
  exitFactor: number;
  // Idle +0.001 rad/frame wrapper spin. Maze pcb and stream default to
  // false (rotate:false).
  rotate: boolean;
  // Only `blob` in Maze uses the +pi wrapper rotation kickoff via its
  // bindScroll 0→pi model tween.
  rotateAnimation: boolean;
  shader: AmbientFieldShaderPreset;
}

export interface AmbientFieldStageItemState {
  emphasis: number;
  localProgress: number;
  visibility: number;
}

export interface AmbientFieldSceneState {
  items: Record<AmbientFieldStageItemId, AmbientFieldStageItemState>;
  motionEnabled: boolean;
}

const ZERO_VEC3 = [0, 0, 0] as const satisfies Vec3;

// Maze cyan base (40, 197, 234) → magenta noise (202, 50, 223) pair
// (`scripts.pretty.js:42564-42569`). Repeated across all 8 slots so every
// particle lerps cyan→magenta exactly like Maze's six-scalar family. The
// blob layer replaces these with the full landing rainbow at preset
// attach (see `scene/accent-palette.ts`).
const MAZE_CYAN: Vec3 = [40, 197, 234];
const MAZE_MAGENTA: Vec3 = [202, 50, 223];
const MAZE_BASES: BucketPairArray = [
  MAZE_CYAN, MAZE_CYAN, MAZE_CYAN, MAZE_CYAN,
  MAZE_CYAN, MAZE_CYAN, MAZE_CYAN, MAZE_CYAN,
];
const MAZE_NOISES: BucketPairArray = [
  MAZE_MAGENTA, MAZE_MAGENTA, MAZE_MAGENTA, MAZE_MAGENTA,
  MAZE_MAGENTA, MAZE_MAGENTA, MAZE_MAGENTA, MAZE_MAGENTA,
];

function toBucketPair(
  rgb: readonly (readonly [number, number, number])[],
): BucketPairArray {
  if (rgb.length < 8) {
    throw new Error(`bucket pair array must have 8 slots, got ${rgb.length}`);
  }
  return [
    rgb[0]!, rgb[1]!, rgb[2]!, rgb[3]!,
    rgb[4]!, rgb[5]!, rgb[6]!, rgb[7]!,
  ];
}

const LANDING_BASES = toBucketPair(LANDING_BUCKET_BASES_RGB);
const LANDING_NOISES = toBucketPair(LANDING_BUCKET_NOISES_RGB);

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
    // Maze: cs.blob extends cs.default with uFrequency 0.5, uAmplitude 0.05,
    // uDepth 0.3, uSize 10 at scripts.pretty.js:42427-42433.
    // LANDING_BLOB_CHAPTER's `start-frequency` event ramps 0.5 → 1.7 at
    // chapter head, per scripts.pretty.js:43291-43304.
    sceneScale: 0.75,
    sceneScaleMobile: 0.55,
    sceneOffset: [0, -0.02, 0],
    sceneRotation: [0, 0, 0],
    rotationVelocity: [0, 0.12, 0],
    scrollRotation: [0, Math.PI, 0],
    alphaOut: 0,
    amplitudeOut: 0.8,
    depthOut: 1.0,
    entryFactor: 0.5,
    exitFactor: 0.5,
    rotate: true,
    rotateAnimation: false,
    shader: {
      alpha: 1,
      alphaMobile: 1,
      amplitude: 0.05,
      // Blob carries the landing rainbow so the full wheel is on-field at
      // rest; stream/pcb stay on the Maze cyan→magenta pair below for
      // 1:1 parity with Maze's look.
      bucketBases: LANDING_BASES,
      bucketNoises: LANDING_NOISES,
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
      size: 10,
      sizeMobile: 6,
      speed: 1,
      stream: 0,
      width: 0,
    },
  },
  stream: {
    // Maze: cs.stream with uFrequency 1.7, uAmplitude 0.05, uDepth 0.69,
    // uWidth 2, uHeight 0.4, uFunnelStart -0.18, uFunnelEnd 0.3.
    // scripts.pretty.js:42445-42452.
    sceneScale: 0.85,
    sceneScaleMobile: 1,
    sceneOffset: [0.12, -0.02, 0],
    sceneRotation: [0, 0, 0],
    rotationVelocity: ZERO_VEC3,
    scrollRotation: ZERO_VEC3,
    alphaOut: 0,
    amplitudeOut: 0.1,
    depthOut: 1.0,
    entryFactor: 0.7,
    exitFactor: 0.3,
    rotate: false,
    rotateAnimation: false,
    shader: {
      alpha: 1,
      alphaMobile: 1,
      amplitude: 0.05,
      bucketBases: MAZE_BASES,
      bucketNoises: MAZE_NOISES,
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
      size: 9,
      sizeMobile: 6,
      speed: 1,
      stream: 1,
      width: 2,
    },
  },
  pcb: {
    // Maze: cs.pcb with uFrequency 0.1, uAmplitude 0.05, uSize 6,
    // rotation x:-80deg, position.z 0.3, scaleFactor 0.5.
    // scripts.pretty.js:42453-42466.
    sceneScale: 0.5,
    sceneScaleMobile: 0.5,
    sceneOffset: [0, 0, 0.3],
    sceneRotation: [(-80 * Math.PI) / 180, 0, 0],
    rotationVelocity: ZERO_VEC3,
    scrollRotation: [0, 0.12, 0],
    alphaOut: 0,
    amplitudeOut: 0.05,
    depthOut: 0.3,
    entryFactor: 0.5,
    exitFactor: 0.5,
    rotate: false,
    rotateAnimation: false,
    shader: {
      alpha: 1,
      alphaMobile: 1,
      amplitude: 0.05,
      bucketBases: MAZE_BASES,
      bucketNoises: MAZE_NOISES,
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
      sizeMobile: 4,
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
