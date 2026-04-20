/**
 * @jest-environment jsdom
 */
import { Group, PerspectiveCamera, ShaderMaterial } from "three";
import { BlobController, BLOB_HOTSPOT_COUNT } from "../BlobController";
import { visualPresets, createAmbientFieldSceneState } from "../../scene/visual-presets";
import type { AmbientFieldPointSource } from "../../asset/point-source-types";

function makeFakePointSource(): AmbientFieldPointSource {
  const pointCount = 2048;
  const position = new Float32Array(pointCount * 3);
  const color = new Float32Array(pointCount * 3);
  for (let i = 0; i < pointCount; i += 1) {
    position[i * 3 + 0] = Math.cos(i);
    position[i * 3 + 1] = Math.sin(i);
    position[i * 3 + 2] = -0.3; // keep localZ <= 0 so projection survives
    color[i * 3 + 0] = 0.4;
    color[i * 3 + 1] = 0.6;
    color[i * 3 + 2] = 0.9;
  }
  return {
    bounds: {
      minX: -1,
      maxX: 1,
      minY: -1,
      maxY: 1,
      minZ: -1,
      maxZ: 1,
    },
    buffers: {
      aAlpha: new Float32Array(pointCount),
      aBucket: new Float32Array(pointCount),
      aFunnelEndShift: new Float32Array(pointCount),
      aFunnelNarrow: new Float32Array(pointCount),
      aFunnelStartShift: new Float32Array(pointCount),
      aFunnelThickness: new Float32Array(pointCount),
      aIndex: new Float32Array(pointCount),
      aMove: new Float32Array(pointCount * 3),
      aRandomness: new Float32Array(pointCount * 3),
      aSelection: new Float32Array(pointCount),
      aSpeed: new Float32Array(pointCount * 3),
      aStreamFreq: new Float32Array(pointCount),
      color,
      position,
    },
    id: "blob",
    pointCount,
  };
}

function makeAttachedController() {
  const controller = new BlobController({
    id: "blob",
    preset: visualPresets.blob,
  });
  const wrapper = new Group();
  const mouseWrapper = new Group();
  const model = new Group();
  const material = new ShaderMaterial();
  controller.attach({
    view: null,
    wrapper,
    mouseWrapper,
    model,
    material,
  });
  controller.setPointSource(makeFakePointSource());
  return controller;
}

describe("BlobController", () => {
  it("hotspotState gates which slots can become visible", () => {
    const controller = makeAttachedController();
    const camera = new PerspectiveCamera(45, 16 / 9, 80, 10000);
    camera.position.z = 400;
    const scene = createAmbientFieldSceneState();
    scene.items.blob.visibility = 1;
    controller.hotspotState = {
      opacity: 1,
      maxNumber: 10,
      onlyReds: 0,
      interval: 2000,
    };

    const frames = controller.projectHotspots(camera, 1440, 900, 0.5, scene);
    expect(frames.length).toBe(BLOB_HOTSPOT_COUNT);
    // Hotspots beyond maxNumber must always stay hidden, regardless of
    // whether the camera/projection succeeded for the lower slots.
    for (let i = 10; i < BLOB_HOTSPOT_COUNT; i += 1) {
      expect(frames[i]!.visible).toBe(false);
    }
  });

  it("hides every hotspot when hotspotState.opacity is zero", () => {
    const controller = makeAttachedController();
    const camera = new PerspectiveCamera(45, 16 / 9, 80, 10000);
    camera.position.z = 400;
    const scene = createAmbientFieldSceneState();
    scene.items.blob.visibility = 1;
    controller.hotspotState = {
      opacity: 0,
      maxNumber: 40,
      onlyReds: 0,
      interval: 2000,
    };

    const frames = controller.projectHotspots(camera, 1440, 900, 0.5, scene);
    for (const frame of frames) expect(frame.visible).toBe(false);
  });

  it("flags onlyReds + onlySingle stage gates from hotspotState", () => {
    const controller = makeAttachedController();
    const camera = new PerspectiveCamera(45, 16 / 9, 80, 10000);
    camera.position.z = 400;
    const scene = createAmbientFieldSceneState();
    scene.items.blob.visibility = 1;
    controller.hotspotState = {
      opacity: 1,
      maxNumber: 3,
      onlyReds: 1,
      interval: 2000,
    };

    controller.projectHotspots(camera, 1440, 900, 0.5, scene);
    expect(controller.stageHasOnlyReds).toBe(true);
    expect(controller.stageHasOnlySingle).toBe(true);
  });

  it("onHotspotAnimationEnd clears the candidate so the next frame reseeds", () => {
    const controller = makeAttachedController();
    const camera = new PerspectiveCamera(45, 16 / 9, 80, 10000);
    camera.position.z = 400;
    const scene = createAmbientFieldSceneState();
    scene.items.blob.visibility = 1;
    controller.hotspotState = {
      opacity: 1,
      maxNumber: 10,
      onlyReds: 0,
      interval: 2000,
    };
    controller.projectHotspots(camera, 1440, 900, 0.5, scene);
    // Force a seeded candidate before the clear
    controller.hotspotRuntime[0]!.candidateIndex = 42;
    controller.onHotspotAnimationEnd(0);
    expect(controller.hotspotRuntime[0]!.candidateIndex).toBeNull();
  });

  it("writeHotspotDom resets off-screen transforms when blob is invisible", () => {
    const controller = makeAttachedController();
    const camera = new PerspectiveCamera(45, 16 / 9, 80, 10000);
    camera.position.z = 400;
    const scene = createAmbientFieldSceneState();
    scene.items.blob.visibility = 0; // force writeHotspotDom invisible path

    const nodes = Array.from({ length: BLOB_HOTSPOT_COUNT }, () => {
      const node = document.createElement("div");
      node.style.transform = "translate3d(100px, 100px, 0) scale(1)";
      node.style.opacity = "1";
      return node;
    });
    controller.hotspotRefs = nodes;
    controller.projectHotspots(camera, 1440, 900, 1.5, scene);

    for (const node of nodes) {
      expect(node.style.transform).toContain("-9999px");
      expect(node.style.opacity).toBe("0");
    }
  });
});
