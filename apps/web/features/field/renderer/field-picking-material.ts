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
 * matches the rendered pixel — no drift from paper-mode aSpeed (range
 * [0.55, 1.75]) or aClickPack.w (size factor [0.8, 2.6]). Final
 * gl_PointSize is the raw `computeFieldPointSize` value, matching the
 * display shader's BASE point size at every zoom level. Display-only
 * boosts (selection / focus / spotlight) intentionally do NOT propagate
 * to the picker — picking should hit the visible base sprite, not an
 * inflated halo. Hardware point-size caps apply equally to both passes.
 *
 * The fragment shader uses `precision highp float` so the 24-bit
 * vIndex → RGB encode survives mantissa rounding at the 16384 particle
 * upper bound. Alpha carries an orb-relative view-depth bucket (1..255;
 * 0 is the clear pixel) so rectangle selection can default to the
 * front visible slab while Alt/Option-drag can intentionally select
 * through the volume. The depth is relative to the rendered orb center,
 * not absolute camera distance; the orb is only a few world units deep
 * while the camera can sit hundreds of units away, so absolute depth
 * collapses the front and back hemispheres into the same byte.
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
varying float vPickDepth;

${FIELD_NOISE_HELPERS}

${FIELD_DISPLACEMENT_FN}

${FIELD_POINT_SIZE_FN}

void main() {
  float noise;
  vec3 displaced = computeFieldDisplacement(noise);
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = computeFieldPointSize(mvPosition);
  vIndex = aIndex;
  float pointDepth = -mvPosition.z;
  float centerDepth = -(modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  vPickDepth = pointDepth - centerDepth;
}
`;

const PICKING_FRAGMENT_SHADER = `
precision highp float;

varying float vIndex;
varying float vPickDepth;

const float PICK_RELATIVE_DEPTH_HALF_RANGE = 8.0;

void main() {
  // Round hit-test: discard outside the unit disk so picking matches
  // the visual sprite edge and doesn't overclaim square pixels.
  vec2 p = gl_PointCoord - vec2(0.5);
  if (dot(p, p) > 0.25) discard;

  // Pack the dense index as 24-bit RGB. Alpha is an orb-relative
  // view-depth bucket, reserving 0 for the clear color / no-hit pixels.
  // Lower bytes are closer to the camera.
  float idx = vIndex;
  float r = mod(idx, 256.0);
  float g = mod(floor(idx / 256.0), 256.0);
  float b = mod(floor(idx / 65536.0), 256.0);
  float normalizedDepth = clamp(
    (vPickDepth + PICK_RELATIVE_DEPTH_HALF_RANGE) /
      (PICK_RELATIVE_DEPTH_HALF_RANGE * 2.0),
    0.0,
    1.0
  );
  float depthByte =
    floor(normalizedDepth * 254.0) + 1.0;
  gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, depthByte / 255.0);
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
  "uPointDepthAttenuation",
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
