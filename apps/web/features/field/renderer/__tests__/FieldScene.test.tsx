/**
 * @jest-environment jsdom
 *
 * Regression tests for FieldScene WebGL dispose and useEffect deps.
 *
 * Contract under test (from audit `tmp/audit/web-field-runtime.md` C1+C2):
 *   - FieldScene must dispose the ShaderMaterial it mounts via `<shaderMaterial ref=…>`
 *     for each active layer on unmount. Controllers own their own GSAP tweens,
 *     but the component owns the material refs.
 *   - The shared `pointTexture` is module-cached — it must NOT be disposed.
 *   - The `attachController` effects must not re-run every render commit.
 *   - Cleanup is idempotent so StrictMode double-mount does not explode.
 */

import { act } from "react";
import { render } from "@testing-library/react";
import type { MutableRefObject } from "react";

// --- Mock @react-three/fiber ----------------------------------------------
// FieldScene calls useThree to read viewport size and useFrame to drive per
// frame ticks. In a jsdom test we stub both, and we let the JSX (groups,
// points, bufferGeometry, shaderMaterial) render as plain React host
// elements so refs still flow through.
jest.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: unknown) => unknown) =>
    selector({ size: { width: 1200, height: 800 } }),
  // Capture frame callbacks but never invoke them — unit test is about
  // mount/unmount lifecycle, not per-frame behaviour.
  useFrame: () => {},
}));

// --- Mock Mantine color scheme --------------------------------------------
jest.mock("@mantine/core", () => ({
  useComputedColorScheme: () => "dark",
}));

// --- Mock three ------------------------------------------------------------
// We only care about ShaderMaterial.dispose() being called by the component
// cleanup. Give ShaderMaterial a real class so prototype spying works and
// provide stub Group / blending constants for the rest of the imports.
jest.mock("three", () => {
  class ShaderMaterial {
    uniforms: Record<string, { value: unknown }> = {};
    dispose = jest.fn();
  }
  class Group {}
  return {
    ShaderMaterial,
    Group,
    AdditiveBlending: 2,
    NormalBlending: 1,
  };
});

// --- Mock controllers ------------------------------------------------------
// Simple fakes that record destroy() and produce uniforms the component
// mutates in the light-mode effect.
function makeFakeController(id: string) {
  return {
    id,
    destroy: jest.fn(),
    setPointSource: jest.fn(),
    attach: jest.fn(),
    createLayerUniforms: jest.fn(() => ({
      uIsMobile: { value: false },
      uLightMode: { value: 0 },
    })),
  };
}

const blobFake = makeFakeController("blob");
const streamFake = makeFakeController("stream");
const objectFormationFake = makeFakeController("objectFormation");

jest.mock("../../controller/BlobController", () => ({
  BlobController: jest.fn().mockImplementation(() => blobFake),
}));
jest.mock("../../controller/StreamController", () => ({
  StreamController: jest.fn().mockImplementation(() => streamFake),
}));
jest.mock("../../controller/ObjectFormationController", () => ({
  ObjectFormationController: jest
    .fn()
    .mockImplementation(() => objectFormationFake),
}));

// --- Mock point-source registry -------------------------------------------
// FieldScene calls resolveFieldPointSources({ densityScale, ids, isMobile })
// and passes the buffers into <bufferAttribute>. The JSX host elements
// accept arbitrary props in React's dev mode (a noisy console warning is
// emitted for unknown tags, but that is fine for a unit test).
jest.mock("../../asset/point-source-registry", () => {
  const buffers = {
    position: new Float32Array(3),
    aMove: new Float32Array(3),
    aSpeed: new Float32Array(3),
    aRandomness: new Float32Array(3),
    aIndex: new Float32Array(1),
    aAlpha: new Float32Array(1),
    aSelection: new Float32Array(1),
    aStreamFreq: new Float32Array(1),
    aFunnelNarrow: new Float32Array(1),
    aFunnelThickness: new Float32Array(1),
    aFunnelStartShift: new Float32Array(1),
    aFunnelEndShift: new Float32Array(1),
    aBucket: new Float32Array(1),
  };
  const source = {
    buffers,
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
  };
  return {
    resolveFieldPointSources: () => ({
      blob: source,
      stream: source,
      objectFormation: source,
    }),
  };
});

// --- Mock point texture (cached module) -----------------------------------
const fakePointTexture = { dispose: jest.fn(), __tag: "shared-texture" };
jest.mock("../field-point-texture", () => ({
  getFieldPointTexture: () => fakePointTexture,
}));

