import {
  resolveAmbientFieldScrollState,
  type AmbientFieldScrollManifest,
} from "../ambient-field-scroll-state";

describe("resolveAmbientFieldScrollState", () => {
  const stops = [
    { id: "section-welcome", preset: "blob" as const, start: 0 },
    { id: "section-story-1", preset: "blob" as const, start: 1000 },
    { id: "section-process", preset: "stream" as const, start: 2000 },
    { id: "section-story-2", preset: "stream" as const, start: 3000 },
    { id: "section-cta", preset: "pcb" as const, start: 4000 },
  ];
  const manifest: AmbientFieldScrollManifest = {
    activationViewportRatio: 0.24,
    focusViewportRatio: 0.32,
    processProgress: {
      start: { sectionId: "section-process", offsetViewport: 0.04 },
      end: { sectionId: "section-story-2", offsetViewport: -0.22 },
    },
    stages: {
      blob: {
        visibility: {
          enter: {
            start: { sectionId: "section-welcome", offsetViewport: -0.18 },
            end: { sectionId: "section-welcome", offsetViewport: 0.16 },
          },
          exit: {
            start: { sectionId: "section-process", offsetViewport: -0.58 },
            end: { sectionId: "section-process", offsetViewport: 0.16 },
          },
        },
        localProgress: {
          start: { sectionId: "section-welcome", offsetViewport: 0 },
          end: { sectionId: "section-process", offsetViewport: 0.08 },
        },
        emphasis: { base: 0.58, metric: "visibility", range: 0.42 },
      },
      stream: {
        visibility: {
          enter: {
            start: { sectionId: "section-process", offsetViewport: -0.34 },
            end: { sectionId: "section-process", offsetViewport: 0.18 },
          },
          exit: {
            start: { sectionId: "section-cta", offsetViewport: -0.54 },
            end: { sectionId: "section-cta", offsetViewport: 0.12 },
          },
        },
        localProgress: {
          start: { sectionId: "section-process", offsetViewport: -0.08 },
          end: { sectionId: "section-cta", offsetViewport: 0 },
        },
        emphasis: { base: 0.36, metric: "processProgress", range: 0.64 },
      },
      pcb: {
        visibility: {
          enter: {
            start: { sectionId: "section-cta", offsetViewport: -0.28 },
            end: { sectionId: "section-cta", offsetViewport: 0.18 },
          },
        },
        localProgress: {
          start: { sectionId: "section-cta", offsetViewport: 0 },
          end: { sectionId: "section-cta", offsetViewport: 1 },
        },
        emphasis: { base: 0.34, metric: "visibility", range: 0.66 },
      },
    },
  };

  it("keeps the blob scene dominant across the opening carried chapters", () => {
    const resolved = resolveAmbientFieldScrollState({
      manifest,
      scrollTop: 1200,
      scrollMax: 4000,
      viewportHeight: 1000,
      stops,
    });

    expect(resolved.activeSectionId).toBe("section-story-1");
    expect(resolved.items.blob.visibility).toBeGreaterThan(0.9);
    expect(resolved.items.stream.visibility).toBeLessThan(0.15);
    expect(resolved.items.pcb.visibility).toBe(0);
  });

  it("ramps the stream scene in before the process chapter fully takes over", () => {
    const resolved = resolveAmbientFieldScrollState({
      manifest,
      scrollTop: 1600,
      scrollMax: 4000,
      viewportHeight: 1000,
      stops,
    });

    expect(resolved.activeSectionId).toBe("section-story-1");
    expect(resolved.items.blob.visibility).toBeGreaterThan(0.2);
    expect(resolved.items.stream.visibility).toBeGreaterThan(0.1);
    expect(resolved.items.stream.visibility).toBeLessThan(0.9);
  });

  it("holds the stream scene across the process and follow-on story band", () => {
    const resolved = resolveAmbientFieldScrollState({
      manifest,
      scrollTop: 2350,
      scrollMax: 4000,
      viewportHeight: 1000,
      stops,
    });

    expect(resolved.activeSectionId).toBe("section-process");
    expect(resolved.items.stream.visibility).toBeGreaterThan(0.9);
    expect(resolved.processProgress).toBeGreaterThan(0);
    expect(resolved.items.pcb.visibility).toBeLessThan(0.15);
  });

  it("falls back to the default opening scene when no stops are available", () => {
    const resolved = resolveAmbientFieldScrollState({
      manifest,
      scrollTop: 0,
      scrollMax: 0,
      viewportHeight: 1000,
      stops: [],
    });

    expect(resolved.activeSectionId).toBe("section-welcome");
    expect(resolved.items.blob.visibility).toBe(1);
    expect(resolved.items.stream.visibility).toBe(0);
    expect(resolved.items.pcb.visibility).toBe(0);
  });
});
