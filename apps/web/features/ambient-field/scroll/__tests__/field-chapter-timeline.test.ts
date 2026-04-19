import { createUniformScrubber } from "../ambient-field-uniform-scrubber";
import { createFieldChapterTimeline } from "../field-chapter-timeline";

type K = "alpha" | "amplitude" | "frequency";

describe("createFieldChapterTimeline", () => {
  it("evaluates fromTo events across their progress window", () => {
    const scrubber = createUniformScrubber<K>({ halfLifeMs: 1 });
    const timeline = createFieldChapterTimeline<K>({
      events: [
        {
          atProgress: 0,
          duration: 1,
          fromTo: { alpha: [0, 1] },
        },
      ],
      scrubber,
      initialTargets: { alpha: 0, amplitude: 0, frequency: 0 },
    });
    timeline.setProgress(0);
    expect(timeline.current().alpha).toBe(0);
    timeline.setProgress(0.5);
    expect(timeline.current().alpha).toBe(0.5);
    timeline.setProgress(1);
    expect(timeline.current().alpha).toBe(1);
  });

  it("holds final fromTo value after the window ends", () => {
    const scrubber = createUniformScrubber<K>({ halfLifeMs: 1 });
    const timeline = createFieldChapterTimeline<K>({
      events: [
        {
          atProgress: 0.2,
          duration: 0.3,
          fromTo: { amplitude: [0.05, 0.4] },
        },
      ],
      scrubber,
      initialTargets: { alpha: 0, amplitude: 0.05, frequency: 0 },
    });
    timeline.setProgress(0.35);
    expect(timeline.current().amplitude).toBeCloseTo(0.05 + (0.4 - 0.05) * 0.5, 4);
    timeline.setProgress(0.6);
    expect(timeline.current().amplitude).toBe(0.4);
  });

  it("applies `set` events instantly at atProgress", () => {
    const scrubber = createUniformScrubber<K>({ halfLifeMs: 1 });
    const timeline = createFieldChapterTimeline<K>({
      events: [
        {
          atProgress: 0.5,
          duration: 0,
          set: { frequency: 1.7 },
        },
      ],
      scrubber,
      initialTargets: { alpha: 0, amplitude: 0, frequency: 0 },
    });
    timeline.setProgress(0.49);
    expect(timeline.current().frequency).toBe(0);
    timeline.setProgress(0.5);
    expect(timeline.current().frequency).toBe(1.7);
  });

  it("composes events across a single timeline", () => {
    const scrubber = createUniformScrubber<K>({ halfLifeMs: 1 });
    const timeline = createFieldChapterTimeline<K>({
      events: [
        { atProgress: 0, duration: 0.2, fromTo: { alpha: [0, 1] } },
        { atProgress: 0.2, duration: 0.2, fromTo: { amplitude: [0, 0.5] } },
        { atProgress: 0.4, duration: 0.1, set: { frequency: 2 } },
      ],
      scrubber,
      initialTargets: { alpha: 0, amplitude: 0, frequency: 0 },
    });
    timeline.setProgress(0.3);
    expect(timeline.current().alpha).toBe(1);
    expect(timeline.current().amplitude).toBeCloseTo(0.25, 4);
    expect(timeline.current().frequency).toBe(0);
    timeline.setProgress(0.45);
    expect(timeline.current().frequency).toBe(2);
  });

  it("feeds through the scrubber so fast-changing progress still trails", () => {
    const scrubber = createUniformScrubber<K>({
      halfLifeMs: 1000,
      initial: { alpha: 0, amplitude: 0, frequency: 0 },
    });
    const timeline = createFieldChapterTimeline<K>({
      events: [{ atProgress: 0, duration: 1, fromTo: { alpha: [0, 1] } }],
      scrubber,
      initialTargets: { alpha: 0, amplitude: 0, frequency: 0 },
    });
    timeline.setProgress(1);
    const firstStep = timeline.applyTargets(500);
    // After 500 ms at 1 s half-life, we've covered ~0.293 of the gap.
    expect(firstStep.alpha).toBeGreaterThan(0.25);
    expect(firstStep.alpha).toBeLessThan(0.35);
    const secondStep = timeline.applyTargets(500);
    expect(secondStep.alpha).toBeGreaterThan(firstStep.alpha);
  });
});
