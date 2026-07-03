/**
 * Regression test for the layer first-paint gate.
 *
 * Contract under test: every stage layer's outer wrapper group is hidden by
 * its first ref attach so frames rendered before the stage is ready (canvas
 * mounts at route level while the landing chunk is still loading) cannot
 * paint the raw, unscaled full-alpha point cloud. Only a controller tick —
 * which owns `wrapper.visible` from `itemState.visibility` after attach —
 * may reveal a layer.
 *
 * We assert on the returned element tree directly instead of rendering
 * through a DOM — React omits unknown boolean-false attributes in jsdom and
 * stringifies object props, which would make DOM-level assertions vacuous.
 * useMemo is stubbed to a passthrough so the component can be invoked as a
 * plain function.
 */

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));

import { createRef } from "react";
import {
  attachHiddenStageWrapper,
  createFieldStageMaterialArgs,
  FieldStageLayer,
  type StageLayerHandle,
} from "../FieldStageLayer";
import type { LayerUniforms } from "../../controller/FieldController";
import type { FieldPointSource } from "../../asset/point-source-types";

function makeHandles(): StageLayerHandle {
  return {
    material: createRef(),
    model: createRef(),
    mouseWrapper: createRef(),
    wrapper: createRef(),
    geometry: createRef(),
    points: createRef(),
  } as unknown as StageLayerHandle;
}

const source = {
  buffers: {
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
    aClickPack: new Float32Array(4),
  },
  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
} as unknown as FieldPointSource;

type AnyElement = {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
};

function findByType(element: AnyElement, type: string): AnyElement | null {
  if (element.type === type) return element;
  const children = element.props?.children;
  const list = Array.isArray(children) ? children : children ? [children] : [];
  for (const child of list) {
    const match = findByType(child as AnyElement, type);
    if (match) return match;
  }
  return null;
}

describe("FieldStageLayer first-paint gate", () => {
  it("hides the wrapper on first ref attach until a controller tick reveals it", () => {
    const handles = makeHandles();
    const wrapper = { visible: true };

    attachHiddenStageWrapper(
      handles,
      wrapper as NonNullable<StageLayerHandle["wrapper"]["current"]>,
    );

    expect(handles.wrapper.current).toBe(wrapper);
    expect(wrapper.visible).toBe(false);
  });

  it("uses a callback ref instead of an owned visible prop", () => {
    const element = FieldStageLayer({
      handles: makeHandles(),
      source,
      uniforms: {} as LayerUniforms,
    });

    expect(element.type).toBe("group");
    expect(element.props.visible).toBeUndefined();
    expect(typeof element.props.ref).toBe("function");
  });
});

describe("FieldStageLayer uniforms reference contract", () => {
  // Controllers mutate `.value` on the shared LayerUniforms records each
  // tick and the GPU must read those same records. R3F >= 9.6 applyProps
  // clones records passed via the `uniforms` prop, so the bag has to reach
  // the material through the ShaderMaterial constructor (`args`) — by
  // identity, never as a prop.
  it("passes the uniforms bag to the material constructor by identity, not as a prop", () => {
    const uniforms = { uScale: { value: 1 } } as unknown as LayerUniforms;
    const args = createFieldStageMaterialArgs(uniforms);
    expect(args[0].uniforms).toBe(uniforms);

    const element = FieldStageLayer({
      handles: makeHandles(),
      source,
      uniforms,
    }) as unknown as AnyElement;

    const material = findByType(element, "shaderMaterial");
    expect(material).not.toBeNull();
    expect(material!.props.uniforms).toBeUndefined();
    const materialArgs = material!.props.args as [{ uniforms: unknown }];
    expect(materialArgs[0].uniforms).toBe(uniforms);
  });
});
