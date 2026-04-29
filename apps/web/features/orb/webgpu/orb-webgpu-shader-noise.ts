// Shared WGSL noise primitives for the orb shader. Pulled out of the
// monolithic shader source so the main shader file stays focused on
// the orb's display/compute logic and can stay under the 600-line
// modularization limit. Concatenated into the WGSL module via template
// interpolation.

import {
  ORB_FIELD_NOISE_TIME_SCALE,
  ORB_PALETTE_PERIOD_SECONDS,
  formatWgslFloat,
} from "./orb-webgpu-visual-config";

export const ORB_WEBGPU_SHADER_NOISE_WGSL = /* wgsl */ `
const ORB_PALETTE_PERIOD_SECONDS = ${formatWgslFloat(ORB_PALETTE_PERIOD_SECONDS)};
const ORB_FIELD_NOISE_TIME_SCALE = ${formatWgslFloat(ORB_FIELD_NOISE_TIME_SCALE)};

fn mod2893(x: vec3f) -> vec3f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod2894(x: vec4f) -> vec4f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod2891(x: f32) -> f32 {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute4(x: vec4f) -> vec4f {
  return mod2894(((x * 34.0) + 1.0) * x);
}

fn permute1(x: f32) -> f32 {
  return mod2891(((x * 34.0) + 1.0) * x);
}

fn taylorInvSqrt4(r: vec4f) -> vec4f {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn taylorInvSqrt1(r: f32) -> f32 {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn grad4(j: f32, ip: vec4f) -> vec4f {
  let pxyz = floor(fract(vec3f(j) * ip.xyz) * 7.0) * ip.z - vec3f(1.0);
  let pw = 1.5 - dot(abs(pxyz), vec3f(1.0));
  let s = vec4f(
    select(0.0, 1.0, pxyz.x < 0.0),
    select(0.0, 1.0, pxyz.y < 0.0),
    select(0.0, 1.0, pxyz.z < 0.0),
    select(0.0, 1.0, pw < 0.0),
  );
  return vec4f(pxyz + (s.xyz * 2.0 - vec3f(1.0)) * s.w, pw);
}

fn simplexNoise4(v: vec4f) -> f32 {
  let c = vec2f(0.138196601125010504, 0.309016994374947451);
  var i = floor(v + dot(v, c.yyyy));
  let x0 = v - i + dot(i, c.xxxx);
  let isX = step(x0.yzw, x0.xxx);
  let isYZ = step(x0.zww, x0.yyz);
  var i0 = vec4f(
    isX.x + isX.y + isX.z,
    1.0 - isX.x,
    1.0 - isX.y,
    1.0 - isX.z,
  );
  i0 = vec4f(
    i0.x,
    i0.y + isYZ.x + isYZ.y,
    i0.z + 1.0 - isYZ.x + isYZ.z,
    i0.w + 1.0 - isYZ.y + 1.0 - isYZ.z,
  );

  let i3 = clamp(i0, vec4f(0.0), vec4f(1.0));
  let i2 = clamp(i0 - vec4f(1.0), vec4f(0.0), vec4f(1.0));
  let i1 = clamp(i0 - vec4f(2.0), vec4f(0.0), vec4f(1.0));
  let x1 = x0 - i1 + c.xxxx;
  let x2 = x0 - i2 + 2.0 * c.xxxx;
  let x3 = x0 - i3 + 3.0 * c.xxxx;
  let x4 = x0 - vec4f(1.0) + 4.0 * c.xxxx;

  i = mod2894(i);
  let j0 = permute1(permute1(permute1(permute1(i.w) + i.z) + i.y) + i.x);
  let j1 = permute4(permute4(permute4(permute4(
    i.w + vec4f(i1.w, i2.w, i3.w, 1.0)) +
    i.z + vec4f(i1.z, i2.z, i3.z, 1.0)) +
    i.y + vec4f(i1.y, i2.y, i3.y, 1.0)) +
    i.x + vec4f(i1.x, i2.x, i3.x, 1.0));

  let ip = vec4f(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
  var p0 = grad4(j0, ip);
  var p1 = grad4(j1.x, ip);
  var p2 = grad4(j1.y, ip);
  var p3 = grad4(j1.z, ip);
  var p4 = grad4(j1.w, ip);

  let norm = taylorInvSqrt4(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 = p0 * norm.x;
  p1 = p1 * norm.y;
  p2 = p2 * norm.z;
  p3 = p3 * norm.w;
  p4 = p4 * taylorInvSqrt1(dot(p4, p4));

  var m0 = max(0.6 - vec3f(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3f(0.0));
  var m1 = max(0.6 - vec2f(dot(x3, x3), dot(x4, x4)), vec2f(0.0));
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * (
    dot(m0 * m0, vec3f(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
    dot(m1 * m1, vec2f(dot(p3, x3), dot(p4, x4)))
  );
}

fn landingFbm(p: vec3f, time: f32) -> f32 {
  // Per-octave time multipliers introduce progression variance across
  // spatial scales: the coarse, large-scale regions (octave 0, weight
  // 0.5) drift at 0.4× of caller-supplied time so big color zones take
  // their time crossing the cloud; the fine, small-scale details
  // (octave 4, weight 0.03125) move at 1.5× so they dance with life
  // around the slow base. The mean is 1.0 so overall pace tracks the
  // caller's time scale, but the field now reads with varied region
  // sizes evolving at varied rates — visible "spacing" and rhythm.
  let TIME_SCALES = array<f32, 5>(0.4, 0.7, 1.0, 1.4, 1.5);
  var x = p;
  var value = 0.0;
  var amplitude = 0.5;
  for (var octave = 0u; octave < 5u; octave = octave + 1u) {
    let octaveTime = time * TIME_SCALES[octave];
    value = value + amplitude * simplexNoise4(vec4f(x, octaveTime));
    x = x * 2.0 + vec3f(100.0);
    amplitude = amplitude * 0.5;
  }
  return value;
}

fn landingFieldNoise(
  p: vec3f,
  motion: vec4f,
  instanceIndex: u32,
  colorTime: f32,
) -> f32 {
  _ = motion;
  _ = instanceIndex;
  // ORB_FIELD_NOISE_TIME_SCALE on the field-noise sample (down from 0.25). This
  // slows both the spatial drift of color regions and the radial
  // breathing rhythm — the user-perceived "color movement". Stateful
  // particle motion is integrated separately in orb-webgpu-shader.ts.
  return landingFbm(p, colorTime * ORB_FIELD_NOISE_TIME_SCALE);
}

`;
