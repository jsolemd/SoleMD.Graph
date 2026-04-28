import {
  COMPUTE_ATTRIBUTE_INDEX,
  COMPUTE_DISPLAY_INDEX,
  COMPUTE_FRAME_INDEX,
  COMPUTE_FLAG_INDEX,
  COMPUTE_POSITION_INDEX,
  COMPUTE_VELOCITY_INDEX,
  PICK_DISPLAY_INDEX,
  PICK_PARAM_INDEX,
  PICK_RESULT_INDEX,
  RECT_PARAM_INDEX,
  RECT_RESULT_INDEX,
  RENDER_DISPLAY_INDEX,
  RENDER_FRAME_INDEX,
  RENDER_SPRITE_SAMPLER_INDEX,
  RENDER_SPRITE_TEXTURE_INDEX,
} from "./orb-webgpu-layout";
import {
  ORB_WEBGPU_EVIDENCE_FLAG,
  ORB_WEBGPU_FOCUS_FLAG,
  ORB_WEBGPU_HOVER_FLAG,
  ORB_WEBGPU_NEIGHBOR_FLAG,
  ORB_WEBGPU_SCOPE_DIM_FLAG,
  ORB_WEBGPU_SCOPE_FLAG,
  ORB_WEBGPU_SELECTION_FLAG,
} from "./orb-webgpu-particles";
import {
  LANDING_RAINBOW_PERIOD_SECONDS,
  LANDING_RAINBOW_RGB,
  LANDING_RAINBOW_STOP_SECONDS,
} from "../../field/shared/landing-feel-constants";

const LANDING_PALETTE_WGSL = LANDING_RAINBOW_RGB.map(toWgslColor).join(",\n    ");

export const ORB_WEBGPU_SHADER_SOURCE = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  dt: f32,
  count: u32,
  _pad0: u32,
  aspect: f32,
  radiusScale: f32,
  rotation: f32,
  colorTime: f32,
  baseColor: vec4f,
  fieldParams: vec4f,
};

struct PickParams {
  x: f32,
  y: f32,
  aspect: f32,
  count: u32,
};

struct RectParams {
  left: f32,
  top: f32,
  right: f32,
  bottom: f32,
  aspect: f32,
  count: u32,
  mode: u32,
  _pad0: u32,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) effects: vec4f,
};

struct DisplayParticle {
  center: vec4f,
  color: vec4f,
  effects: vec4f,
};

@group(0) @binding(${COMPUTE_POSITION_INDEX}) var<storage, read_write> computePositions: array<vec4f>;
@group(0) @binding(${COMPUTE_VELOCITY_INDEX}) var<storage, read> computeVelocities: array<vec4f>;
@group(0) @binding(${COMPUTE_ATTRIBUTE_INDEX}) var<storage, read> computeAttributes: array<vec4f>;
@group(0) @binding(${COMPUTE_FRAME_INDEX}) var<uniform> computeFrame: FrameUniforms;
@group(0) @binding(${COMPUTE_FLAG_INDEX}) var<storage, read> computeFlags: array<u32>;
@group(0) @binding(${COMPUTE_DISPLAY_INDEX}) var<storage, read_write> computeDisplay: array<DisplayParticle>;
@group(0) @binding(${RENDER_DISPLAY_INDEX}) var<storage, read> renderDisplay: array<DisplayParticle>;
@group(0) @binding(${RENDER_FRAME_INDEX}) var<uniform> renderFrame: FrameUniforms;
@group(0) @binding(${RENDER_SPRITE_TEXTURE_INDEX}) var spriteTexture: texture_2d<f32>;
@group(0) @binding(${RENDER_SPRITE_SAMPLER_INDEX}) var spriteSampler: sampler;
@group(0) @binding(${PICK_DISPLAY_INDEX}) var<storage, read> pickDisplay: array<DisplayParticle>;
@group(0) @binding(${PICK_PARAM_INDEX}) var<uniform> pickParams: PickParams;
@group(0) @binding(${PICK_RESULT_INDEX}) var<storage, read_write> pickResult: array<atomic<u32>>;
@group(0) @binding(${RECT_PARAM_INDEX}) var<uniform> rectParams: RectParams;
@group(0) @binding(${RECT_RESULT_INDEX}) var<storage, read_write> rectResult: array<atomic<u32>>;

