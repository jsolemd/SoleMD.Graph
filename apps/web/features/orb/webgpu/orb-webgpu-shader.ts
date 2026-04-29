import {
  COMPUTE_ATTRIBUTE_INDEX,
  COMPUTE_DISPLAY_INDEX,
  COMPUTE_FRAME_INDEX,
  COMPUTE_FLAG_INDEX,
  COMPUTE_PALETTE_SAMPLER_INDEX,
  COMPUTE_PALETTE_TEXTURE_INDEX,
  COMPUTE_POSITION_INDEX,
  COMPUTE_SIZES_INDEX,
  COMPUTE_VELOCITY_INDEX,
  COMPUTE_WEIGHT_INDEX,
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
  ORB_WEBGPU_DIM_FLAG,
  ORB_WEBGPU_EVIDENCE_FLAG,
  ORB_WEBGPU_NEIGHBOR_FLAG,
  ORB_WEBGPU_SCOPE_FLAG,
} from "./orb-webgpu-particles";
import { ORB_WEBGPU_SHADER_NOISE_WGSL } from "./orb-webgpu-shader-noise";

export const ORB_WEBGPU_SHADER_SOURCE = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  dt: f32,
  count: u32,
  viewZoom: f32,
  aspect: f32,
  radiusScale: f32,
  colorTime: f32,
  focusIndex: i32,
  baseColor: vec4f,
  fieldParams: vec4f,
  viewPan: vec2f,
  // 8 bytes of natural padding here so rotation lands at the
  // mat3x3<f32> alignment boundary (16) at offset 80.
  // Rotation matrix is precomputed CPU-side from yaw + pitch — keeping
  // the trig out of the per-particle compute path. WGSL mat3x3<f32>
  // stores 3 column vectors padded to 16 bytes each (48 bytes total).
  rotation: mat3x3<f32>,
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
  // Halo + ring intensities only — fragmentMain doesn't need rim or
  // depth-fade values, so we don't pay per-particle bandwidth on them.
  @location(2) effects: vec2f,
};

struct DisplayParticle {
  center: vec4f,
  color: vec4f,
  effects: vec2f,
};

// computePositions / computeVelocities / computeAttributes are declared
// read_write so the seedAmbientGeometry compute entrypoint can write
// the GPU-synthesized Fibonacci layout, ambient drift, and base attribute
// variance once at first non-empty upload. integrateParticles still only
// reads these — read_write is a superset of read.
@group(0) @binding(${COMPUTE_POSITION_INDEX}) var<storage, read_write> computePositions: array<vec4f>;
@group(0) @binding(${COMPUTE_VELOCITY_INDEX}) var<storage, read_write> computeVelocities: array<vec4f>;
@group(0) @binding(${COMPUTE_ATTRIBUTE_INDEX}) var<storage, read_write> computeAttributes: array<vec4f>;
@group(0) @binding(${COMPUTE_FRAME_INDEX}) var<uniform> computeFrame: FrameUniforms;
@group(0) @binding(${COMPUTE_WEIGHT_INDEX}) var<storage, read> computeWeights: array<vec4f>;
@group(0) @binding(${COMPUTE_FLAG_INDEX}) var<storage, read> computeFlags: array<u32>;
// Per-particle radius. CPU-owned: chunk applies write
// DEFAULT_RADIUS * mapping.sizeFactor per particle; replaces the old
// positions[i].w carrier. Read by integrateParticles via visualRadius.
@group(0) @binding(${COMPUTE_SIZES_INDEX}) var<storage, read> computeSizes: array<f32>;
@group(0) @binding(${COMPUTE_PALETTE_TEXTURE_INDEX}) var paletteTexture: texture_2d<f32>;
@group(0) @binding(${COMPUTE_PALETTE_SAMPLER_INDEX}) var paletteSampler: sampler;
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

${ORB_WEBGPU_SHADER_NOISE_WGSL}

