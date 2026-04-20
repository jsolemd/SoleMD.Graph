/**
 * @jest-environment jsdom
 */
import gsap from "gsap";
import { Group, ShaderMaterial } from "three";
import { BlobController } from "../BlobController";
import { visualPresets } from "../../scene/visual-presets";

// Stub ScrollTrigger so timeline.scrollTrigger reads cleanly. The tests
// interact with the GSAP timeline directly via `seek()` so the actual
// scroll observer never runs.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

function makeAttachedController() {
  const controller = new BlobController({
    id: "blob",
    preset: visualPresets.blob,
  });
  const wrapper = new Group();
  const mouseWrapper = new Group();
  const model = new Group();
  const material = new ShaderMaterial({
    uniforms: {
      uAlpha: { value: 1 },
      uAmplitude: { value: 0.05 },
      uDepth: { value: 0.3 },
      uFrequency: { value: 0.5 },
      uSelection: { value: 1 },
    },
  });
  controller.attach({
    view: null,
    wrapper,
    mouseWrapper,
    model,
    material,
  });
  // Mirror what `tick()` would have set so the `end` label tween's
  // sceneUnits-based displacement is non-zero.
  controller.sceneUnits = 200;
  return controller;
}

describe("BlobController bindScroll timeline", () => {
  it("hits Maze label values when seeked along the timeline", () => {
    const controller = makeAttachedController();
    const dispose = controller.bindScroll(document.createElement("div"));
    const timeline = gsap.getTweensOf(controller)?.[0]?.timeline;
    // Pull the timeline off the model.rotation tween instead so we get a
    // handle that works regardless of which property is queried.
    const tl =
      timeline ??
      gsap.getTweensOf(controller.material!.uniforms.uFrequency)?.[0]?.timeline;
    expect(tl).toBeDefined();
    if (!tl) return;

    const uniforms = controller.material!.uniforms;

    // t=1.5: uFrequency tween reaches 1.7
    tl.seek(1.5, false);
    expect(uniforms.uFrequency.value).toBeCloseTo(1.7, 2);

    // t=2.1: hotspots open beat (fromTo opacity 0 → 1, dur 0.1) finishes
    tl.seek(2.1, false);
    expect(controller.hotspotState.opacity).toBeCloseTo(1, 2);

    // t=3.3: maxNumber tween (3 → 40, dur 0.1 starting at 3.2) finishes
    tl.seek(3.3, false);
    expect(controller.hotspotState.maxNumber).toBeCloseTo(40, 0);

    // t=4.05: uSelection tween (1 → selectionHotspotFloor, dur 0.6 starting at 3.4) finishes
    tl.seek(4.05, false);
    expect(uniforms.uSelection.value).toBeCloseTo(
      visualPresets.blob.shader.selectionHotspotFloor,
      2,
    );

    // t=5.3: diagram beat — uDepth, uAlpha, wrapper.scale all complete.
    // uAlpha holds the `alphaDiagramFloor` preset floor instead of 0 so
    // the silhouette stays readable through the chapter.
    tl.seek(5.3, false);
    expect(uniforms.uDepth.value).toBeCloseTo(1, 2);
    expect(uniforms.uAlpha.value).toBeCloseTo(
      visualPresets.blob.shader.alphaDiagramFloor,
      2,
    );
    expect(controller.wrapper!.scale.x).toBeGreaterThan(1.4);

    // t=7.3: shrink completes — wrapper.scale back near 1
    tl.seek(7.3, false);
    expect(controller.wrapper!.scale.x).toBeCloseTo(1, 1);

    // t=7.3: quickly beat — onlyReds 0 → 1, maxNumber to 3
    expect(controller.hotspotState.onlyReds).toBeCloseTo(1, 1);
    expect(controller.hotspotState.maxNumber).toBeLessThanOrEqual(3);

    // t=8.0: respond — opacity drops to 0 (tween at 7.9 dur 0.1)
    tl.seek(8.0, false);
    expect(controller.hotspotState.opacity).toBeCloseTo(0, 1);

    // t=8.3: respond uSelection restore completes (1 dur 0.4 from 7.9)
    tl.seek(8.3, false);
    expect(uniforms.uSelection.value).toBeCloseTo(1, 2);

    // t=10: end-drift completes; model.position.y at sceneUnits * 0.5
    tl.seek(10, false);
    expect(controller.model!.position.y).toBeCloseTo(controller.sceneUnits * 0.5, 1);

    dispose();
  });

  it("skips timeline construction under prefers-reduced-motion: reduce", () => {
    (window.matchMedia as unknown as jest.Mock) = jest.fn().mockImplementation(
      (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );

    const controller = makeAttachedController();
    const beforeOpacity = controller.hotspotState.opacity;
    const dispose = controller.bindScroll(document.createElement("div"));

    // Baseline preset values must be on the uniforms; hotspotState stays
    // at the zeroed reduced-motion default.
    expect(controller.material!.uniforms.uAmplitude.value).toBeCloseTo(
      visualPresets.blob.shader.amplitude,
      4,
    );
    expect(controller.hotspotState.opacity).toBe(beforeOpacity);
    dispose();
  });
});
