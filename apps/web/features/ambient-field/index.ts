// Ambient-field public surface. Downstream modules should import
// exclusively from `@/features/ambient-field` rather than reaching into
// subpaths.

// Scene / presets
export {
  AMBIENT_FIELD_STAGE_ITEM_IDS,
  DEFAULT_AMBIENT_FIELD_ROTATION,
  DEFAULT_AMBIENT_FIELD_SCENE,
  createAmbientFieldSceneState,
  visualPresets,
  type AmbientFieldSceneState,
  type AmbientFieldShaderPreset,
  type AmbientFieldStageItemId,
  type AmbientFieldStageItemState,
  type AmbientFieldVisualPreset,
  type AmbientFieldVisualPresetConfig,
} from "./scene/visual-presets";

export {
  LANDING_BUCKET_BASES_RGB,
  LANDING_BUCKET_NOISES_RGB,
  LANDING_RAINBOW_RGB,
  MAZE_DEFAULT_BASES_RGB,
  MAZE_DEFAULT_NOISES_RGB,
  SOLEMD_BURST_COLORS,
} from "./scene/accent-palette";

// Asset / point-source primitives
export {
  bakeFieldAttributes,
  buildBucketIndex,
  SOLEMD_DEFAULT_BUCKETS,
  type FieldAttributeBakeOptions,
  type FieldSemanticBucket,
} from "./asset/field-attribute-baker";

export {
  FieldGeometry,
  type ImageLikeData,
  type SphereGeometryOptions,
  type StreamGeometryOptions,
  type TextureGeometryOptions,
  type VerticesGeometryOptions,
} from "./asset/field-geometry";

export {
  createImagePointGeometry,
  type ImagePointSourceInput,
  type ImagePointSourceOptions,
} from "./asset/image-point-source";

export {
  createModelPointGeometry,
  type ModelPointSourceOptions,
} from "./asset/model-point-source";

export {
  AMBIENT_FIELD_BUCKET_INDEX,
  ambientFieldPointSourceRegistry,
  prewarmAmbientFieldPointSources,
  resolveAmbientFieldPointSources,
} from "./asset/point-source-registry";

export type {
  AmbientFieldBounds,
  AmbientFieldPointSource,
  AmbientFieldPointSourceBuffers,
  ResolveAmbientFieldPointSourcesOptions,
} from "./asset/point-source-types";

// Renderer primitives
export { FieldCanvas } from "./renderer/FieldCanvas";
export { FieldScene } from "./renderer/FieldScene";
export { FIELD_VERTEX_SHADER, FIELD_FRAGMENT_SHADER } from "./renderer/field-shaders";
export {
  fieldLoopClock,
  getAmbientFieldElapsedMs,
  getAmbientFieldElapsedSeconds,
  __resetAmbientFieldLoopClockForTests,
  type FieldLoopTick,
} from "./renderer/field-loop-clock";
export {
  attachMouseParallax,
  type MouseParallaxOptions,
} from "./renderer/mouse-parallax-wrapper";
// Controllers
export {
  ensureGsapScrollTriggerRegistered,
  FieldController,
  tnEase,
  type FieldControllerAttachment,
  type FieldControllerInit,
} from "./controller/FieldController";
export {
  BlobController,
  BLOB_HOTSPOT_CARD_COUNT,
  BLOB_HOTSPOT_COUNT,
  BLOB_HOTSPOT_IDS,
  INTRO_DEPTH_BOOST,
  INTRO_DURATION_SECONDS,
  getBlobHotspotCycleDurationMs,
  getBlobHotspotPulseEnvelope,
  projectBlobHotspotCandidate,
  selectBlobHotspotCandidate,
  type AmbientFieldHotspotFrame,
  type BlobHotspotState,
} from "./controller/BlobController";
export { StreamController } from "./controller/StreamController";
export { PcbController } from "./controller/PcbController";

// Overlay primitives
export {
  AmbientFieldHotspotRing,
  type AmbientFieldHotspotPhase,
  type AmbientFieldHotspotProjection,
  type AmbientFieldHotspotRingProps,
  type AmbientFieldHotspotVariant,
} from "./overlay/AmbientFieldHotspotRing";
export {
  createHotspotLifecycleController,
  HOTSPOT_CYCLE_DURATION_MS,
  type HotspotLifecycleController,
  type HotspotLifecycleControllerOptions,
  type HotspotRuntime,
  type HotspotSamplePosition,
} from "./overlay/ambient-field-hotspot-lifecycle";

// Scroll bootstrap
export {
  bindAmbientFieldControllers,
  registerAmbientFieldScrollTrigger,
  type BindAmbientFieldControllersOptions,
} from "./scroll/ambient-field-scroll-driver";

// Surfaces
export { AmbientFieldLandingPage } from "./surfaces/AmbientFieldLandingPage";
export {
  AmbientFieldHotspotPool,
  type AmbientFieldHotspotPoolProps,
} from "./surfaces/AmbientFieldLandingPage/AmbientFieldHotspotPool";
