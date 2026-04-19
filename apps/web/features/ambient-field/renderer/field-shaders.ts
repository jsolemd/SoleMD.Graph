export const FIELD_VERTEX_SHADER = `
precision highp float;

attribute vec3 color;
attribute float aAlpha;
attribute float aIndex;
attribute float aSelection;

attribute float aStreamFreq;
attribute float aFunnelNarrow;
attribute float aFunnelThickness;
attribute float aFunnelStartShift;
attribute float aFunnelEndShift;

attribute vec3 aMove;
attribute vec3 aSpeed;
attribute vec3 aRandomness;

uniform bool uIsMobile;
uniform float uPixelRatio;
uniform float uScale;
uniform float uTime;

uniform float uSpeed;
uniform float uSize;
uniform float uAlpha;
uniform float uDepth;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSelection;
uniform float uPulseRate;
uniform float uPulsePhase;
uniform float uPulseSoftness;
uniform float uPulseSpatialScale;
uniform float uPulseStrength;
uniform float uPulseThreshold;

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

uniform vec3 uColorBase;
uniform vec3 uColorNoise;

varying float vAlpha;
varying float vDistance;
varying float vNoise;
varying vec3 vColor;
varying float vAccent;

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
    v += a * snoise(vec4(x, uTime));
    x = x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vNoise = fbm(position * (uFrequency + aStreamFreq * uStream));

  float colorNoise = clamp(vNoise, 0.0, 1.0);
  float r = uColorBase.r + (colorNoise * 4.0 * (uColorNoise.r - uColorBase.r));
  float g = uColorBase.g + (colorNoise * 4.0 * (uColorNoise.g - uColorBase.g));
  float b = uColorBase.b + (colorNoise * 4.0 * (uColorNoise.b - uColorBase.g));
  vec3 sourceColor = clamp(vec3(r, g, b), 0.0, 1.0);
  vec3 pulseBasis = position;
  float pulseBasisLength = max(length(pulseBasis), 0.0001);
  pulseBasis /= pulseBasisLength;
  float accentWavePrimary = 0.5 + 0.5 * snoise(vec4(
    pulseBasis * uPulseSpatialScale +
    vec3(
      uTime * uPulseRate * 0.28 + uPulsePhase,
      -uTime * uPulseRate * 0.19,
      uTime * uPulseRate * 0.13
    ),
    0.0
  ));
  float accentWaveSecondary = 0.5 + 0.5 * snoise(vec4(
    pulseBasis * (uPulseSpatialScale * 0.58) +
    vec3(
      -uTime * uPulseRate * 0.12,
      uTime * uPulseRate * 0.24 + uPulsePhase * 1.7,
      uTime * uPulseRate * 0.09
    ),
    0.0
  ));
  float accentField = max(accentWavePrimary, accentWaveSecondary * 0.94);
  float accentSelectionBias = 1.0 - smoothstep(0.22, 0.92, aSelection);
  float accentMask = smoothstep(
    max(0.0, uPulseThreshold - 0.08),
    uPulseThreshold + (uPulseSoftness * 0.82),
    accentField
  ) * smoothstep(0.1, 0.92, colorNoise) * mix(0.42, 1.0, accentSelectionBias);
  accentMask *= uPulseStrength;
  vec3 accentColor = clamp(color * (1.02 + 0.24 * accentField) + sourceColor * 0.06, 0.0, 1.0);
  vAccent = clamp(accentMask, 0.0, 1.0);
  vColor = mix(sourceColor, accentColor, vAccent);

  vec3 displaced = position;
  displaced *= (1.0 + (uAmplitude * vNoise));
  displaced += vec3(
    uScale * uDepth * aMove * aSpeed * snoise_1_2(vec2(aIndex, uTime * uSpeed))
  );

  if (uStream > 0.0) {
    displaced.x += uTime * uSpeed * uStream * 0.3;
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

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vDistance = -mvPosition.z;
  gl_PointSize = uSize;
  gl_PointSize *= 100.0 / vDistance;
  gl_PointSize *= uPixelRatio;

  vAlpha = uAlpha * aAlpha * (300.0 / vDistance);
  if (aSelection > uSelection) {
    vAlpha = 0.0;
  } else {
    vAlpha *= 1.0 + vAccent * 0.42;
  }
}
`;

export const FIELD_FRAGMENT_SHADER = `
precision highp float;

varying float vAlpha;
varying vec3 vColor;

uniform sampler2D pointTexture;

void main() {
  vec4 sprite = texture2D(pointTexture, gl_PointCoord);
  vec4 color = vec4(vColor, vAlpha) * sprite;

  if (color.a <= 0.01) {
    discard;
  }

  gl_FragColor = color;
}
`;
