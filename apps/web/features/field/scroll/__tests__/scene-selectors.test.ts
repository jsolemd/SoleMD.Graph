import { createFieldSceneState } from "../../scene/visual-presets";
import {
  getFieldChapterProgress,
  getFieldChapterProgressBucket,
  getFieldChapterState,
  getFieldChapterVisibility,
  isFieldChapterActive,
} from "../scene-selectors";

describe("scene-selectors", () => {
  it("returns zero/inactive defaults for unknown chapters", () => {
    const state = createFieldSceneState();
    expect(getFieldChapterProgress(state, "missing")).toBe(0);
    expect(isFieldChapterActive(state, "missing")).toBe(false);
    expect(getFieldChapterVisibility(state, "missing")).toBe(0);
    expect(getFieldChapterState(state, "missing")).toBeUndefined();
  });

  it("reads stored chapter values once the scroll runtime has written them", () => {
    const state = createFieldSceneState();
    state.chapters["section-story-3"] = {
      isActive: true,
      progress: 0.42,
      visibility: 1,
    };
    expect(getFieldChapterProgress(state, "section-story-3")).toBeCloseTo(0.42);
    expect(isFieldChapterActive(state, "section-story-3")).toBe(true);
    expect(getFieldChapterVisibility(state, "section-story-3")).toBe(1);
    expect(getFieldChapterState(state, "section-story-3")).toEqual({
      isActive: true,
      progress: 0.42,
      visibility: 1,
    });
  });

  it("quantizes progress to the reveal-curve breakpoints", () => {
    expect(getFieldChapterProgressBucket(0)).toBe(0);
    expect(getFieldChapterProgressBucket(0.23)).toBe(0);
    expect(getFieldChapterProgressBucket(0.24)).toBe(1);
    expect(getFieldChapterProgressBucket(0.49)).toBe(1);
    expect(getFieldChapterProgressBucket(0.5)).toBe(2);
    expect(getFieldChapterProgressBucket(0.65)).toBe(2);
    expect(getFieldChapterProgressBucket(0.66)).toBe(3);
    expect(getFieldChapterProgressBucket(0.89)).toBe(3);
    expect(getFieldChapterProgressBucket(0.9)).toBe(4);
    expect(getFieldChapterProgressBucket(1)).toBe(4);
  });
});
