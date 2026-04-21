import type { FieldSceneState } from "../../scene/visual-presets";
import { visualPresets } from "../../scene/visual-presets";
import { getFieldChapterProgress } from "../field-scroll-state";
import {
  createFieldChapterTimeline,
  type FieldChapterValueMap,
} from "../field-chapter-timeline";

type LandingStreamChapterKey =
  | "alpha"
  | "amplitude"
  | "depth"
  | "frequency"
  | "selection"
  | "wrapperZ";

export type LandingStreamChapterState =
  FieldChapterValueMap<LandingStreamChapterKey>;

const streamPreset = visualPresets.stream;

const baseStreamState: LandingStreamChapterState = {
  alpha: streamPreset.shader.alpha,
  amplitude: streamPreset.shader.amplitude,
  depth: streamPreset.shader.depth,
  frequency: streamPreset.shader.frequency,
  selection: streamPreset.shader.selection,
  wrapperZ: -520,
};

const storyTwoTimeline = createFieldChapterTimeline<LandingStreamChapterKey>([
  {
    atProgress: 0,
    duration: 0.28,
    to: {
      alpha: 0.92,
      depth: 0.82,
      frequency: 1.85,
      wrapperZ: -220,
    },
  },
  {
    atProgress: 0.48,
    duration: 0.28,
    to: {
      alpha: 1,
      wrapperZ: -90,
    },
  },
]);

const storyThreeTimeline = createFieldChapterTimeline<LandingStreamChapterKey>([
  {
    atProgress: 0,
    duration: 0.32,
    to: {
      alpha: 1,
      amplitude: 0.06,
      depth: 0.9,
      frequency: 1.95,
      wrapperZ: 0,
    },
  },
]);

const sequenceTimeline = createFieldChapterTimeline<LandingStreamChapterKey>([
  {
    atProgress: 0,
    duration: 0.24,
    to: {
      alpha: 0.92,
      amplitude: 0.05,
      frequency: 1.78,
      wrapperZ: 24,
    },
  },
]);

const mobileCarryTimeline = createFieldChapterTimeline<LandingStreamChapterKey>([
  {
    atProgress: 0,
    duration: 0.4,
    to: {
      alpha: 0.24,
      amplitude: 0.03,
      frequency: 1.3,
      wrapperZ: 88,
    },
  },
]);

export function resolveLandingStreamChapterState(
  sceneState: FieldSceneState,
): LandingStreamChapterState {
  let next = { ...baseStreamState };

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

  return next;
}
