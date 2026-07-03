import {
  AdditiveBlending,
  NormalBlending,
  type BufferGeometry,
  type Group,
  type Points,
  type ShaderMaterial,
  type ShaderMaterialParameters,
} from "three";
import { useCallback, useMemo, type MutableRefObject } from "react";
import type { LayerUniforms } from "../controller/FieldController";
import type { FieldPointSource } from "../asset/point-source-types";
import {
  FIELD_FRAGMENT_SHADER,
  FIELD_VERTEX_SHADER,
} from "./field-shaders";

export interface StageLayerHandle {
  material: MutableRefObject<ShaderMaterial | null>;
  model: MutableRefObject<Group | null>;
  mouseWrapper: MutableRefObject<Group | null>;
  wrapper: MutableRefObject<Group | null>;
  geometry: MutableRefObject<BufferGeometry | null>;
  points: MutableRefObject<Points | null>;
}

// Maze parity toggle: source exposes `?blending` to swap AdditiveBlending
// for debug. SoleMD mirrors as `?field-blending=additive`.
function resolveFieldBlending() {
  if (typeof window === "undefined") return NormalBlending;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("field-blending") === "additive"
      ? AdditiveBlending
      : NormalBlending;
  } catch {
    return NormalBlending;
  }
}

export function createFieldStageMaterialArgs(
  uniforms: LayerUniforms,
): [ShaderMaterialParameters] {
  return [
    {
      blending: resolveFieldBlending(),
      depthTest: false,
      depthWrite: false,
      fragmentShader: FIELD_FRAGMENT_SHADER,
      transparent: true,
      uniforms,
      vertexShader: FIELD_VERTEX_SHADER,
    },
  ];
}

export function attachHiddenStageWrapper(
  handles: StageLayerHandle,
  node: Group | null,
) {
  handles.wrapper.current = node;
  if (node) node.visible = false;
}

export function FieldStageLayer({
  handles,
  source,
  uniforms,
}: {
  handles: StageLayerHandle;
  source: FieldPointSource;
  uniforms: LayerUniforms;
}) {
  const { buffers } = source;

  // The uniforms bag must reach the material through the ShaderMaterial
  // CONSTRUCTOR, never through the R3F `uniforms` prop: since R3F 9.6,
  // applyProps clones every uniform record passed as a prop ("stable
  // target reference"), which severs the by-reference contract this
  // runtime depends on — controllers write `.value` on the shared
  // LayerUniforms records each tick and the GPU must read those same
  // records. Constructor adoption is three.js core behavior and is
  // outside applyProps' reach.
  const materialArgs = useMemo<[ShaderMaterialParameters]>(
    () => createFieldStageMaterialArgs(uniforms),
    [uniforms],
  );
  const setWrapperRef = useCallback(
    (node: Group | null) => attachHiddenStageWrapper(handles, node),
    [handles],
  );

  return (
    // The callback ref is the first-paint gate: hide once when the wrapper
    // first attaches, then let controller ticks own wrapper.visible from
    // itemState visibility. Frames rendered before the stage is ready would
    // otherwise paint the raw, unscaled full-alpha point cloud.
    <group
      ref={setWrapperRef}
      position={[0, 0, 0]}
      scale={[1, 1, 1]}
    >
      <group ref={handles.mouseWrapper}>
        <group ref={handles.model}>
          <points ref={handles.points} frustumCulled={false}>
            <bufferGeometry ref={handles.geometry}>
              <bufferAttribute attach="attributes-position" args={[buffers.position, 3]} />
              <bufferAttribute attach="attributes-aMove" args={[buffers.aMove, 3]} />
              <bufferAttribute attach="attributes-aSpeed" args={[buffers.aSpeed, 3]} />
              <bufferAttribute attach="attributes-aRandomness" args={[buffers.aRandomness, 3]} />
              <bufferAttribute attach="attributes-aIndex" args={[buffers.aIndex, 1]} />
              <bufferAttribute attach="attributes-aAlpha" args={[buffers.aAlpha, 1]} />
              <bufferAttribute attach="attributes-aSelection" args={[buffers.aSelection, 1]} />
              <bufferAttribute attach="attributes-aStreamFreq" args={[buffers.aStreamFreq, 1]} />
              <bufferAttribute attach="attributes-aFunnelNarrow" args={[buffers.aFunnelNarrow, 1]} />
              <bufferAttribute attach="attributes-aFunnelThickness" args={[buffers.aFunnelThickness, 1]} />
              <bufferAttribute attach="attributes-aFunnelStartShift" args={[buffers.aFunnelStartShift, 1]} />
              <bufferAttribute attach="attributes-aFunnelEndShift" args={[buffers.aFunnelEndShift, 1]} />
              <bufferAttribute attach="attributes-aBucket" args={[buffers.aBucket, 1]} />
              <bufferAttribute attach="attributes-aClickPack" args={[buffers.aClickPack, 4]} />
            </bufferGeometry>
            <shaderMaterial ref={handles.material} args={materialArgs} />
          </points>
        </group>
      </group>
    </group>
  );
}