const LANDING_RAINBOW_STOP_SECONDS = ${toWgslFloat(LANDING_RAINBOW_STOP_SECONDS)};
const LANDING_RAINBOW_PERIOD_SECONDS = ${toWgslFloat(LANDING_RAINBOW_PERIOD_SECONDS)};
const ORB_NOISE_DOMAIN_SCALE = 3.1;
const ORB_COLOR_NOISE_FLOOR = 0.02;
const ORB_COLOR_NOISE_CEILING = 0.34;
const ORB_COLOR_NOISE_WEIGHT = 0.42;
const LANDING_PALETTE = array<vec3f, 8>(
    ${LANDING_PALETTE_WGSL}
);

fn rotateY(p: vec4f, angle: f32) -> vec4f {
  let c = cos(angle);
  let s = sin(angle);
  return vec4f(p.x * c + p.z * s, p.y, -p.x * s + p.z * c, p.w);
}

fn projectedCenter(p: vec4f, aspect: f32, rotation: f32) -> vec3f {
  let rotated = rotateY(p, rotation);
  let depthScale = clamp(1.0 + rotated.z * 0.22, 0.76, 1.28);
  return vec3f(
    rotated.x * depthScale / max(aspect, 0.1),
    rotated.y * depthScale,
    rotated.z,
  );
}

fn vertexCorner(vertexIndex: u32) -> vec2f {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );
  return corners[vertexIndex];
}

fn desaturate(color: vec3f, amount: f32) -> vec3f {
  let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  return mix(color, vec3f(luma), amount);
}