// Yaw + pitch are baked CPU-side into a single 3×3 rotation matrix
// stored in FrameUniforms.rotation, so per-particle code does one
// mat3 × vec3 multiply instead of 4 cos + 4 sin per rotation.
// Composition order in the host packer is Rx(pitch) * Ry(yaw): yaw is
// applied first, then pitch around the screen-aligned X axis, which
// gives the CAD-style turntable feel where drag-up always tilts the
// orb the same way regardless of the current yaw.
fn projectedCenter(
  p: vec3f,
  aspect: f32,
  rotation: mat3x3<f32>,
  viewZoom: f32,
  viewPan: vec2f,
) -> vec3f {
  let rotated = rotation * p;
  let depthScale = clamp(1.0 + rotated.z * 0.22, 0.76, 1.28);
  let zoomedX = rotated.x * depthScale * viewZoom / max(aspect, 0.1);
  let zoomedY = rotated.y * depthScale * viewZoom;
  return vec3f(zoomedX + viewPan.x, zoomedY + viewPan.y, rotated.z);
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

fn landingBaseColor() -> vec3f {
  return computeFrame.baseColor.rgb;
}

// Cheap deterministic per-particle hash in [0, 1). Driven by the
// instance index so the value is stable across frames — gives every
// particle its own private "personality" that we can use to vary
// burst reach and palette amplification, breaking the lockstep look
// that comes from every hot particle bulging and saturating by the
// same amount.
fn particleHash(i: u32) -> f32 {
  return fract(sin(f32(i) * 91.7382) * 43758.5453);
}

// Higher-quality integer hash for seeding ambient particle positions.
// At 1M+ density the sin/fract hash above shows visible diagonal
// aliasing; this Wang-style 32-bit mixer scrambles index bits more
// thoroughly so adjacent indices land at fully decorrelated positions.
// Two-stage multiply-shift-xor — same family as PCG / squirrel3.
fn iHash(seed: u32) -> u32 {
  var s = seed;
  s = s ^ (s >> 16u);
  s = s * 0x7feb352du;
  s = s ^ (s >> 15u);
  s = s * 0x846ca68bu;
  s = s ^ (s >> 16u);
  return s;
}

fn iHashToFloat(h: u32) -> f32 {
  // Top 24 bits → [0, 1). Avoids the bias from using the low bits
  // (which the multiplier doesn't mix as well as the high bits).
  return f32(h >> 8u) / 16777216.0;
}

// Sample the global "noise color" from the rainbow palette LUT. The
// 8-texel palette texture is configured with linear filter + repeat-U,
// so a normalized cursor in [0, 1) sweeps the wheel once per period
// with a hardware-blended transition across each stop boundary. This
// reproduces the prior Three.js orb's GSAP-tweened uColorNoise without
// any per-frame CPU work or shader-side palette indexing — exactly
// the same single global color drives every particle, and only the
// per-particle vNoise modulates how far each one travels from the
// fixed base toward this noise color.
fn landingNoiseColor(colorTime: f32) -> vec3f {
  let cursor = colorTime / LANDING_RAINBOW_PERIOD_SECONDS;
  return textureSampleLevel(
    paletteTexture,
    paletteSampler,
    vec2f(cursor, 0.5),
    0.0,
  ).rgb;
}

fn visualRadius(
  baseRadius: f32,
  z: f32,
  flag: u32,
  colorTime: f32,
  hoverW: f32,
  selectW: f32,
  focusW: f32,
) -> f32 {
  let pulse = 0.5 + 0.5 * sin(colorTime * 4.2);
  var radius = baseRadius * clamp(1.0 + z * 0.10, 0.88, 1.10);
  if ((flag & ${ORB_WEBGPU_DIM_FLAG}u) != 0u) {
    radius = radius * 0.82;
  }
  if ((flag & ${ORB_WEBGPU_EVIDENCE_FLAG}u) != 0u) {
    radius = radius * (1.20 + pulse * 0.16);
  }
  radius = radius * mix(1.0, 1.46, selectW);
  radius = radius * mix(1.0, 1.70, hoverW);
  radius = radius * mix(1.0, 2.15, focusW);
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
  let weights = computeWeights[i];
  let hoverW = clamp(weights.x, 0.0, 1.0);
  let selectW = clamp(weights.y, 0.0, 1.0);
  let focusW = clamp(weights.z, 0.0, 1.0);
  let amplitude = computeFrame.fieldParams.x;
  let depth = computeFrame.fieldParams.y;
  let frequency = computeFrame.fieldParams.z;
  let waveSpeed = computeFrame.fieldParams.w;
  let colorTime = computeFrame.colorTime * waveSpeed;
  let fieldNoise = landingFieldNoise(
    p.xyz * frequency,
    motion,
    i,
    colorTime,
  );
  // vNoise is the same per-particle "hotness" used downstream for color
  // (baseColor + vNoise*amp*(noiseColor - baseColor)). Computing it
  // here lets the same value drive both *which particles bulge
  // outward* and *which particles take palette color*, so the visible
  // breathing rhythm reads as "the colored particles are the ones
  // bursting away from the cloud."
  let vNoise = clamp(fieldNoise, 0.0, 1.0);
  // Per-particle "personality": same value drives bulge reach and
  // palette amp so the most-saturated particles also bulge most, just
  // some particles always do so more dramatically than others. Keeps
  // the overall mean reach/amp identical to before; the variance is
  // additive, not amplified.
  let pHash = particleHash(i);
  let burstScale = 0.06 + pHash * 0.08;     // mean 0.10, range 0.06..0.14
  let burstAmp = 3.0 + pHash * 2.0;          // mean 4.0,  range 3.0..5.0
  let liveDrift = landingMotionNoise(i, motion, colorTime);
  let normal = normalize(p.xyz + vec3f(0.0001, 0.0001, 0.0001));
  // Yaw angular velocity (rad/sec, smoothed in the runtime) is packed
  // into baseColor.w. Tangent to a yaw spin around the world Y axis is
  // (p.z, 0, -p.x); scaling by omega and a small coefficient gives a
  // tangential drift that lags the rigid camera rotation, producing a
  // visible "swirl" while the user is dragging. The 0.018 magnitude is
  // tuned so a typical drag (~3 rad/sec peak) shifts particles by a few
  // percent of the blob radius — enough to read as flow without breaking
  // the hand-off back to the FBM-driven idle motion.
  let yawOmega = computeFrame.baseColor.w;
  let tangential = vec3f(p.z, 0.0, -p.x) * yawOmega * 0.018;
  // Burst reach: positive-only outward push proportional to vNoise,
  // scaled per particle by burstScale (0.06..0.14, mean 0.10). The
  // symmetric amplitude*fieldNoise wobble stays for the cool side's
  // inward-outward drift; the burstScale*vNoise term only pushes the
  // hot, colored particles outward — and varies in strength per
  // particle so the bulging silhouette reads as ragged, alive, varied.
  let displacedXyz =
    p.xyz * (1.0 + amplitude * fieldNoise + vNoise * burstScale + liveDrift * 0.012) +
    normal * liveDrift * 0.010 +
    motion.xyz * speed * depth * liveDrift +
    tangential;
  let projected = projectedCenter(
    displacedXyz,
    computeFrame.aspect,
    computeFrame.rotation,
    computeFrame.viewZoom,
    computeFrame.viewPan,
  );
  let rotatedNormal = normalize(computeFrame.rotation * normal);
  // Camera-facing brightness driver. dot(N, +Z) is +1 on the near pole,
  // -1 on the far pole; clamp to [0, 1] so the entire back hemisphere
  // settles at the floor instead of leaking into the brightening path
  // (the prior silhouette-Fresnel rim term made back-grazing particles
  // read brighter than near-pole ones, which inverted the hemispheric
  // shading). Offset 0.32 / slope 0.86 produces a 3.7× front-vs-back
  // luminance ratio with the ceiling held at 1.18 — that ceiling is
  // intentional: LANDING_BASE_BLUE_RGB has B=1.0, so any multiplier
  // above 1.18 clips the blue channel and warps hue. Pure RGB scaling
  // is theme-safe (works in both light and dark canvas backgrounds);
  // alpha-based aerial perspective was rejected because premultiplied
  // alpha fades toward the DOM background and would invert the depth
  // cue on light themes.
  let facing = clamp(dot(rotatedNormal, vec3f(0.0, 0.0, 1.0)), 0.0, 1.0);
  let depthLight = clamp(0.32 + facing * 0.86, 0.30, 1.18);
  let pulse = 0.5 + 0.5 * sin(computeFrame.colorTime * 4.2 + f32(i) * 0.037);
  let baseColor = landingBaseColor();
  let noiseColor = landingNoiseColor(computeFrame.colorTime);
  // Maze-verbatim per-particle lerp: stay near baseColor when vNoise
  // is low; spike toward the global noiseColor when vNoise is high.
  // burstAmp (3..5, mean 4) replaces the prior fixed * 4.0 — same
  // average overshoot but per-particle variance, so some hot particles
  // saturate harder than others at the same vNoise.
  let burstColor = clamp(
    baseColor + vNoise * burstAmp * (noiseColor - baseColor),
    vec3f(0.0),
    vec3f(1.0),
  );
  var radius = visualRadius(
    computeSizes[i] * computeFrame.radiusScale,
    projected.z,
    flag,
    computeFrame.colorTime,
    hoverW,
    selectW,
    focusW,
  );
  radius = radius * (1.0 + liveDrift * 0.020) * computeFrame.viewZoom;
  var color = burstColor * depthLight;
  // Outer clamp on the depthLight-coupled term: WebGPU blend factors use
  // (1 - A_src) for one-minus-src-alpha, so source alpha above 1.0 is
  // not meaningful and can interact badly across browsers — keep it
  // bounded even though the prior product would only marginally exceed.
  var alpha =
    clamp(0.92 + depthLight * 0.24, 0.0, 1.0) *
    clamp(attr.w, 0.2, 1.0);
  var halo = 0.0;
  var ring = 0.0;

  if ((flag & ${ORB_WEBGPU_DIM_FLAG}u) != 0u) {
    color = desaturate(color, 0.48) * 0.54;
    alpha = alpha * 0.30;
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
  // Smoothly-fading interaction states. Replaces the prior flag-driven
  // if/max snaps so hover/select/focus visually ease in and out via the
  // CPU-decayed weights buffer.
  color = mix(color, vec3f(1.0, 0.78, 0.46), 0.54 * selectW);
  alpha = max(alpha, 0.90 * selectW);
  halo = max(halo, 0.54 * selectW);
  ring = max(ring, 0.62 * selectW);

  color = mix(color, vec3f(0.78, 0.95, 1.0), 0.62 * hoverW);
  alpha = max(alpha, 0.96 * hoverW);
  halo = max(halo, 0.76 * hoverW);
  ring = max(ring, 0.80 * hoverW);

  color = mix(color, vec3f(1.0, 0.92, 0.66), focusW);
  alpha = mix(alpha, 1.0, focusW);
  halo = mix(halo, 1.0, focusW);
  ring = mix(ring, 1.0, focusW);

  // GPU-resident neighborhood halo around the focused particle. Compute
  // distance in base (paper-bound) space against computePositions[focus]
  // so the halo is stable regardless of per-frame FBM drift; falls off
  // smoothly via smoothstep so there's no hard edge to the cluster.
  let focusIdxRaw = computeFrame.focusIndex;
  if (focusIdxRaw >= 0) {
    let focusIdx = u32(focusIdxRaw);
    if (focusIdx < computeFrame.count && focusIdx != i) {
      let focusPos = computePositions[focusIdx].xyz;
      let dist = length(p.xyz - focusPos);
      let clusterBoost = smoothstep(0.28, 0.0, dist);
      color = mix(color, vec3f(1.0, 0.92, 0.66), clusterBoost * 0.35);
      alpha = max(alpha, 0.55 * clusterBoost);
      halo = max(halo, 0.45 * clusterBoost);
      ring = max(ring, 0.40 * clusterBoost);
    }
  }

  computeDisplay[i] = DisplayParticle(
    vec4f(projected.xy, projected.z, radius),
    vec4f(color, alpha),
    vec2f(halo, ring),
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
    clamp(1.0 + halo * 0.18 + ring * 0.32, 0.0, 1.0);
  let rimColor = in.color.rgb * 1.30 + vec3f(0.02);
  let rgb =
    in.color.rgb * sprite.rgb +
    rimColor * ring * 0.42 +
    rimColor * halo * 0.20;
  return vec4f(rgb * alpha, alpha);
}

// One-shot GPU init for the ambient particle field. Dispatched by the
// runtime on the first non-empty upload (count transitioning from 0 to
// > 0). Replaces the prior CPU-side rejection-sampled 16k FieldPointSource
// + modulo-wrap, which produced visible "sea-urchin" radial spokes at
// 1M particles because every Nth particle aliased onto the same source
// xyz. Fibonacci spiral on the unit sphere distributes 1M points
// quasi-uniformly without any modulo wrap. Velocities and attributes
// are synthesized here too — both are only read, never updated post-init.
@compute @workgroup_size(64)
fn seedAmbientGeometry(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let count = computeFrame.count;
  if (i >= count) {
    return;
  }

  // Hash-driven uniform random sphere sampling via the inverse-CDF
  // method: cos(theta) = 2u - 1 (uniform in [-1, 1] → polar angle
  // weighted by surface area), phi = 2π v (uniform azimuth). The two
  // hashes are decorrelated by salting iHash with the golden-ratio
  // constant on the second draw. This matches the legacy field's
  // rejection-sampled blob source visually — soft, fuzzy, organic —
  // without the Fibonacci parastichies (visible 21/34/55 spiral
  // families) that show up at 1M density on a golden-angle lattice.
  // No pole convergence either, since uniform u doesn't oversample
  // either polar cap.
  let h1 = iHashToFloat(iHash(i));
  let h2 = iHashToFloat(iHash(i ^ 0x9e3779b9u));
  let cosTheta = 2.0 * h1 - 1.0;
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let phi = 6.2831853 * h2;
  let unit = vec3f(cos(phi) * sinTheta, cosTheta, sin(phi) * sinTheta);
  // BLOB_RADIUS = 0.62 (uniform sphere, all axes same — matches the
  // ambient blob radius the prior CPU seeder targeted).
  let pos = unit * 0.62;
  computePositions[i] = vec4f(pos, 0.0);

  // Synthesize a small tangential drift perpendicular to the position.
  // Crossing with a slightly off-axis (0,1,0.001) avoids the degenerate
  // zero-length tangent at the poles where pos is parallel to (0,1,0).
  let tangent = normalize(cross(unit, vec3f(0.0, 1.0, 0.001)));
  computeVelocities[i] = vec4f(tangent * 0.003, 0.0);

  // Per-index hash gives every particle its own subtle attribute jitter
  // so the FBM-driven motion doesn't read as lockstep across the cloud.
  // attr.rgb feeds per-axis speed scaling; attr.w is alpha.
  let h3 = iHashToFloat(iHash(i ^ 0x68bc21ebu));
  computeAttributes[i] = vec4f(
    0.5 + h3 * 0.1,
    0.5 + (1.0 - h3) * 0.1,
    0.5 + h3 * 0.05,
    0.82,
  );
}

@compute @workgroup_size(64)
fn pickParticle(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= pickParams.count) {
    return;
  }
  let display = pickDisplay[i];
  let center = display.center.xy;
  // display.center.w is the final post-everything visual radius written
  // by integrateParticles (visualRadius * (1 + liveDrift*0.020) * viewZoom).
  // Pick uses the same value the renderer drew with — no extra inflation —
  // so a click anywhere inside the visible sprite registers as a hit.
  let radius = display.center.w;
  let delta = vec2f(
    (center.x - pickParams.x) * max(pickParams.aspect, 0.1),
    center.y - pickParams.y,
  );
  let d = length(delta);
  // Depth ordering for atomicMin tie-break — 21-bit index + 11-bit
  // depth pack:
  // - Bits 0..20 carry the particle index (up to 2_097_151 particles).
  // - Bits 21..31 carry the depth quantum; lower = nearer the camera.
  // - +Z is the near pole (see comment block above projectedCenter):
  //   dot(N, +Z)=+1 on the near hemisphere → (2 - z) shrinks for near
  //   particles, so atomicMin selects the front-most candidate.
  // - Range mapping: z in [-2, 2] (post-rotation, pre-projection scale)
  //   → depthQ in [0, 2046]; clamped to 2046 (not 2047) so the worst
  //   real pick result can never collide with the 0xFFFFFFFF "no hit"
  //   sentinel (2047 << 21 | 0x1FFFFF == 0xFFFFFFFF).
  // - Ties on depthQ break by the lower particle index.
  let depthQ = u32(clamp((2.0 - display.center.z) * 0.25, 0.0, 1.0) * 2046.0);
  if (d <= radius && i <= 0x1FFFFFu) {
    atomicMin(&pickResult[0], (depthQ << 21u) | i);
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
