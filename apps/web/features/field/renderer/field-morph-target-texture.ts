import * as THREE from "three";
import { buildBrainMorphTarget } from "../asset/brain-morph-geometry";

/**
 * Orb->brain morph target, delivered to the vertex shader as a float
 * `THREE.DataTexture` keyed by `aIndex` — the same sidecar-texture pattern as
 * `field-particle-state-texture`, and for the same reason: the field shader is
 * already at the WebGL `MAX_VERTEX_ATTRIBS` budget, so a per-particle brain
 * position cannot be a 15th vertex attribute without tripping "Too many
 * attributes" link failures. It rides a texture instead.
 *
 * `RGBA32F`, 128² = 16384 texels (the blob's 16384-particle baseline). Each
 * texel holds one brain vertex in RGB (A unused). The shader reads it at
 * `(mod(aIndex, size), floor(aIndex / size))` and mixes position -> target on
 * `uMorph`. NearestFilter, no mipmaps: exact per-particle fetch, and float
 * sampling in the vertex stage is core WebGL2.
 *
 * Module singleton so it survives Activity-cached route swaps without
 * re-uploading. Non-lecture layers bind the same instance but never sample it
 * (gated by `uMorph = 0`).
 */

export const MORPH_TARGET_TEXTURE_SIZE = 128; // 128² = 16384
const CAPACITY = MORPH_TARGET_TEXTURE_SIZE * MORPH_TARGET_TEXTURE_SIZE;

let cachedTexture: THREE.DataTexture | null = null;

function build(): THREE.DataTexture {
  const brain = buildBrainMorphTarget(CAPACITY);
  const data = new Float32Array(CAPACITY * 4);
  for (let i = 0; i < CAPACITY; i += 1) {
    data[i * 4] = brain[i * 3]!;
    data[i * 4 + 1] = brain[i * 3 + 1]!;
    data[i * 4 + 2] = brain[i * 3 + 2]!;
    data[i * 4 + 3] = 1;
  }
  const texture = new THREE.DataTexture(
    data,
    MORPH_TARGET_TEXTURE_SIZE,
    MORPH_TARGET_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

export function getMorphTargetTexture(): THREE.DataTexture {
  if (!cachedTexture) cachedTexture = build();
  return cachedTexture;
}