fn mod2892(x: vec2f) -> vec2f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod2893(x: vec3f) -> vec3f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod2894(x: vec4f) -> vec4f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod2891(x: f32) -> f32 {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute3(x: vec3f) -> vec3f {
  return mod2893(((x * 34.0) + 1.0) * x);
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

fn simplexNoise2(v: vec2f) -> f32 {
  let c = vec4f(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439,
  );
  var i = floor(v + dot(v, c.yy));
  let x0 = v - i + dot(i, c.xx);
  var i1 = vec2f(0.0, 1.0);
  if (x0.x > x0.y) {
    i1 = vec2f(1.0, 0.0);
  }
  var x12 = x0.xyxy + c.xxzz;
  x12 = vec4f(x12.xy - i1, x12.zw);
  i = mod2892(i);
  let p = permute3(
    permute3(i.y + vec3f(0.0, i1.y, 1.0)) +
    i.x + vec3f(0.0, i1.x, 1.0)
  );
  var m = max(
    0.5 - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    vec3f(0.0),
  );
  m = m * m;
  m = m * m;
  let x = 2.0 * fract(p * c.www) - vec3f(1.0);
  let h = abs(x) - vec3f(0.5);
  let ox = floor(x + vec3f(0.5));
  let a0 = x - ox;
  m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));
  let g = vec3f(
    a0.x * x0.x + h.x * x0.y,
    a0.y * x12.x + h.y * x12.y,
    a0.z * x12.z + h.z * x12.w,
  );
  return 130.0 * dot(m, g);
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
  var x = p;
  var value = 0.0;
  var amplitude = 0.5;
  for (var octave = 0u; octave < 5u; octave = octave + 1u) {
    value = value + amplitude * simplexNoise4(vec4f(x, time));
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
  return landingFbm(p, colorTime * 0.25);
}

fn landingMotionNoise(
  instanceIndex: u32,
  motion: vec4f,
  colorTime: f32,
) -> f32 {
  let speed = max(motion.w, 0.001);
  return simplexNoise2(vec2f(f32(instanceIndex), colorTime * 0.25 * speed));
}

fn landingBaseColor() -> vec3f {
  return computeFrame.baseColor.rgb;
}

fn landingNoiseColor(colorTime: f32) -> vec3f {
  let wrappedTime =
    colorTime - floor(colorTime / LANDING_RAINBOW_PERIOD_SECONDS) *
    LANDING_RAINBOW_PERIOD_SECONDS;
  let segment = wrappedTime / LANDING_RAINBOW_STOP_SECONDS;
  let index = u32(floor(segment)) % 8u;
  let nextIndex = (index + 1u) % 8u;
  return mix(LANDING_PALETTE[index], LANDING_PALETTE[nextIndex], fract(segment));
}

fn visualRadius(baseRadius: f32, z: f32, flag: u32, colorTime: f32) -> f32 {
  let pulse = 0.5 + 0.5 * sin(colorTime * 4.2);
  var radius = baseRadius * clamp(1.0 + z * 0.20, 0.74, 1.24);
  if ((flag & ${ORB_WEBGPU_SCOPE_DIM_FLAG}u) != 0u) {
    radius = radius * 0.82;
  }
  if ((flag & ${ORB_WEBGPU_EVIDENCE_FLAG}u) != 0u) {
    radius = radius * (1.20 + pulse * 0.16);
  }
  if ((flag & ${ORB_WEBGPU_SELECTION_FLAG}u) != 0u) {
    radius = radius * 1.46;
  }
  if ((flag & ${ORB_WEBGPU_HOVER_FLAG}u) != 0u) {
    radius = radius * 1.70;
  }
  if ((flag & ${ORB_WEBGPU_FOCUS_FLAG}u) != 0u) {
    radius = radius * 2.15;
  }
  return radius;
}

@compute @workgroup_size(64)
fn integrateParticles(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= computeFrame.count) {
    return;
  }

  let p = computePositions[i];
  let motion = computeVelocities[i];
  let attr = computeAttributes[i];
  let speed = attr.rgb;
  let flag = computeFlags[i];
  let amplitude = computeFrame.fieldParams.x;
  let depth = computeFrame.fieldParams.y;
  let frequency = computeFrame.fieldParams.z;
  let waveSpeed = computeFrame.fieldParams.w;
  let colorTime = computeFrame.colorTime * waveSpeed;
  let fieldNoise = landingFieldNoise(
    p.xyz * frequency * ORB_NOISE_DOMAIN_SCALE,
    motion,
    i,
    colorTime,
  );
  let liveDrift = landingMotionNoise(i, motion, colorTime);
  let normal = normalize(p.xyz + vec3f(0.0001, 0.0001, 0.0001));
  let displaced = vec4f(
    p.xyz * (1.0 + amplitude * fieldNoise + liveDrift * 0.012) +
      normal * liveDrift * 0.010 +
      motion.xyz * speed * depth * 6.6 * (fieldNoise * 0.92 + liveDrift * 0.52),
    p.w,
  );
  let projected = projectedCenter(
    displaced,
    computeFrame.aspect,
    computeFrame.rotation,
  );
  let rotatedNormal = normalize(rotateY(vec4f(normal, 1.0), computeFrame.rotation).xyz);
  let rim = pow(1.0 - clamp(dot(rotatedNormal, vec3f(0.0, 0.0, 1.0)), 0.0, 1.0), 2.0);
  let frontFade = smoothstep(-0.54, 0.66, projected.z);
  let depthLight = clamp(0.64 + projected.z * 0.34 + rim * 0.22, 0.36, 1.16);
  let pulse = 0.5 + 0.5 * sin(computeFrame.colorTime * 4.2 + f32(i) * 0.037);
  let baseColor = landingBaseColor();
  let noiseColor = landingNoiseColor(computeFrame.colorTime);
  let vNoise =
    smoothstep(ORB_COLOR_NOISE_FLOOR, ORB_COLOR_NOISE_CEILING, fieldNoise) *
    ORB_COLOR_NOISE_WEIGHT;
  let burstColor = clamp(
    baseColor + vNoise * 4.0 * (noiseColor - baseColor),
    vec3f(0.0),
    vec3f(1.0),
  );
  var radius = visualRadius(
    displaced.w * computeFrame.radiusScale,
    projected.z,
    flag,
    computeFrame.colorTime,
  );
  radius = radius * (1.0 + liveDrift * 0.030 + vNoise * 0.11);
  var color = burstColor;
  color = mix(color * depthLight, color * 1.34 + vec3f(0.04), rim * 0.38);
  var alpha =
    (0.47 + depthLight * 0.17 + vNoise * 0.10) *
    clamp(attr.w, 0.2, 1.0) *
    mix(0.30, 1.0, frontFade);
  var halo = 0.15 + attr.w * 0.026 + vNoise * 0.05;
  var ring = 0.0;

  if ((flag & ${ORB_WEBGPU_SCOPE_DIM_FLAG}u) != 0u) {
    color = desaturate(color, 0.48) * 0.54;
    alpha = alpha * 0.30;
    halo = halo * 0.25;
  }
  if ((flag & ${ORB_WEBGPU_SCOPE_FLAG}u) != 0u) {
    color = mix(color, vec3f(0.66, 0.86, 0.98), 0.32);
    alpha = max(alpha, 0.72);
    halo = max(halo, 0.28);
  }
  if ((flag & ${ORB_WEBGPU_NEIGHBOR_FLAG}u) != 0u) {
    color = mix(color, vec3f(0.72, 0.90, 0.98), 0.35);
    alpha = max(alpha, 0.74);
    ring = max(ring, 0.20);
  }
  if ((flag & ${ORB_WEBGPU_EVIDENCE_FLAG}u) != 0u) {
    color = mix(color, vec3f(0.92, 0.72, 1.0), 0.48);
    alpha = max(alpha, 0.82);
    halo = max(halo, 0.62 + pulse * 0.26);
    ring = max(ring, 0.38 + pulse * 0.22);
  }
  if ((flag & ${ORB_WEBGPU_SELECTION_FLAG}u) != 0u) {
    color = mix(color, vec3f(1.0, 0.78, 0.46), 0.54);
    alpha = max(alpha, 0.90);
    halo = max(halo, 0.54);
    ring = max(ring, 0.62);
  }
  if ((flag & ${ORB_WEBGPU_HOVER_FLAG}u) != 0u) {
    color = mix(color, vec3f(0.78, 0.95, 1.0), 0.62);
    alpha = max(alpha, 0.96);
    halo = max(halo, 0.76);
    ring = max(ring, 0.80);
  }
  if ((flag & ${ORB_WEBGPU_FOCUS_FLAG}u) != 0u) {
    color = vec3f(1.0, 0.92, 0.66);
    alpha = 1.0;
    halo = 1.0;
    ring = 1.0;
  }

  computeDisplay[i] = DisplayParticle(
    vec4f(projected.xy, projected.z, radius),
    vec4f(color, alpha),
    vec4f(halo, ring, rim, frontFade),
  );
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  let display = renderDisplay[instanceIndex];
  let corner = vertexCorner(vertexIndex);
  let radius = display.center.w;
  let scale = vec2f(radius / max(renderFrame.aspect, 0.1), radius);
  var out: VertexOut;
  out.position = vec4f(display.center.xy + corner * scale, 0.0, 1.0);
  out.local = corner;
  out.color = display.color;
  out.effects = display.effects;
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let uv = in.local * 0.5 + vec2f(0.5);
  let sprite = textureSample(spriteTexture, spriteSampler, uv);
  let spriteAlpha = sprite.a;
  if (spriteAlpha <= 0.01) {
    discard;
  }
  let d = length(in.local);
  let halo = (1.0 - smoothstep(0.24, 1.05, d)) * in.effects.x;
  let ringOuter = 1.0 - smoothstep(0.74, 0.92, d);
  let ringInner = smoothstep(0.54, 0.72, d);
  let ring = ringOuter * ringInner * in.effects.y;
  let alpha =
    in.color.a *
    spriteAlpha *
    in.effects.w *
    clamp(1.0 + halo * 0.18 + ring * 0.32, 0.0, 1.0);
  let rimColor = in.color.rgb * 1.35 + vec3f(0.04);
  let rgb =
    in.color.rgb * (sprite.rgb + halo * 0.10) +
    rimColor * ring * 0.42 +
    rimColor * in.effects.z * 0.12;
  return vec4f(rgb * alpha, alpha);
}

