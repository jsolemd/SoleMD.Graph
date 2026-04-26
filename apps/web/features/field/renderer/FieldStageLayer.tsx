import {
  AdditiveBlending,
  NormalBlending,
  type BufferGeometry,
  type Group,
  type Points,
  type ShaderMaterial,
} from "three";
import type { MutableRefObject } from "react";
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

  return (
    <group ref={handles.wrapper} position={[0, 0, 0]} scale={[1, 1, 1]}>
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
            <shaderMaterial
              ref={handles.material}
              transparent
              depthTest={false}
              depthWrite={false}
              blending={resolveFieldBlending()}
              uniforms={uniforms}
              vertexShader={FIELD_VERTEX_SHADER}
              fragmentShader={FIELD_FRAGMENT_SHADER}
            />
          </points>
        </group>
      </group>
    </group>
  );
}
