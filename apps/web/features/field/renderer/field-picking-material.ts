import * as THREE from "three";

import {
  FIELD_ATTRIBUTE_DECLS,
  FIELD_DISPLACEMENT_FN,
  FIELD_NOISE_HELPERS,
  FIELD_POINT_SIZE_FN,
  FIELD_UNIFORM_DECLS,
} from "./field-vertex-motion.glsl";
import type { LayerUniforms } from "../controller/FieldController";

/**
 * Orb-mode GPU-picking material for the blob points layer.
 *
 * The vertex shader composes from the same motion chunks as the display
 * shader (`field-vertex-motion.glsl.ts`) so the picked pixel precisely
 * matches the rendered pixel — no drift from paper-mode aSpeed (up to
 * 3.0) or aClickPack.w (size factor 0.5–2.0).
 *
 * The fragment shader uses `precision highp float` so the 24-bit
 * vIndex → RGB encode survives mantissa rounding at the 16384 particle
 * upper bound.
 *
 * Uniform references are SHARED with the display material (the caller
 * passes the blob's live `LayerUniforms`). This keeps uTime, uStream,
 * uClickStrength, etc. synchronized automatically — no per-frame copy.
 *
 * Selection/focus culling lives in the display shader only — picking
 * does not care about visual selection state, only about which particle
 * is under the cursor.
 */

const PICKING_VERTEX_SHADER = `
precision highp float;

${FIELD_ATTRIBUTE_DECLS}

${FIELD_UNIFORM_DECLS}

varying float vIndex;

${FIELD_NOISE_HELPERS}

${FIELD_DISPLACEMENT_FN}

${FIELD_POINT_SIZE_FN}

void main() {
  float noise;
  vec3 displaced = computeFieldDisplacement(noise);
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float size = computeFieldPointSize(mvPosition);
  gl_PointSize = clamp(size, 2.0, 64.0);
  vIndex = aIndex;
}
`;

const PICKING_FRAGMENT_SHADER = `
precision highp float;

varying float vIndex;

void main() {
  // Round hit-test: discard outside the unit disk so picking matches
  // the visual sprite edge and doesn't overclaim square pixels.
  vec2 p = gl_PointCoord - vec2(0.5);
  if (dot(p, p) > 0.25) discard;

  // Pack the dense index as 24-bit RGB. alpha=1.0 distinguishes a hit
  // from the clear color (0,0,0,0) in the picking target.
  float idx = vIndex;
  float r = mod(idx, 256.0);
  float g = mod(floor(idx / 256.0), 256.0);
  float b = mod(floor(idx / 65536.0), 256.0);
  gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
}
`;

// Subset of LayerUniforms that the picking shader reads. Both shaders
// reuse the same uniform object references so updates to uTime / uStream /
// etc. in the display pass are visible to the picking pass automatically.
const MOTION_UNIFORM_KEYS = [
  "uIsMobile",
  "uPixelRatio",
  "uScale",
  "uTime",
  "uTimeFactor",
  "uSpeed",
  "uSize",
  "uDepth",
  "uAmplitude",
  "uFrequency",
  "uClickStrength",
  "uWidth",
  "uHeight",
  "uStream",
  "uFunnelStart",
  "uFunnelEnd",
  "uFunnelThick",
  "uFunnelNarrow",
  "uFunnelStartShift",
  "uFunnelEndShift",
  "uFunnelDistortion",
] as const;

export function createFieldPickingMaterial(
  displayUniforms: LayerUniforms,
): THREE.ShaderMaterial {
  const uniforms: Record<string, { value: unknown }> = {};
  for (const key of MOTION_UNIFORM_KEYS) {
    uniforms[key] = displayUniforms[key]!;
  }

  // Picking pass wants deterministic "closest point wins" at each pixel.
  // depthTest on + depthWrite on gives that; the picking render target
  // carries its own depth buffer (see createFieldPicker's WebGLRenderTarget
  // constructor in field-picking.ts).
  return new THREE.ShaderMaterial({
    vertexShader: PICKING_VERTEX_SHADER,
    fragmentShader: PICKING_FRAGMENT_SHADER,
    uniforms,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NoBlending,
  });
}
