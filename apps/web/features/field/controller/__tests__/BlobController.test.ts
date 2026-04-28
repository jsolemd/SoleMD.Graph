/**
 * @jest-environment jsdom
 */
import { Group, PerspectiveCamera, ShaderMaterial, Texture } from "three";
import { BlobController, BLOB_HOTSPOT_COUNT } from "../BlobController";
import { visualPresets, createFieldSceneState } from "../../scene/visual-presets";
import type { FieldPointSource } from "../../asset/point-source-types";

function makeFakePointSource(): FieldPointSource {
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
      aClickPack: new Float32Array(pointCount * 4),
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

function tickBlobController({
  controller,
  scene,
  uniforms,
  dtSec = 1 / 60,
  elapsedSec = 2,
}: {
  controller: BlobController;
  scene: ReturnType<typeof createFieldSceneState>;
  uniforms: ReturnType<BlobController["createLayerUniforms"]>;
  dtSec?: number;
  elapsedSec?: number;
}) {
  const camera = new PerspectiveCamera(45, 16 / 9, 80, 10000);
  camera.position.z = 400;
  const source = controller.pointSource;
  if (!source) throw new Error("expected fake point source");

  controller.tick({
    camera,
    dtSec,
    elapsedSec,
    isMobile: false,
    itemState: scene.items.blob,
    pixelRatio: 1,
    sceneState: scene,
    sourceBounds: source.bounds,
    uniforms,
    viewportHeight: 900,
    viewportWidth: 1440,
    wrapperInitialized: true,
    markWrapperInitialized: () => {},
  });
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
    const scene = createFieldSceneState();
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
    const scene = createFieldSceneState();
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
    const scene = createFieldSceneState();
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
    const scene = createFieldSceneState();
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

  it("resets hotspot DOM transforms when blob is invisible", () => {
    const controller = makeAttachedController();
    const camera = new PerspectiveCamera(45, 16 / 9, 80, 10000);
    camera.position.z = 400;
    const scene = createFieldSceneState();
    scene.items.blob.visibility = 0;

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

  it("turns manual twist into a transient orb burst", () => {
    const controller = makeAttachedController();
    const scene = createFieldSceneState();
    scene.orbCameraActive = true;
    scene.items.blob.visibility = 1;
    const uniforms = controller.createLayerUniforms(false, new Texture());
    if (controller.material) {
      controller.material.uniforms = uniforms as ShaderMaterial["uniforms"];
    }

    try {
      controller.addTwistImpulse(Math.PI / 18);
      tickBlobController({ controller, scene, uniforms });

      expect(uniforms.uFrequency.value).toBeGreaterThan(
        visualPresets.blob.shader.frequency,
      );
      expect(uniforms.uAmplitude.value).toBeGreaterThan(
        visualPresets.blob.shader.amplitude,
      );
      expect(uniforms.uSelectionBoostSize.value).toBeGreaterThan(1);
    } finally {
      controller.destroy();
    }
  });

  it("snaps the orb focus dim gate off when focus clears", () => {
    const controller = makeAttachedController();
    const scene = createFieldSceneState();
    scene.orbCameraActive = true;
    scene.orbFocusActive = true;
    scene.items.blob.visibility = 1;
    const uniforms = controller.createLayerUniforms(false, new Texture());
    if (controller.material) {
      controller.material.uniforms = uniforms as ShaderMaterial["uniforms"];
    }

    try {
      tickBlobController({ controller, scene, uniforms });
      expect(uniforms.uOrbFocusActive.value).toBeGreaterThan(0);

      scene.orbFocusActive = false;
      tickBlobController({ controller, scene, uniforms });

      expect(uniforms.uOrbFocusActive.value).toBe(0);
    } finally {
      controller.destroy();
    }
  });
});
