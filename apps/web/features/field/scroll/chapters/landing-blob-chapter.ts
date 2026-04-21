import { tnEase } from "../../controller/FieldController";
import type { FieldSceneState } from "../../scene/visual-presets";
import { visualPresets } from "../../scene/visual-presets";
import { getFieldChapterProgress } from "../field-scroll-state";
import {
  createFieldChapterTimeline,
  type FieldChapterValueMap,
} from "../field-chapter-timeline";

type LandingBlobChapterKey =
  | "alpha"
  | "amplitude"
  | "depth"
  | "frequency"
  | "hotspotMaxNumber"
  | "hotspotOnlyReds"
  | "hotspotOpacity"
  | "modelPositionY"
  | "modelRotationY"
  | "selection"
  | "wrapperScale";

export type LandingBlobChapterState = FieldChapterValueMap<LandingBlobChapterKey>;

const blobPreset = visualPresets.blob;

const baseBlobState: LandingBlobChapterState = {
  alpha: blobPreset.shader.alpha,
  amplitude: blobPreset.shader.amplitude,
  depth: blobPreset.shader.depth,
  frequency: blobPreset.shader.frequency,
  hotspotMaxNumber: 0,
  hotspotOnlyReds: 0,
  hotspotOpacity: 0,
  modelPositionY: 0,
  modelRotationY: 0,
  selection: blobPreset.shader.selection,
  wrapperScale: 1,
};

const heroTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.72,
    to: {
      modelRotationY: Math.PI * 0.08,
    },
  },
]);

const surfaceRailTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.42,
    to: {
      modelRotationY: Math.PI * 0.14,
    },
  },
  {
    atProgress: 0.42,
    duration: 0.34,
    to: {
      modelRotationY: Math.PI * 0.18,
    },
  },
]);

const storyOneTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.16,
    to: {
      frequency: 1.7,
      modelRotationY: Math.PI * 0.24,
    },
  },
  {
    atProgress: 0.12,
    duration: 0.18,
    to: {
      amplitude: 0.25,
      modelRotationY: Math.PI * 0.26,
    },
  },
  {
    atProgress: 0.2,
    duration: 0.08,
    to: {
      hotspotOpacity: 1,
      hotspotMaxNumber: 3,
      modelRotationY: Math.PI * 0.28,
    },
  },
  {
    atProgress: 0.34,
    duration: 0.12,
    to: {
      hotspotMaxNumber: 24,
      modelRotationY: Math.PI * 0.31,
      selection: blobPreset.shader.selectionHotspotFloor,
    },
  },
  {
    atProgress: 0.48,
    duration: 0.16,
    to: {
      alpha: blobPreset.shader.alphaDiagramFloor,
      amplitude: 0.5,
      depth: 1,
      modelRotationY: Math.PI * 0.33,
      wrapperScale: 1.72,
    },
  },
  {
    atProgress: 0.7,
    duration: 0.16,
    ease: tnEase,
    to: {
      alpha: 0.78,
      hotspotOpacity: 0,
      modelRotationY: Math.PI * 0.35,
      selection: 1,
      wrapperScale: 1.18,
    },
  },
  { atProgress: 0.78, duration: 0.12, to: { hotspotMaxNumber: 0 } },
]);

const storyTwoTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.26,
    to: {
      alpha: 0.62,
      amplitude: 0.34,
      depth: 0.84,
      modelRotationY: Math.PI * 0.35,
      wrapperScale: 1.28,
    },
  },
  {
    atProgress: 0.56,
    duration: 0.24,
    to: {
      alpha: 0.74,
      amplitude: 0.28,
      wrapperScale: 1.18,
    },
  },
]);

const storyThreeTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.2,
    to: {
      alpha: 0.88,
      amplitude: 0.42,
      frequency: 1.9,
      wrapperScale: 1.34,
    },
  },
  {
    atProgress: 0.32,
    duration: 0.28,
    to: {
      alpha: 0.94,
      amplitude: 0.3,
      modelRotationY: Math.PI * 0.56,
      wrapperScale: 1.22,
    },
  },
  {
    atProgress: 0.68,
    duration: 0.18,
    to: {
      alpha: 0.86,
      amplitude: 0.24,
    },
  },
]);

const sequenceTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.24,
    to: {
      alpha: 0.92,
      amplitude: 0.22,
      frequency: 1.45,
      wrapperScale: 1.12,
    },
  },
  {
    atProgress: 0.5,
    duration: 0.2,
    to: {
      alpha: 0.86,
      amplitude: 0.18,
    },
  },
]);

const mobileCarryTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.34,
    to: {
      alpha: 0.74,
      amplitude: 0.16,
      frequency: 1.1,
      wrapperScale: 1.06,
    },
  },
]);

const ctaTimeline = createFieldChapterTimeline<LandingBlobChapterKey>([
  {
    atProgress: 0,
    duration: 0.26,
    to: {
      alpha: 1,
      amplitude: 0.46,
      depth: 0.9,
      frequency: 1.75,
      modelRotationY: Math.PI * 0.9,
      wrapperScale: 1.24,
    },
  },
  {
    atProgress: 0.32,
    duration: 0.3,
    ease: tnEase,
    to: {
      alpha: blobPreset.shader.alpha,
      amplitude: blobPreset.shader.amplitude,
      depth: blobPreset.shader.depth,
      frequency: blobPreset.shader.frequency,
      modelPositionY: 0,
      modelRotationY: Math.PI * 1.04,
      selection: 1,
      wrapperScale: 1,
    },
  },
  {
    atProgress: 0.64,
    duration: 0.18,
    to: {
      amplitude: blobPreset.shader.amplitude,
      depth: blobPreset.shader.depth,
      frequency: blobPreset.shader.frequency,
      modelRotationY: 0,
      wrapperScale: 1,
    },
  },
]);

export function resolveLandingBlobChapterState(
  sceneState: FieldSceneState,
): LandingBlobChapterState {
  let next = { ...baseBlobState };

  next = heroTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-hero"),
  );
  next = surfaceRailTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-surface-rail"),
  );
  next = storyOneTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-story-1"),
  );
  next = storyTwoTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-story-2"),
  );
  next = storyThreeTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-story-3"),
  );
  next = sequenceTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-sequence"),
  );
  next = mobileCarryTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-mobile-carry"),
  );
  next = ctaTimeline.sample(
    next,
    getFieldChapterProgress(sceneState, "section-cta"),
  );

  return next;
}
