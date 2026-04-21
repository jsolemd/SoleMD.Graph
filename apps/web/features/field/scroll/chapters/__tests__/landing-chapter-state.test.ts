import { createFieldSceneState, visualPresets } from "../../../scene/visual-presets";
import { resolveLandingBlobChapterState } from "../landing-blob-chapter";
import { resolveLandingStreamChapterState } from "../landing-stream-chapter";

function setChapterProgress(progress: number) {
  return {
    isActive: progress > 0 && progress < 1,
    progress,
    visibility: progress > 0 ? 1 : 0,
  };
}

describe("landing chapter state", () => {
  it("builds blob model rotation through hero, surface rail, and story one before story two takes over", () => {
    const sceneState = createFieldSceneState();

    sceneState.chapters["section-hero"] = setChapterProgress(0.5);
    const heroState = resolveLandingBlobChapterState(sceneState);
    expect(heroState.modelRotationY).toBeGreaterThan(0);

    sceneState.chapters = {
      "section-hero": setChapterProgress(1),
      "section-surface-rail": setChapterProgress(0.55),
    };
    const surfaceRailState = resolveLandingBlobChapterState(sceneState);
    expect(surfaceRailState.modelRotationY).toBeGreaterThan(heroState.modelRotationY);

    sceneState.chapters = {
      "section-hero": setChapterProgress(1),
      "section-surface-rail": setChapterProgress(1),
      "section-story-1": setChapterProgress(0.55),
    };
    const storyOneState = resolveLandingBlobChapterState(sceneState);
    expect(storyOneState.modelRotationY).toBeGreaterThan(
      surfaceRailState.modelRotationY,
    );
    expect(storyOneState.modelRotationY).toBeLessThan(Math.PI * 0.36);
  });

  it("opens blob hotspots during story one and restores a globe-like end state at CTA", () => {
    const sceneState = createFieldSceneState();
    sceneState.chapters["section-story-1"] = setChapterProgress(0.42);

    const storyOneState = resolveLandingBlobChapterState(sceneState);
    expect(storyOneState.frequency).toBeGreaterThan(
      visualPresets.blob.shader.frequency,
    );
    expect(storyOneState.hotspotOpacity).toBeGreaterThan(0.4);
    expect(storyOneState.hotspotMaxNumber).toBeGreaterThan(5);
    expect(storyOneState.selection).toBeLessThan(1);

    sceneState.chapters = {
      "section-cta": setChapterProgress(1),
    };

    const ctaState = resolveLandingBlobChapterState(sceneState);
    expect(ctaState.alpha).toBeCloseTo(visualPresets.blob.shader.alpha, 3);
    expect(ctaState.amplitude).toBeCloseTo(
      visualPresets.blob.shader.amplitude,
      3,
    );
    expect(ctaState.depth).toBeCloseTo(visualPresets.blob.shader.depth, 3);
    expect(ctaState.frequency).toBeCloseTo(
      visualPresets.blob.shader.frequency,
      3,
    );
    expect(ctaState.wrapperScale).toBeCloseTo(1, 3);
    expect(ctaState.hotspotOpacity).toBeCloseTo(0, 3);
  });

  it("brings the stream in through story two/story three and fades it back out by mobile carry", () => {
    const sceneState = createFieldSceneState();
    sceneState.chapters["section-story-2"] = setChapterProgress(0.75);

    const storyTwoState = resolveLandingStreamChapterState(sceneState);
    expect(storyTwoState.wrapperZ).toBeGreaterThan(-220);
    expect(storyTwoState.wrapperZ).toBeLessThan(-40);
    expect(storyTwoState.alpha).toBeGreaterThan(0.9);

    sceneState.chapters = {
      "section-story-2": setChapterProgress(1),
      "section-story-3": setChapterProgress(1),
      "section-sequence": setChapterProgress(1),
      "section-mobile-carry": setChapterProgress(1),
    };

    const mobileCarryState = resolveLandingStreamChapterState(sceneState);
    expect(mobileCarryState.alpha).toBeLessThan(0.3);
    expect(mobileCarryState.wrapperZ).toBeGreaterThan(80);
  });
});
