export const FIELD_VERTEX_SHADER = `
precision highp float;

uniform bool uIsMobile;
uniform float uAlpha;
uniform float uAmplitude;
uniform float uDepth;
uniform float uFrequency;
uniform float uFunnelDistortion;
uniform float uFunnelEnd;
uniform float uFunnelEndShift;
uniform float uFunnelNarrow;
uniform float uFunnelStart;
uniform float uFunnelStartShift;
uniform float uFunnelThick;
uniform float uHeight;
uniform float uPixelRatio;
uniform float uScale;
uniform float uSelection;
uniform float uSize;
uniform float uSpeed;
uniform float uStream;
uniform float uTime;
uniform float uWidth;
uniform vec3 uColorBase;
uniform vec3 uColorNoise;

attribute vec3 aMove;
attribute vec3 aRandomness;
attribute vec3 aSpeed;
attribute float aAlpha;
attribute float aFunnelEndShift;
attribute float aFunnelNarrow;
attribute float aFunnelStartShift;
attribute float aFunnelThickness;
attribute float aIndex;
attribute float aSelection;
attribute float aStreamFreq;

varying float vAlpha;
varying vec3 vColor;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

float fbm(vec3 x) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int octave = 0; octave < 5; octave += 1) {
    value += amplitude * (noise3(x + vec3(0.0, 0.0, uTime * 0.12)) * 2.0 - 1.0);
    x = x * 2.02 + vec3(17.0, 9.0, 13.0);
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec3 displaced = position;
  float streamFreq = max(0.0, aStreamFreq);
  float fieldFreq = max(0.01, uFrequency + streamFreq * uStream);
  float noiseValue = fbm(position * fieldFreq);

  vec3 colorDelta = (uColorNoise - uColorBase) * clamp(noiseValue, 0.0, 1.0) * 4.0;
  vColor = clamp(uColorBase + colorDelta, 0.0, 1.0);

  displaced *= (1.0 + (uAmplitude * noiseValue));

  float driftNoise = noise3(vec3(aIndex * 0.013, uTime * max(0.05, uSpeed), 0.0)) * 2.0 - 1.0;
  displaced += uScale * uDepth * aMove * aSpeed * driftNoise * 0.018;

  if (uStream > 0.5) {
    displaced.x += uTime * uSpeed * uStream * 0.3;
    displaced.x = mod(displaced.x + uWidth * 0.5, uWidth) - uWidth * 0.5;

    float streamSpan = max(0.001, uFunnelEnd - uFunnelStart);
    float t = clamp((displaced.x - uFunnelStart) / streamSpan, 0.0, 1.0);
    float thickness = mix(uFunnelThick + aFunnelThickness, uFunnelNarrow + aFunnelNarrow, t);

    displaced.y += thickness * uHeight * aRandomness.y * uFunnelDistortion;
    displaced.y += (1.0 - t) * (uFunnelStartShift + aFunnelStartShift);
    displaced.y += t * (uFunnelEndShift + aFunnelEndShift);
    displaced.z += uHeight * aRandomness.z * (-1.0 * cos(displaced.x)) * uFunnelDistortion;

    if (uIsMobile) {
      displaced.xy = vec2(-displaced.y, displaced.x);
    }
  }

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float vDistance = -mvPosition.z;
  float pointSize = uSize;
  pointSize *= 100.0 / max(1.0, vDistance);
  pointSize *= uPixelRatio;
  gl_PointSize = clamp(pointSize, 0.5, uIsMobile ? 4.8 : 7.6);

  float selectionMask = step(aSelection, uSelection);
  vAlpha = uAlpha * aAlpha * (300.0 / max(20.0, vDistance)) * selectionMask;
}
`;

export const FIELD_FRAGMENT_SHADER = `
precision highp float;

varying float vAlpha;
varying vec3 vColor;

uniform sampler2D pointTexture;

void main() {
  float spriteAlpha = texture2D(pointTexture, gl_PointCoord).a;
  spriteAlpha = smoothstep(0.02, 1.0, spriteAlpha);
  float alpha = spriteAlpha * vAlpha;

  if (alpha <= 0.01) {
    discard;
  }

  gl_FragColor = vec4(vColor, alpha);
}
`;
