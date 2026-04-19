"use client";

// Maze-native visual presets for ambient-field stage items.
// Numeric values mirror scripts.pretty.js:42412-42543 (cs.default + cs.blob +
// cs.stream + cs.pcb). Color scalars are 0-255 for 1:1 dev cross-reference
// with the Maze uniforms `uRcolor`/`uGcolor`/`uBcolor`/`uRnoise`/`uGnoise`/
// `uBnoise`. See docs/map/ambient-field-maze-baseline-ledger-round-12.md §2-§3.

export type AmbientFieldVisualPreset = "blob" | "stream" | "pcb";
export type AmbientFieldStageItemId = AmbientFieldVisualPreset;
export type AmbientFieldPhaseId =
  | "paperHighlights"
  | "paperCards"
  | "paperFocus"
  | "detailInspection"
  | "synthesisLinks"
  | "reform";

type Vec3 = readonly [number, number, number];

export interface AmbientFieldShaderPreset {
  alpha: number;
  alphaMobile?: number;
  amplitude: number;
  // Maze color pair: base cyan -> noise magenta, both expressed as 0-255
  // scalars to match the Maze uniform shape exactly.
  rColor: number;
  gColor: number;
  bColor: number;
  rNoise: number;
  gNoise: number;
  bNoise: number;
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
  // Controller-plane (Phase 6) — kept on the preset so existing consumers
  // continue to work while `FieldController` is being built out.
  rotationVelocity: Vec3;
  sceneOffset: Vec3;
  sceneRotation: Vec3;
  sceneScale: number;
  sceneScaleMobile?: number;
  scrollRotation: Vec3;
  // `animateIn`/`animateOut` targets (Phase 6). For Phase 1 we initialize
  // them but the continuous frame loop does not yet consult these.
  alphaOut: number;
  amplitudeOut: number;
  depthOut: number;
  // Visibility carry window ("enter when scrollY + vh * entryFactor > y
  // && y + height > scrollY + vh * exitFactor"). Maze defaults are 0.5/0.5;
  // stream tightens to 0.7/0.3. Applied in Phase 6.
  entryFactor: number;
  exitFactor: number;
  // Whether idle +0.001 rad/frame wrapper spin is enabled. pcb and stream
  // default to false in Maze (rotate:false). Applied in Phase 6.
  rotate: boolean;
  // Whether animateIn adds a +pi wrapper rotation kickoff. Only `blob` in
  // Maze uses this pattern via bindScroll's own 0->pi model tween.
  rotateAnimation: boolean;
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
  phases: Record<AmbientFieldPhaseId, number>;
  processProgress: number;
  scrollProgress: number;
}

const ZERO_VEC3 = [0, 0, 0] as const satisfies Vec3;

// Maze cyan base (40, 197, 234) -> magenta noise (202, 50, 223).
// `scripts.pretty.js:42564-42569`.
const MAZE_BASE_R = 40;
const MAZE_BASE_G = 197;
const MAZE_BASE_B = 234;
const MAZE_NOISE_R = 202;
const MAZE_NOISE_G = 50;
const MAZE_NOISE_B = 223;

export const AMBIENT_FIELD_STAGE_ITEM_IDS = [
  "blob",
  "stream",
  "pcb",
] as const satisfies readonly AmbientFieldStageItemId[];

export const AMBIENT_FIELD_PHASE_IDS = [
  "paperHighlights",
  "paperCards",
  "paperFocus",
  "detailInspection",
  "synthesisLinks",
  "reform",
] as const satisfies readonly AmbientFieldPhaseId[];

export const visualPresets: Record<
  AmbientFieldVisualPreset,
  AmbientFieldVisualPresetConfig
> = {
  blob: {
    // Maze: cs.blob extends cs.default with uFrequency 0.7, uAmplitude 0.4,
    // uDepth 0.5, uSize 10. scripts.pretty.js:42420-42443.
    sceneScale: 0.75,
    sceneScaleMobile: 0.55,
    sceneOffset: [0, -0.02, 0],
    sceneRotation: [0, 0, 0],
    rotationVelocity: [0, 0.06, 0],
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
      amplitude: 0.4,
      rColor: MAZE_BASE_R,
      gColor: MAZE_BASE_G,
      bColor: MAZE_BASE_B,
      rNoise: MAZE_NOISE_R,
      gNoise: MAZE_NOISE_G,
      bNoise: MAZE_NOISE_B,
      depth: 0.5,
      frequency: 0.7,
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
      rColor: MAZE_BASE_R,
      gColor: MAZE_BASE_G,
      bColor: MAZE_BASE_B,
      rNoise: MAZE_NOISE_R,
      gNoise: MAZE_NOISE_G,
      bNoise: MAZE_NOISE_B,
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
      rColor: MAZE_BASE_R,
      gColor: MAZE_BASE_G,
      bColor: MAZE_BASE_B,
      rNoise: MAZE_NOISE_R,
      gNoise: MAZE_NOISE_G,
      bNoise: MAZE_NOISE_B,
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
    activeSectionId: "section-welcome",
    scrollProgress: 0,
    processProgress: 0,
    motionEnabled: true,
    phases: {
      paperHighlights: 0,
      paperCards: 0,
      paperFocus: 0,
      detailInspection: 0,
      synthesisLinks: 0,
      reform: 0,
    },
    items: {
      blob: createStageItemState(1, 0, 1),
      stream: createStageItemState(),
      pcb: createStageItemState(),
    },
  };
}

export const DEFAULT_AMBIENT_FIELD_SCENE = createAmbientFieldSceneState();
export const DEFAULT_AMBIENT_FIELD_ROTATION = ZERO_VEC3;