@compute @workgroup_size(64)
fn pickParticle(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= pickParams.count) {
    return;
  }
  let display = pickDisplay[i];
  let center = display.center.xy;
  let radius = display.center.w * 1.18;
  let delta = vec2f(
    (center.x - pickParams.x) * max(pickParams.aspect, 0.1),
    center.y - pickParams.y,
  );
  let d = length(delta);
  if (d <= radius && i <= 65535u) {
    let score = u32(clamp(d / max(radius, 0.000001), 0.0, 1.0) * 65535.0);
    atomicMin(&pickResult[0], (score << 16u) | i);
  }
}

@compute @workgroup_size(64)
fn pickRect(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= rectParams.count) {
    return;
  }
  let center = pickDisplay[i].center.xy;
  if (
    center.x >= rectParams.left &&
    center.x <= rectParams.right &&
    center.y >= rectParams.bottom &&
    center.y <= rectParams.top
  ) {
    let writeIndex = atomicAdd(&rectResult[0], 1u) + 1u;
    atomicStore(&rectResult[writeIndex], i);
  }
}
`;

function toWgslColor(
  color: readonly [number, number, number],
): string {
  return `vec3f(${toWgslFloat(color[0] / 255)}, ${toWgslFloat(color[1] / 255)}, ${toWgslFloat(color[2] / 255)})`;
}

function toWgslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : value.toFixed(6);
}
