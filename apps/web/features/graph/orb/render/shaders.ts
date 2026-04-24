/**
 * Round-sprite ShaderMaterial for the orb-dev point cloud.
 *
 * Attribute streams (matches the R4 kickoff contract in
 * docs/future/graph-orb-implementation-handoff.md):
 *   - position      : Float32Array[3*N] — DynamicDrawUsage. For the PoC the
 *                     buffer is written once at pack time; the sim is out of
 *                     scope, but the usage flag matches the future contract so
 *                     a single swap-in of d3-force-3d does not retool the
 *                     geometry.
 *   - aColor        : Float32Array[3*N] — DynamicDrawUsage, partial updates.
 *   - aSelection    : Float32Array[N]   — DynamicDrawUsage, partial updates.
 *   - aIndex        : Float32Array[N]   — StaticDrawUsage. Encodes the dense
 *                     row index used by GPU-ID picking.
 *
 * Picking is delivered by a SECOND ShaderMaterial that uses the same geometry
 * but encodes `aIndex` as RGBA (R = idx & 0xff, G = (idx >> 8) & 0xff,
 * B = (idx >> 16) & 0xff, A = 255) so readback in picking.ts can reconstruct
 * the dense index on the JS side.
 *
 * No shader breathing noise — per the plan's "physics is the aliveness
 * channel" rule. Ambient motion lives in rotation-controller.ts, not here.
 */

import * as THREE from "three";
import { getFieldPointTexture } from "@/features/field/renderer/field-point-texture";

const DISPLAY_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSelection;
  attribute float aIndex;

  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uSelectionBoost;

  varying vec3 vColor;
  varying float vSelection;

  void main() {
    vColor = aColor;
    vSelection = aSelection;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Perspective-scaled sprite size; clamped so far points remain pickable.
    float dist = max(-mvPosition.z, 1.0);
    float size = uPointSize * (300.0 / dist) * uPixelRatio;
    size *= (1.0 + aSelection * uSelectionBoost);
    // Larger upper bound so the feathered sprite halo has room to breathe —
    // matches the field-landing particle aesthetic rather than hard dots.
    gl_PointSize = clamp(size, 2.0, 96.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const DISPLAY_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform float uAlpha;
  uniform sampler2D pointTexture;

  varying vec3 vColor;
  varying float vSelection;

  void main() {
    // Feathered sprite sampled from the shared field-landing particle
    // texture — soft radial falloff, same aesthetic as the blob.
    vec4 sprite = texture2D(pointTexture, gl_PointCoord);

    // Selected points get a brightness + alpha boost stacked on top of the
    // sprite, mirroring the field's survivor-boost idiom.
    vec3 color = vColor + vec3(vSelection * 0.25);
    float alpha = uAlpha + vSelection * 0.4;
    vec4 outColor = vec4(color, alpha) * sprite;

    // Cut sub-threshold fragments to save fill-rate (matches field fragment).
    if (outColor.a <= 0.01) discard;
    gl_FragColor = outColor;
  }
`;

/**
 * Picking fragment writes the dense point index as 24-bit RGB + alpha=255.
 * R = idx & 0xff, G = (idx >> 8) & 0xff, B = (idx >> 16) & 0xff.
 * 24 bits covers 16.7M points — ample at the orb's 5k–100k target.
 */
const PICKING_VERTEX_SHADER = /* glsl */ `
  attribute float aIndex;

  uniform float uPointSize;
  uniform float uPixelRatio;

  varying float vIndex;

  void main() {
    vIndex = aIndex;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(-mvPosition.z, 1.0);
    float size = uPointSize * (300.0 / dist) * uPixelRatio;
    gl_PointSize = clamp(size, 2.0, 64.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PICKING_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  varying float vIndex;

  void main() {
    // Round hit-test: discard outside the unit disk so picking matches the
    // visual sprite edge and doesn't overclaim square pixels.
    vec2 p = gl_PointCoord - vec2(0.5);
    if (dot(p, p) > 0.25) discard;

    // Pack the dense index as 24-bit RGB. alpha=1.0 distinguishes a hit from
    // the clear color (0,0,0,0 or background).
    float idx = vIndex;
    float r = mod(idx, 256.0);
    float g = mod(floor(idx / 256.0), 256.0);
    float b = mod(floor(idx / 65536.0), 256.0);
    gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
  }
`;

export interface OrbShaderUniforms {
  uPointSize: { value: number };
  uPixelRatio: { value: number };
  uAlpha: { value: number };
  uSelectionBoost: { value: number };
  pointTexture: { value: THREE.Texture | null };
}

export interface OrbShaderHandles {
  displayMaterial: THREE.ShaderMaterial;
  pickingMaterial: THREE.ShaderMaterial;
  uniforms: OrbShaderUniforms;
}

export function createOrbShaderMaterials(options: {
  pointSize?: number;
  pixelRatio?: number;
  alpha?: number;
}): OrbShaderHandles {
  const uniforms: OrbShaderUniforms = {
    // Bumped from 8.0 → 14.0 so the feathered halo has visible breathing
    // room at PoC camera distances; halo-core ratio matches the field.
    uPointSize: { value: options.pointSize ?? 14.0 },
    uPixelRatio: { value: options.pixelRatio ?? 1.0 },
    uAlpha: { value: options.alpha ?? 0.85 },
    uSelectionBoost: { value: 0.6 },
    pointTexture: { value: getFieldPointTexture() },
  };

  const displayMaterial = new THREE.ShaderMaterial({
    vertexShader: DISPLAY_VERTEX_SHADER,
    fragmentShader: DISPLAY_FRAGMENT_SHADER,
    uniforms: {
      uPointSize: uniforms.uPointSize,
      uPixelRatio: uniforms.uPixelRatio,
      uAlpha: uniforms.uAlpha,
      uSelectionBoost: uniforms.uSelectionBoost,
      pointTexture: uniforms.pointTexture,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  // Picking pass shares the same geometry but must be opaque (no alpha blend)
  // so the RGBA readback is deterministic per pixel.
  const pickingMaterial = new THREE.ShaderMaterial({
    vertexShader: PICKING_VERTEX_SHADER,
    fragmentShader: PICKING_FRAGMENT_SHADER,
    uniforms: {
      uPointSize: uniforms.uPointSize,
      uPixelRatio: uniforms.uPixelRatio,
    },
    transparent: false,
    depthWrite: true,
    blending: THREE.NoBlending,
  });

  return { displayMaterial, pickingMaterial, uniforms };
}

/**
 * Palette generator used by point-buffers.ts to assign a color per
 * cluster_id in mock data. Real fixtures will carry `cluster_id` from the
 * parquet and the same palette hashes over them. Kept deliberately simple —
 * this is a PoC; the final palette comes from the shared graph theme.
 */
export function orbClusterColor(
  clusterId: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  // Golden-ratio hue stepping gives visibly distinct clusters at small K.
  const hue = (clusterId * 0.61803398875) % 1;
  const sat = 0.68;
  const light = 0.62;

  // HSL → RGB (minimal inline impl; avoids pulling in three/math helpers).
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hPrime = hue * 6;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hPrime < 1) {
    r = c;
    g = x;
  } else if (hPrime < 2) {
    r = x;
    g = c;
  } else if (hPrime < 3) {
    g = c;
    b = x;
  } else if (hPrime < 4) {
    g = x;
    b = c;
  } else if (hPrime < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  out[0] = r + m;
  out[1] = g + m;
  out[2] = b + m;
  return out;
}
