// Shared GLSL chunks for the field vertex pipeline.
//
// Both the display shader (`FIELD_VERTEX_SHADER`) and the orb picking
// shader include these chunks so clicks hit pixels precisely matching
// what the user sees — no position-only drift under paper-mode aSpeed
// (up to 3.0) and aClickPack.w (size factor 0.5–2.0).
//
// The extraction is mechanical: these chunks are the exact GLSL from
// the pre-refactor FIELD_VERTEX_SHADER, re-emitted as named string
// constants and concatenated back in. No semantic changes.

export const FIELD_ATTRIBUTE_DECLS = /* glsl */ `
attribute float aIndex;

// Per-particle category tag baked by field-attribute-baker.ts —
// 0 = paper, 1 = entity, 2 = relation, 3 = evidence. Resolves which
// category floor this particle uses; no color segmenting.
attribute float aStreamFreq;
attribute float aFunnelNarrow;
attribute float aFunnelThickness;
attribute float aFunnelStartShift;
attribute float aFunnelEndShift;

attribute vec3 aMove;
attribute vec3 aSpeed;
attribute vec3 aRandomness;

// Paper-mode additions, packed into a single vec4 so the total
// attribute budget matches the pre-pivot shader. aClickPack.xyz is the
// click-attraction offset (0,0,0 in lands-mode); aClickPack.w is the
// per-particle size factor (1.0 in lands-mode).
attribute vec4 aClickPack;
`;

export const FIELD_UNIFORM_DECLS = /* glsl */ `
uniform bool uIsMobile;
uniform float uPixelRatio;
uniform float uScale;
uniform float uTime;
uniform float uTimeFactor;

uniform float uSpeed;
uniform float uSize;
uniform float uDepth;
uniform float uAmplitude;
uniform float uFrequency;

uniform float uClickStrength;

uniform float uWidth;
uniform float uHeight;
uniform float uStream;
uniform float uFunnelStart;
uniform float uFunnelEnd;
uniform float uFunnelThick;
uniform float uFunnelNarrow;
uniform float uFunnelStartShift;
uniform float uFunnelEndShift;
uniform float uFunnelDistortion;
`;

export const FIELD_NOISE_HELPERS = /* glsl */ `
vec3 mod289_1_0(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289_1_0(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute_1_1(vec3 x) {
  return mod289_1_0(((x * 34.0) + 1.0) * x);
}

float snoise_1_2(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_1_0(i);
  vec3 p = permute_1_1(
    permute_1_1(i.y + vec3(0.0, i1.y, 1.0)) +
    i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float permute(float x) {
  return floor(mod(((x * 34.0) + 1.0) * x, 289.0));
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float taylorInvSqrt(float r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec4 grad4(float j, vec4 ip) {
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p;
  vec4 s;

  p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;

  return p;
}

float snoise(vec4 v) {
  const vec2 C = vec2(0.138196601125010504, 0.309016994374947451);

  vec4 i = floor(v + dot(v, C.yyyy));
  vec4 x0 = v - i + dot(i, C.xxxx);

  vec4 i0;
  vec3 isX = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);

  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  vec4 i3 = clamp(i0, 0.0, 1.0);
  vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

  vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
  vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
  vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
  vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;

  i = mod(i, 289.0);
  float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
  vec4 j1 = permute(permute(permute(permute(
    i.w + vec4(i1.w, i2.w, i3.w, 1.0)) +
    i.z + vec4(i1.z, i2.z, i3.z, 1.0)) +
    i.y + vec4(i1.y, i2.y, i3.y, 1.0)) +
    i.x + vec4(i1.x, i2.x, i3.x, 1.0));

  vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);

  vec4 p0 = grad4(j0, ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);

  vec4 norm = taylorInvSqrt(vec4(
    dot(p0, p0),
    dot(p1, p1),
    dot(p2, p2),
    dot(p3, p3)
  ));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4, p4));

  vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * (
    dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
    dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4)))
  );
}

#define NUM_OCTAVES 5
float fbm(vec3 x) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * snoise(vec4(x, uTime * uTimeFactor));
    x = x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}
`;

// Displaces `position` (the current vertex position attribute) using
// the Maze-derived motion recipe. Writes the fbm noise value into the
// `outNoise` out-param — display code reads it into a vNoise varying
// for color/cluster emergence; picking ignores it.
//
// Requires `position` (builtin attribute) and `aStreamFreq`, `aMove`,
// `aSpeed`, `aRandomness`, `aClickPack`, `aIndex`, `aFunnel*` from
// FIELD_ATTRIBUTE_DECLS, plus every uniform in FIELD_UNIFORM_DECLS.
export const FIELD_DISPLACEMENT_FN = /* glsl */ `
vec3 computeFieldDisplacement(out float outNoise) {
  float noise = fbm(position * (uFrequency + aStreamFreq * uStream));
  outNoise = noise;

  vec3 displaced = position;
  displaced *= (1.0 + (uAmplitude * noise));
  displaced += vec3(
    uScale * uDepth * aMove * aSpeed * snoise_1_2(vec2(aIndex, uTime * uTimeFactor * uSpeed))
  );

  // Click-attraction displacement. aClickPack.xyz is zero in lands-mode
  // AND when no click sim is active; uClickStrength gates the fade-in/out.
  displaced += aClickPack.xyz * uClickStrength;

  if (uStream > 0.0) {
    displaced.x += uTime * uTimeFactor * uSpeed * uStream * 0.3;
    displaced.x = mod(displaced.x - uWidth * 0.5, uWidth) - uWidth * 0.5;

    float t = clamp((displaced.x - uFunnelStart) / (uFunnelEnd - uFunnelStart), 0.0, 1.0);
    float thickness = mix(
      uFunnelThick + aFunnelThickness,
      uFunnelNarrow + aFunnelNarrow,
      t
    );

    displaced.y += thickness * uHeight * aRandomness.y * uFunnelDistortion;
    displaced.y += (1.0 - t) * (uFunnelStartShift + aFunnelStartShift);
    displaced.y += t * (uFunnelEndShift + aFunnelEndShift);
    displaced.z += uHeight * aRandomness.z * (-1.0 * cos(displaced.x)) * uFunnelDistortion;

    mat2 rot = mat2(0.0, -1.0, 1.0, 0.0);
    if (uIsMobile) {
      displaced.xy = rot * displaced.xy;
    }
  }

  return displaced;
}
`;

// Returns the unclamped base point size in pixels matching the current
// display shader: uSize * (100 / viewZ) * uPixelRatio * aClickPack.w.
// Display applies its selection-boost multiplier on top; picking clamps
// the returned value.
export const FIELD_POINT_SIZE_FN = /* glsl */ `
float computeFieldPointSize(vec4 mvPosition) {
  float dist = -mvPosition.z;
  float size = uSize;
  size *= 100.0 / dist;
  size *= uPixelRatio;
  // Paper-mode per-particle size modulation. aClickPack.w = 1.0 in
  // lands-mode so this multiply is a bit-exact no-op there.
  size *= aClickPack.w;
  return size;
}
`;
