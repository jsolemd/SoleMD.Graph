// Ambient-field public surface. Every Round 12 primitive ships through
// this barrel; downstream modules should import exclusively from
// `@/features/ambient-field` rather than reaching into the subpaths.

// Scene / presets
export {
  AMBIENT_FIELD_PHASE_IDS,
  AMBIENT_FIELD_STAGE_ITEM_IDS,
  DEFAULT_AMBIENT_FIELD_ROTATION,
  DEFAULT_AMBIENT_FIELD_SCENE,
  createAmbientFieldSceneState,
  visualPresets,
  type AmbientFieldPhaseId,
  type AmbientFieldSceneState,
  type AmbientFieldShaderPreset,
  type AmbientFieldStageItemId,
  type AmbientFieldStageItemState,
  type AmbientFieldVisualPreset,
  type AmbientFieldVisualPresetConfig,
} from "./scene/visual-presets";

export { PHASE_TO_BUCKET, SOLEMD_BURST_COLORS } from "./scene/burst-config";

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
export { FieldScene, type AmbientFieldHotspotFrame } from "./renderer/FieldScene";
export { FIELD_VERTEX_SHADER, FIELD_FRAGMENT_SHADER } from "./renderer/field-shaders";
export {
  getAmbientFieldElapsedMs,
  getAmbientFieldElapsedSeconds,
  __resetAmbientFieldLoopClockForTests,
} from "./renderer/field-loop-clock";
export {
  attachMouseParallax,
  type MouseParallaxOptions,
} from "./renderer/mouse-parallax-wrapper";
export {
  createBurstController,
  type BurstController,
  type BurstControllerOptions,
  type BurstUniformKey,
} from "./renderer/burst-controller";

// Controllers
export {
  FieldController,
  tnEase,
  type FieldControllerAttachment,
  type FieldControllerInit,
} from "./controller/FieldController";
export { BlobController, type BlobHotspotState } from "./controller/BlobController";
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

// Scroll primitives
export {
  createUniformScrubber,
  type UniformScrubber,
  type UniformScrubberOptions,
} from "./scroll/ambient-field-uniform-scrubber";
export {
  createFieldChapterTimeline,
  type ChapterEvent,
  type FieldChapterTimeline,
  type FieldChapterTimelineOptions,
} from "./scroll/field-chapter-timeline";
export {
  LANDING_BLOB_CHAPTER,
  type LandingBlobChapterKey,
} from "./scroll/chapters/landing-blob-chapter";
export {
  LANDING_PCB_CHAPTER,
  type LandingPcbChapterKey,
} from "./scroll/chapters/landing-pcb-chapter";
export {
  LANDING_STREAM_CHAPTER,
  type LandingStreamChapterKey,
} from "./scroll/chapters/landing-stream-chapter";

// Surfaces
export { AmbientFieldLandingPage } from "./surfaces/AmbientFieldLandingPage";
