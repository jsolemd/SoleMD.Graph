// Ambient-field public surface. Downstream modules should import
// exclusively from `@/features/field` rather than reaching into
// subpaths.

// Scene / presets
export {
  FIELD_STAGE_ITEM_IDS,
  DEFAULT_FIELD_ROTATION,
  DEFAULT_FIELD_SCENE,
  createFieldSceneState,
  visualPresets,
  type FieldChapterState,
  type FieldSceneState,
  type FieldShaderPreset,
  type FieldStageItemId,
  type FieldStageItemState,
  type FieldVisualPreset,
  type FieldVisualPresetConfig,
} from "./scene/visual-presets";

export {
  LANDING_BASE_BLUE,
  LANDING_RAINBOW_RGB,
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
  FIELD_BUCKET_INDEX,
  fieldPointSourceRegistry,
  prewarmFieldPointSources,
  resolveFieldPointSources,
} from "./asset/point-source-registry";

export type {
  FieldBounds,
  FieldPointSource,
  FieldPointSourceBuffers,
  ResolveFieldPointSourcesOptions,
} from "./asset/point-source-types";

// Renderer primitives
export { FieldCanvas } from "./renderer/FieldCanvas";
export { FieldScene } from "./renderer/FieldScene";
export { FIELD_VERTEX_SHADER, FIELD_FRAGMENT_SHADER } from "./renderer/field-shaders";
export {
  fieldLoopClock,
  getFieldElapsedMs,
  getFieldElapsedSeconds,
  __resetFieldLoopClockForTests,
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
  type FieldHotspotFrame,
  type BlobHotspotState,
} from "./controller/BlobController";
export { StreamController } from "./controller/StreamController";
export { ObjectFormationController } from "./controller/ObjectFormationController";

// Overlay primitives
export {
  FieldHotspotRing,
  type FieldHotspotPhase,
  type FieldHotspotProjection,
  type FieldHotspotRingProps,
  type FieldHotspotVariant,
} from "./overlay/FieldHotspotRing";
export {
  createHotspotLifecycleController,
  HOTSPOT_CYCLE_DURATION_MS,
  type HotspotLifecycleController,
  type HotspotLifecycleControllerOptions,
  type HotspotRuntime,
  type HotspotSamplePosition,
} from "./overlay/field-hotspot-lifecycle";

// Scroll bootstrap
export {
  bindFieldScrollState,
  getFieldChapterProgress,
  isFieldChapterActive,
  type BindFieldScrollStateOptions,
} from "./scroll/field-scroll-state";
export {
  bindFieldControllers,
  registerFieldScrollTrigger,
  type BindFieldControllersOptions,
} from "./scroll/field-scroll-driver";

// Surfaces
export { FieldLandingPage } from "./surfaces/FieldLandingPage";
export {
  FieldHotspotPool,
  type FieldHotspotPoolProps,
} from "./surfaces/FieldLandingPage/FieldHotspotPool";
