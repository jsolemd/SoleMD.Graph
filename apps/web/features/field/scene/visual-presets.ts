"use client";

import { LANDING_BASE_BLUE, LANDING_RAINBOW_RGB } from "./accent-palette";

// Maze-native visual presets for field stage items.
// Scalar uniforms mirror the historical scene config block at
// `scripts.pretty.js:42412-42543`. Colors are a single (base, noise) pair
// per preset that feeds Maze's binary-lerp shape in the shader:
//   vColor = base + clamp(vNoise, 0, 1) * 4 * (noise - base)
// Effective Maze defaults: size=8, depth=0.3, amplitude=0.05, depthOut=10,
// amplitudeOut=4, entryFactor=0.5, exitFactor=0.5.
// See `scene/accent-palette.ts` and `renderer/field-shaders.ts`.

export type FieldVisualPreset = "blob" | "stream" | "objectFormation";
export type FieldStageItemId = FieldVisualPreset;

type Vec3 = readonly [number, number, number];

export interface FieldShaderPreset {
  alpha: number;
  alphaMobile?: number;
  // Diagram-beat alpha floor. BlobController's scroll timeline fades
  // `uAlpha` from 1 to this value (instead of Maze's 0) at the diagram
  // label so the silhouette stays readable the whole way through the
  // story. Stream/objectFormation carry 0 (timeline-inert).
  alphaDiagramFloor: number;
  amplitude: number;
  // 0-255 RGB pair feeding the shader's Maze single-pair lerp.
  // `colorBase` stays fixed per preset; `colorNoise` is the seed value,
  // which BlobController tweens through `LANDING_RAINBOW_RGB` at runtime.
  colorBase: Vec3;
  colorNoise: Vec3;
  // Per-category selection floors. Each particle's `aBucket` tag (0 paper,
  // 1 entity, 2 relation, 3 evidence) resolves one of these floors; the
  // shader culls the particle unless its random `aSelection` score falls
  // below the chosen floor. Default 1 = every particle visible. Chapter
  // timelines tween individual floors down (e.g. papersSelection to 0.1
  // at Story 1 entrance) to light a category while leaving others ambient.
  papersSelection: number;
  entitiesSelection: number;
  relationsSelection: number;
  evidenceSelection: number;
  // Multiplicative boost applied to the deepest surviving particles.
  // `selectionBoostColor` multiplies vColor; `selectionBoostSize` scales
  // gl_PointSize. Defaults [255,255,255] and 1 are no-ops so the shader
  // reads identically to today until a chapter timeline drives them.
  selectionBoostColor: Vec3;
  selectionBoostSize: number;
  // Sequence info-7 cluster emergence. Modulates particle brightness
  // against the existing fbm noise field so neighborhoods emerge from
  // spatial/motion coherence rather than hard category borders. 0 = off.
  clusterEmergence: number;
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

export interface FieldVisualPresetConfig {
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
  // Idle +0.001 rad/frame wrapper spin. Maze stream and its closing
  // object-formation surface default to false (`rotate:false`).
  rotate: boolean;
  // Only `blob` in Maze uses the +pi wrapper rotation kickoff via its
  // bindScroll 0→pi model tween.
  rotateAnimation: boolean;
  shader: FieldShaderPreset;
}

export interface FieldStageItemState {
  emphasis: number;
  localProgress: number;
  visibility: number;
}

export interface FieldChapterState {
  isActive: boolean;
  progress: number;
  visibility: number;
}

export interface FieldSceneState {
  chapters: Record<string, FieldChapterState>;
  heroProgress: number;
  items: Record<FieldStageItemId, FieldStageItemState>;
  motionEnabled: boolean;
  /**
   * Slice B: hard-pause flag mirrored from `useShellStore.pauseMotion`.
   * Distinct from `motionEnabled` — when motionEnabled goes false, the
   * controllers still drift at the reduced-motion floor (motionScale =
   * 0.16). When `motionPaused` is true, controllers freeze time,
   * rotation, and the color cycle to zero.
   */
  motionPaused: boolean;
  /**
   * Slice B: user-facing global ambient tempo. Drives the per-controller
   * `uTime` accumulator and Blob's color-cycle GSAP `timeScale`.
   * Baseline 1.5 — both landing and orb run at 1.5× the legacy
   * elapsed-time rate; the slider scales around that (range [0.5, 3.0]).
   */
  motionSpeedMultiplier: number;
  /**
   * Slice B: user-facing rotation tempo. Multiplies orb wrapper auto-
   * rotation only. Default 1.0; range [0.0, 2.0].
   */
  rotationSpeedMultiplier: number;
  /**
   * Slice B: user-facing entropy / randomness. Multiplies the
   * `uAmplitude` blend target without re-seeding positions or flattening
   * the color-distribution frequency.
   * Default 1.0; range [0.0, 2.0]; capped at 1.0 under low-power.
   */
  ambientEntropy: number;
  /**
   * True while orb-mode camera is mounted (drei `<CameraControls>` active).
   * BlobController reads this to:
   *  - freeze galaxy world scale against a fixed reference camera distance
   *    instead of live `camera.position.z`, so dollying through the volume
   *    doesn't re-normalize the scene around the camera;
   *  - blend the point-size depth attenuation toward the orb fly-through
   *    target, making particles parallax instead of inflate;
   *  - switch wrapper rotation from clock-driven to delta-accumulated, so
   *    `orbInteracting` can pause it cleanly.
   */
  orbCameraActive: boolean;
  /**
   * True while the orb has a resolved clicked particle. G-lane texture values
   * stay per-particle; this scalar tells the shader that G=0 now means
   * "not focused" instead of the idle default.
   */
  orbFocusActive: boolean;
  /**
   * True between drei `<CameraControls>` `controlstart` and `controlend`
   * (drag / pinch only — wheel does not emit these). BlobController uses
   * this to suppress wrapper auto-rotation while the user is orbiting,
   * so two rotations don't compound into a sliding-plane feel.
   */
  orbInteracting: boolean;
}

const ZERO_VEC3 = [0, 0, 0] as const satisfies Vec3;

// Maze cyan base (40, 197, 234) → magenta noise (202, 50, 223) pair
// (`scripts.pretty.js:42564-42569`). Used by stream/objectFormation for 1:1 parity
// with Maze's default material look.
const MAZE_CYAN: Vec3 = [40, 197, 234];
const MAZE_MAGENTA: Vec3 = [202, 50, 223];

// No-op preset defaults for the Phase A1 per-category uniforms. Floors at
// 1 mean "let every particle through"; boost color [255,255,255] and size 1
// multiply to identity in the shader. Only chapter timelines drive these
// values away from identity, so any preset that omits them reads unchanged.
const PRESET_ALL_VISIBLE_FLOORS = {
  papersSelection: 1,
  entitiesSelection: 1,
  relationsSelection: 1,
  evidenceSelection: 1,
} as const;
const PRESET_BOOST_IDENTITY_COLOR: Vec3 = [255, 255, 255];
const PRESET_BOOST_IDENTITY_SIZE = 1;
const PRESET_CLUSTER_EMERGENCE_OFF = 0;

// First rainbow stop doubles as the blob's initial `colorNoise` before
// BlobController's runtime timeline takes over.
const LANDING_INITIAL_NOISE: Vec3 = LANDING_RAINBOW_RGB[0]!;

export const FIELD_STAGE_ITEM_IDS = [
  "blob",
  "stream",
  "objectFormation",
] as const satisfies readonly FieldStageItemId[];

export const visualPresets: Record<
  FieldVisualPreset,
  FieldVisualPresetConfig
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
      ...PRESET_ALL_VISIBLE_FLOORS,
      selectionBoostColor: PRESET_BOOST_IDENTITY_COLOR,
      selectionBoostSize: PRESET_BOOST_IDENTITY_SIZE,
      clusterEmergence: PRESET_CLUSTER_EMERGENCE_OFF,
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
      ...PRESET_ALL_VISIBLE_FLOORS,
      selectionBoostColor: PRESET_BOOST_IDENTITY_COLOR,
      selectionBoostSize: PRESET_BOOST_IDENTITY_SIZE,
      clusterEmergence: PRESET_CLUSTER_EMERGENCE_OFF,
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
  objectFormation: {
    // Historical closing-plane baseline with uFrequency 0.1,
    // uAmplitude 0.05, uSize 6,
    // rotation x:-80deg, position.z 0.3, scaleFactor 0.5.
    // scripts.pretty.js:42453-42466.
    sceneScale: 0.5,
    sceneScaleMobile: 0.5,
    sceneOffset: [0, 0, 0.3],
    sceneRotation: [(-80 * Math.PI) / 180, 0, 0],
    rotationVelocity: ZERO_VEC3,
    scrollRotation: ZERO_VEC3,
    alphaOut: 0,
    // User-locked deviation 2026-04-19: keep the closing object-formation
    // surface flat until the fully authored end-state formation surface exists.
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
      ...PRESET_ALL_VISIBLE_FLOORS,
      selectionBoostColor: PRESET_BOOST_IDENTITY_COLOR,
      selectionBoostSize: PRESET_BOOST_IDENTITY_SIZE,
      clusterEmergence: PRESET_CLUSTER_EMERGENCE_OFF,
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
): FieldStageItemState {
  return {
    emphasis,
    localProgress,
    visibility,
  };
}

export function createFieldSceneState(): FieldSceneState {
  return {
    chapters: {},
    heroProgress: 0,
    motionEnabled: true,
    motionPaused: false,
    motionSpeedMultiplier: 1.5,
    rotationSpeedMultiplier: 1,
    ambientEntropy: 1,
    orbCameraActive: false,
    orbFocusActive: false,
    orbInteracting: false,
    items: {
      blob: createStageItemState(1, 0, 1),
      stream: createStageItemState(),
      objectFormation: createStageItemState(),
    },
  };
}

export const DEFAULT_FIELD_SCENE = createFieldSceneState();
export const DEFAULT_FIELD_ROTATION = ZERO_VEC3;