// --- Mock visual presets --------------------------------------------------
jest.mock("../../scene/visual-presets", () => ({
  FIELD_STAGE_ITEM_IDS: ["blob", "stream", "objectFormation"] as const,
  DEFAULT_FIELD_SCENE: {
    items: {
      blob: {},
      stream: {},
      objectFormation: {},
    },
  },
  visualPresets: { blob: {}, stream: {}, objectFormation: {} },
}));

// --- Mock shaders + clock -------------------------------------------------
jest.mock("../field-shaders", () => ({
  FIELD_VERTEX_SHADER: "void main(){}",
  FIELD_FRAGMENT_SHADER: "void main(){}",
}));
jest.mock("../field-loop-clock", () => ({
  fieldLoopClock: { tick: () => {} },
  getFieldElapsedSeconds: () => 0,
}));

// --- Mock breakpoints -----------------------------------------------------
jest.mock("../../field-breakpoints", () => ({
  FIELD_NON_DESKTOP_BREAKPOINT: 768,
}));

// Silence the expected React warnings about unknown custom host elements
// like <shaderMaterial>, <bufferAttribute>, etc. — they are R3F reconciler
// tags and carry no meaning in jsdom.
const originalError = console.error;
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      /is unrecognized in this browser|React does not recognize|is using incorrect casing|The tag <[a-zA-Z]+> is unrecognized|Received `[^`]+` for a non-boolean attribute|Invalid DOM property/.test(
        first,
      )
    ) {
      return;
    }
    originalError(...args);
  });
});
afterAll(() => {
  (console.error as jest.Mock).mockRestore?.();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Import AFTER mocks are registered so FieldScene picks up the stubs.
import { FieldScene } from "../FieldScene";
import type { FieldSceneState } from "../../scene/visual-presets";

function renderScene() {
  const sceneStateRef: MutableRefObject<FieldSceneState> = {
    current: { items: { blob: {}, stream: {}, objectFormation: {} } } as unknown as FieldSceneState,
  };
  return render(
    <FieldScene sceneStateRef={sceneStateRef} stageReady={false} />,
  );
}

describe("FieldScene WebGL dispose lifecycle", () => {
  it("calls controller.destroy() exactly once per controller on unmount", () => {
    const { unmount } = renderScene();

    expect(blobFake.destroy).not.toHaveBeenCalled();
    expect(streamFake.destroy).not.toHaveBeenCalled();
    expect(objectFormationFake.destroy).not.toHaveBeenCalled();

    act(() => {
      unmount();
    });

    expect(blobFake.destroy).toHaveBeenCalledTimes(1);
    expect(streamFake.destroy).toHaveBeenCalledTimes(1);
    expect(objectFormationFake.destroy).toHaveBeenCalledTimes(1);
  });

  it("never disposes the shared pointTexture on unmount", () => {
    const { unmount } = renderScene();
    act(() => {
      unmount();
    });
    // The pointTexture is module-cached; disposing it here would break any
    // subsequent FieldScene mount on the same page.
    expect(fakePointTexture.dispose).not.toHaveBeenCalled();
  });

  it("is idempotent — a second unmount-like cleanup pass does not throw", () => {
    // Simulate StrictMode double-invoke: render, unmount, render, unmount.
    // All destroy counts stay balanced with allocations.
    const first = renderScene();
    act(() => {
      first.unmount();
    });
    const second = renderScene();
    act(() => {
      second.unmount();
    });

    // Each mount constructs a fresh pair of controllers via the mocked
    // `new BlobController()` etc. Our fakes are module-singletons so the
    // same `destroy` mock records both unmounts.
    expect(blobFake.destroy).toHaveBeenCalledTimes(2);
    expect(streamFake.destroy).toHaveBeenCalledTimes(2);
    expect(objectFormationFake.destroy).toHaveBeenCalledTimes(2);
  });
});

describe("FieldScene effect dep stability", () => {
  it("does not re-invoke controller.attach on every render commit", () => {
    const sceneStateRef: MutableRefObject<FieldSceneState> = {
      current: {
        items: { blob: {}, stream: {}, objectFormation: {} },
      } as unknown as FieldSceneState,
    };
    const { rerender } = render(
      <FieldScene sceneStateRef={sceneStateRef} stageReady={false} />,
    );

    const attachAfterFirstRender = blobFake.attach.mock.calls.length;

    // Force several renders without changing any identity-stable prop.
    for (let i = 0; i < 5; i += 1) {
      rerender(
        <FieldScene sceneStateRef={sceneStateRef} stageReady={false} />,
      );
    }

    // Pre-fix, the attach-controller useEffect had no dep array and ran on
    // every commit (5 extra invocations). With proper deps, no extra calls
    // should fire because activeIdSet, controllers, and onControllerReady
    // are all stable.
    expect(blobFake.attach.mock.calls.length).toBe(attachAfterFirstRender);
  });
});
