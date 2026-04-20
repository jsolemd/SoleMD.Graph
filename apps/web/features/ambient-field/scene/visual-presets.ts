"use client";

import { LANDING_BASE_BLUE, LANDING_RAINBOW_RGB } from "./accent-palette";

// Maze-native visual presets for ambient-field stage items.
// Scalar uniforms mirror `scripts.pretty.js:42412-42543` (cs.default +
// cs.blob + cs.stream + cs.pcb). Colors are a single (base, noise) pair
// per preset that feeds Maze's binary-lerp shape in the shader:
//   vColor = base + clamp(vNoise, 0, 1) * 4 * (noise - base)
// Effective Maze defaults: size=8, depth=0.3, amplitude=0.05, depthOut=10,
// amplitudeOut=4, entryFactor=0.5, exitFactor=0.5.
// See `scene/accent-palette.ts` and `renderer/field-shaders.ts`.

export type AmbientFieldVisualPreset = "blob" | "stream" | "pcb";
export type AmbientFieldStageItemId = AmbientFieldVisualPreset;

type Vec3 = readonly [number, number, number];

export interface AmbientFieldShaderPreset {
  alpha: number;
  alphaMobile?: number;
  // Diagram-beat alpha floor. BlobController's scroll timeline fades
  // `uAlpha` from 1 to this value (instead of Maze's 0) at the diagram
  // label so the silhouette stays readable the whole way through the
  // story. Stream/pcb carry 0 (timeline-inert).
  alphaDiagramFloor: number;
  amplitude: number;
  // 0-255 RGB pair feeding the shader's Maze single-pair lerp.
  // `colorBase` stays fixed per preset; `colorNoise` is the seed value,
  // which BlobController tweens through `LANDING_RAINBOW_RGB` at runtime.
  colorBase: Vec3;
  colorNoise: Vec3;
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
  // Hotspot-beat selection floor. BlobController's timeline fades
  // `uSelection` from 1 to this value (instead of Maze's 0.3) at the
  // hotspots+=1.4 beat so only the top ~15% of particles dim out. A
  // restore tween at the respond beat brings it back to 1 for the rest
  // of the story.
  selectionHotspotFloor: number;
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
// (`scripts.pretty.js:42564-42569`). Used by stream/pcb for 1:1 parity
// with Maze's default material look.
const MAZE_CYAN: Vec3 = [40, 197, 234];
const MAZE_MAGENTA: Vec3 = [202, 50, 223];

// First rainbow stop doubles as the blob's initial `colorNoise` before
// BlobController's runtime timeline takes over.
const LANDING_INITIAL_NOISE: Vec3 = LANDING_RAINBOW_RGB[0]!;

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
    // uDepth 0.3, uSize 8 at scripts.pretty.js:42427-42433.
    // LANDING_BLOB_CHAPTER's `start-frequency` event ramps 0.5 → 1.7 at
    // chapter head, per scripts.pretty.js:43291-43304.
    sceneScale: 0.75,
    sceneScaleMobile: 0.55,
    sceneOffset: [0, -0.02, 0],
    sceneRotation: [0, 0, 0],
    // Maze's idle spin is `wrapper.rotation.y += 0.001` per frame
    // (scripts.pretty.js:43048). At 60fps that's 0.06 rad/sec, which is
    // what we drive here. One full revolution lands at ~104s. Using 0.12
    // was a 2x drift from Maze during Round 12 rebuild.
    rotationVelocity: [0, 0.06, 0],
    scrollRotation: [0, Math.PI, 0],
    alphaOut: 0,
    // User-locked deviation 2026-04-19: keep blob points visible through
    // the detail story instead of dissolving to Maze's 4 / 10 out-values.
    amplitudeOut: 0.8,
    depthOut: 1.0,
    entryFactor: 0.5,
    exitFactor: 0.5,
    rotate: true,
    rotateAnimation: false,
    shader: {
      alpha: 1,
      alphaMobile: 1,
      alphaDiagramFloor: 0.22,
      amplitude: 0.05,
      colorBase: LANDING_BASE_BLUE,
      colorNoise: LANDING_INITIAL_NOISE,
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
      selectionHotspotFloor: 0.85,
      size: 8,
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
      alphaDiagramFloor: 0,
      amplitude: 0.05,
      colorBase: MAZE_CYAN,
      colorNoise: MAZE_MAGENTA,
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
      selectionHotspotFloor: 0.3,
      size: 10,
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
    scrollRotation: ZERO_VEC3,
    alphaOut: 0,
    // User-locked deviation 2026-04-19: keep the closing pcb surface flat
    // until the end-state object-formation product surface exists.
    amplitudeOut: 0.05,
    depthOut: 0.3,
    entryFactor: 0.5,
    exitFactor: 0.5,
    rotate: false,
    rotateAnimation: false,
    shader: {
      alpha: 1,
      alphaMobile: 1,
      alphaDiagramFloor: 0,
      amplitude: 0.05,
      colorBase: MAZE_CYAN,
      colorNoise: MAZE_MAGENTA,
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
      selectionHotspotFloor: 0.3,
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
