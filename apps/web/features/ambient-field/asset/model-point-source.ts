import type * as THREE from "three";
import {
  FieldGeometry,
  type VerticesGeometryOptions,
} from "./field-geometry";

// Wrapper over `FieldGeometry.fromVertices` that walks a THREE.Object3D graph,
// collects every BufferGeometry.position attribute it finds, and applies the
// Maze countFactor / positionRandomness emission rules. Source:
// scripts.pretty.js:42723-42745.

export interface ModelPointSourceOptions extends VerticesGeometryOptions {}

// Minimal structural typing so callers can pass a duck-typed model in tests
// without pulling in the full THREE.Object3D hierarchy.
interface Object3DLike {
  children?: readonly Object3DLike[];
  geometry?: { getAttribute?: (name: string) => unknown };
}

function collectVertexPositions(model: Object3DLike): Float32Array {
  const chunks: Float32Array[] = [];
  const visit = (node: Object3DLike) => {
    const attr = node.geometry?.getAttribute?.("position") as
      | { array?: ArrayLike<number> }
      | undefined;
    if (attr?.array && (attr.array as Float32Array).length) {
      chunks.push(
        attr.array instanceof Float32Array
          ? attr.array
          : Float32Array.from(attr.array as ArrayLike<number>),
      );
    }
    const children = node.children;
    if (children) {
      for (const child of children) visit(child);
    }
  };
  visit(model);

  if (chunks.length === 0) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0]!;

  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const combined = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

export function createModelPointGeometry(
  model: THREE.Object3D | Object3DLike,
  options?: ModelPointSourceOptions,
): THREE.BufferGeometry {
  const positions = collectVertexPositions(model);
  return FieldGeometry.fromVertices(positions, options);
}
