import {
  COMPUTE_ATTRIBUTE_INDEX,
  COMPUTE_FRAME_INDEX,
  COMPUTE_POSITION_INDEX,
  COMPUTE_VELOCITY_INDEX,
  PICK_FRAME_INDEX,
  PICK_PARAM_INDEX,
  PICK_POSITION_INDEX,
  PICK_RESULT_INDEX,
  RECT_PARAM_INDEX,
  RECT_RESULT_INDEX,
  RENDER_ATTRIBUTE_INDEX,
  RENDER_FLAG_INDEX,
  RENDER_FRAME_INDEX,
  RENDER_POSITION_INDEX,
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

export const ORB_WEBGPU_SHADER_SOURCE = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  dt: f32,
  count: u32,
  _pad0: u32,
  aspect: f32,
  radiusScale: f32,
  rotation: f32,
  _pad1: f32,
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

@group(0) @binding(${COMPUTE_POSITION_INDEX}) var<storage, read_write> computePositions: array<vec4f>;
@group(0) @binding(${COMPUTE_VELOCITY_INDEX}) var<storage, read> computeVelocities: array<vec4f>;
@group(0) @binding(${COMPUTE_ATTRIBUTE_INDEX}) var<storage, read> computeAttributes: array<vec4f>;
@group(0) @binding(${COMPUTE_FRAME_INDEX}) var<uniform> computeFrame: FrameUniforms;
@group(0) @binding(${RENDER_POSITION_INDEX}) var<storage, read> renderPositions: array<vec4f>;
@group(0) @binding(${RENDER_ATTRIBUTE_INDEX}) var<storage, read> renderAttributes: array<vec4f>;
@group(0) @binding(${RENDER_FLAG_INDEX}) var<storage, read> renderFlags: array<u32>;
@group(0) @binding(${RENDER_FRAME_INDEX}) var<uniform> renderFrame: FrameUniforms;
@group(0) @binding(${PICK_POSITION_INDEX}) var<storage, read> pickPositions: array<vec4f>;
@group(0) @binding(${PICK_FRAME_INDEX}) var<uniform> pickFrame: FrameUniforms;
@group(0) @binding(${PICK_PARAM_INDEX}) var<uniform> pickParams: PickParams;
@group(0) @binding(${PICK_RESULT_INDEX}) var<storage, read_write> pickResult: array<u32>;
@group(0) @binding(${RECT_PARAM_INDEX}) var<uniform> rectParams: RectParams;
@group(0) @binding(${RECT_RESULT_INDEX}) var<storage, read_write> rectResult: array<u32>;

fn rotateY(p: vec4f, angle: f32) -> vec4f {
  let c = cos(angle);
  let s = sin(angle);
  return vec4f(p.x * c - p.z * s, p.y, p.x * s + p.z * c, p.w);
}

fn projectedCenter(p: vec4f) -> vec3f {
  let rotated = rotateY(p, renderFrame.rotation);
  let depthScale = clamp(1.0 + rotated.z * 0.22, 0.76, 1.28);
  return vec3f(
    rotated.x * depthScale / max(renderFrame.aspect, 0.1),
    rotated.y * depthScale,
    rotated.z,
  );
}

fn pickCenter(p: vec4f) -> vec2f {
  let rotated = rotateY(p, pickFrame.rotation);
  let depthScale = clamp(1.0 + rotated.z * 0.22, 0.76, 1.28);
  return vec2f(
    rotated.x * depthScale / max(pickParams.aspect, 0.1),
    rotated.y * depthScale,
  );
}

fn rectCenter(p: vec4f) -> vec2f {
  let rotated = rotateY(p, pickFrame.rotation);
  let depthScale = clamp(1.0 + rotated.z * 0.22, 0.76, 1.28);
  return vec2f(
    rotated.x * depthScale / max(rectParams.aspect, 0.1),
    rotated.y * depthScale,
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

@compute @workgroup_size(64)
fn integrateParticles(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= computeFrame.count) {
    return;
  }

  var p = computePositions[i];
  let v = computeVelocities[i];
  let attr = computeAttributes[i];
  let spin = computeFrame.dt * (0.10 + attr.w * 0.025);
  let c = cos(spin);
  let s = sin(spin);
  let x = p.x * c - p.z * s;
  let z = p.x * s + p.z * c;
  p.x = x + v.x * computeFrame.dt * 0.012;
  p.y = p.y + sin(computeFrame.time * 0.7 + f32(i) * 0.037) * computeFrame.dt * 0.00045;
  p.z = z + v.z * computeFrame.dt * 0.012;
  computePositions[i] = p;
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  let p = renderPositions[instanceIndex];
  let attr = renderAttributes[instanceIndex];
  let flag = renderFlags[instanceIndex];
  let corner = vertexCorner(vertexIndex);
  let projected = projectedCenter(p);
  let depthLight = clamp(0.58 + projected.z * 0.58, 0.36, 1.08);
  let pulse = 0.5 + 0.5 * sin(renderFrame.time * 4.2 + f32(instanceIndex) * 0.037);
  var radius = p.w * renderFrame.radiusScale * clamp(1.0 + projected.z * 0.20, 0.74, 1.24);
  var color = attr.rgb * depthLight;
  var alpha = 0.46 + depthLight * 0.16;
  var halo = 0.18 + attr.w * 0.035;
  var ring = 0.0;
  var coreBoost = 0.56;

  if ((flag & ${ORB_WEBGPU_SCOPE_DIM_FLAG}u) != 0u) {
    radius = radius * 0.82;
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
    radius = radius * (1.20 + pulse * 0.16);
    color = mix(color, vec3f(0.92, 0.72, 1.0), 0.48);
    alpha = max(alpha, 0.82);
    halo = max(halo, 0.62 + pulse * 0.26);
    ring = max(ring, 0.38 + pulse * 0.22);
  }
  if ((flag & ${ORB_WEBGPU_SELECTION_FLAG}u) != 0u) {
    radius = radius * 1.46;
    color = mix(color, vec3f(1.0, 0.78, 0.46), 0.54);
    alpha = max(alpha, 0.90);
    halo = max(halo, 0.54);
    ring = max(ring, 0.62);
  }
  if ((flag & ${ORB_WEBGPU_HOVER_FLAG}u) != 0u) {
    radius = radius * 1.70;
    color = mix(color, vec3f(0.78, 0.95, 1.0), 0.62);
    alpha = max(alpha, 0.96);
    halo = max(halo, 0.76);
    ring = max(ring, 0.80);
  }
  if ((flag & ${ORB_WEBGPU_FOCUS_FLAG}u) != 0u) {
    radius = radius * 2.15;
    color = vec3f(1.0, 0.92, 0.66);
    alpha = 1.0;
    halo = 1.0;
    ring = 1.0;
    coreBoost = 0.76;
  }

  let scale = vec2f(radius / max(renderFrame.aspect, 0.1), radius);
  var out: VertexOut;
  out.position = vec4f(projected.xy + corner * scale, 0.0, 1.0);
  out.local = corner;
  out.color = vec4f(color, alpha);
  out.effects = vec4f(halo, ring, coreBoost, depthLight);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let d = length(in.local);
  if (d > 1.05) {
    discard;
  }
  let core = 1.0 - smoothstep(0.08, 0.52, d);
  let body = 1.0 - smoothstep(0.36, 0.92, d);
  let halo = (1.0 - smoothstep(0.24, 1.05, d)) * in.effects.x;
  let ringOuter = 1.0 - smoothstep(0.74, 0.92, d);
  let ringInner = smoothstep(0.54, 0.72, d);
  let ring = ringOuter * ringInner * in.effects.y;
  let alpha = in.color.a * clamp(body * 0.42 + core * in.effects.z + halo * 0.28 + ring * 0.44, 0.0, 1.0);
  let rimColor = mix(in.color.rgb, vec3f(1.0, 0.94, 0.76), 0.50);
  let rgb = in.color.rgb * (0.52 + core * 0.58 + halo * 0.18) + rimColor * ring * 0.50;
  return vec4f(rgb * alpha, alpha);
}

@compute @workgroup_size(1)
fn pickParticle() {
  var best = 4294967295u;
  var bestScore = 1000000.0;
  var i = 0u;

  loop {
    if (i >= pickParams.count) {
      break;
    }
    let p = pickPositions[i];
    let center = pickCenter(p);
    let radius = p.w * pickFrame.radiusScale * 2.85;
    let d = distance(center, vec2f(pickParams.x, pickParams.y));
    if (d <= radius && d < bestScore) {
      best = i;
      bestScore = d;
    }
    i = i + 1u;
  }

  pickResult[0] = best;
}

@compute @workgroup_size(1)
fn pickRect() {
  rectResult[0] = 0u;
  var i = 0u;
  var written = 0u;

  loop {
    if (i >= rectParams.count) {
      break;
    }
    let center = rectCenter(pickPositions[i]);
    if (
      center.x >= rectParams.left &&
      center.x <= rectParams.right &&
      center.y >= rectParams.bottom &&
      center.y <= rectParams.top
    ) {
      written = written + 1u;
      rectResult[written] = i;
    }
    i = i + 1u;
  }

  rectResult[0] = written;
}
`;
