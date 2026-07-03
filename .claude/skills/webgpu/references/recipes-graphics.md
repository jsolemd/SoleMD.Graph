---
name: WebGPU graphics recipes — image kernels, post-processing, lighting
description: End-to-end working recipes for the canonical real-time graphics patterns. Each recipe = mental model + key WGSL + JS driver. Adapt these; do not copy whole.
---

# Graphics recipes

Companion to `recipes-compute.md` (compute-side patterns) and to the platform
references (`api-fundamentals.md`, `texture-resources.md`,
`performance-and-profiling.md`). These are the patterns that ship inside every
modern engine — the ones you should be able to reach for and adapt without
re-deriving.

The structure of each recipe: 1–2 paragraph mental model, the key WGSL kernel,
and the JS scaffolding only when it materially affects the recipe. Workgroup
sizing rationale lives in `compute-fundamentals.md` — don't re-derive it here.

---

## 3. Separable Gaussian blur (image filter)

A 2D Gaussian convolution is mathematically separable into 1D horizontal then
1D vertical. Cost drops from O(k²) per pixel to O(2k). Two further wins on top:
(a) **linear sampling** — a single bilinear `textureSampleLevel` between two
texels reads two weighted samples in one fetch, halving the tap count from a
9-tap to a 5-tap; (b) **workgroup tiling** — every pixel needs `2k+1` neighbour
reads, but neighbours overlap heavily across the workgroup. Cache the row/col
into `var<workgroup>` LDS once, then read from LDS instead of resampling.

The WebGPU samples `imageBlur` kernel uses 4×4-texel-per-thread loading to
saturate texture-sampling hardware. The simpler 1-texel form:

```wgsl
const RADIUS: i32 = 4;             // 9-tap
const TILE  : u32 = 128u;          // pixels per row in workgroup
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inTex: texture_2d<f32>;
@group(0) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> dir: vec2i;   // (1,0) horiz pass, (0,1) vert pass

var<workgroup> tile: array<vec4f, 128 + 8>;     // TILE + 2*RADIUS

@compute @workgroup_size(128, 1, 1)
fn blur(@builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u) {
  let dim = vec2i(textureDimensions(inTex));
  let center = vec2i(wid.xy) * vec2i(i32(TILE), 1) + vec2i(i32(lid.x), 0);
  // cooperative load: each thread loads 1 + first/last RADIUS threads load halo
  let p = clamp(center * dir + vec2i(wid.xy * (1u - u32(dir.y))), vec2i(0), dim - 1);
  tile[lid.x + u32(RADIUS)] = textureLoad(inTex, p, 0);
  if (lid.x < u32(RADIUS)) {
    let lh = clamp(center - vec2i(RADIUS) * dir, vec2i(0), dim - 1);
    tile[lid.x] = textureLoad(inTex, lh, 0);
    let rh = clamp(center + vec2i(i32(TILE) + i32(lid.x)) * dir, vec2i(0), dim - 1);
    tile[u32(RADIUS) + TILE + lid.x] = textureLoad(inTex, rh, 0);
  }
  workgroupBarrier();
  // 9-tap weighted sum (Gaussian σ≈1.6)
  let w = array<f32, 9>(0.028, 0.067, 0.124, 0.180, 0.202, 0.180, 0.124, 0.067, 0.028);
  var acc = vec4f(0.0);
  for (var k: i32 = 0; k < 9; k++) { acc += tile[lid.x + u32(k)] * w[k]; }
  textureStore(outTex, center, acc);
}
```

Drive: dispatch once with `dir = (1,0)` writing `tmpTex`, dispatch again with
`dir = (0,1)` reading `tmpTex` writing `outTex`. For the 4×4-per-thread variant
(2× faster on most desktops because of texture-sampler throughput), see
`webgpu-samples/imageBlur/blur.wgsl` — read it once and steal the structure.

---

## 4. Dual-Kawase blur (downsample + upsample chain)

Marius Bjørge's GDC 2015 trick. Instead of one large σ Gaussian, halve the
resolution four times with a 4-tap downsample kernel, then upsample back with
a 4-tap upsample kernel. Total work is O(N) instead of O(N · k); visually ≈
σ ≈ 32 with kernel-size-1 effort. This is what every modern engine ships for
glow/bloom and the heavy-blur backdrop in Apple's iOS visual effects.

Downsample kernel (each output pixel reads 5 input texels):

```wgsl
@compute @workgroup_size(8, 8)
fn down(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(dstTex);
  if (any(gid.xy >= dim)) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dim);
  let halfPx = 0.5 / vec2f(dim);
  let c = textureSampleLevel(srcTex, samp, uv, 0.0);
  let s0 = textureSampleLevel(srcTex, samp, uv + vec2f(-halfPx.x, -halfPx.y), 0.0);
  let s1 = textureSampleLevel(srcTex, samp, uv + vec2f( halfPx.x, -halfPx.y), 0.0);
  let s2 = textureSampleLevel(srcTex, samp, uv + vec2f(-halfPx.x,  halfPx.y), 0.0);
  let s3 = textureSampleLevel(srcTex, samp, uv + vec2f( halfPx.x,  halfPx.y), 0.0);
  textureStore(dstTex, gid.xy, c * 4.0/8.0 + (s0 + s1 + s2 + s3) * 1.0/8.0);
}
```

Upsample kernel (each output samples 8 around itself, 1.5-px offset):

```wgsl
@compute @workgroup_size(8, 8)
fn up(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(dstTex);
  if (any(gid.xy >= dim)) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dim);
  let p  = 1.0 / vec2f(dim);
  var acc = vec4f(0.0);
  acc += textureSampleLevel(srcTex, samp, uv + vec2f(-p.x*2.0, 0.0), 0.0);
  acc += textureSampleLevel(srcTex, samp, uv + vec2f( p.x*2.0, 0.0), 0.0) ;
  acc += textureSampleLevel(srcTex, samp, uv + vec2f(0.0, -p.y*2.0), 0.0);
  acc += textureSampleLevel(srcTex, samp, uv + vec2f(0.0,  p.y*2.0), 0.0);
  acc += 2.0 * textureSampleLevel(srcTex, samp, uv + vec2f(-p.x, -p.y), 0.0);
  acc += 2.0 * textureSampleLevel(srcTex, samp, uv + vec2f( p.x, -p.y), 0.0);
  acc += 2.0 * textureSampleLevel(srcTex, samp, uv + vec2f(-p.x,  p.y), 0.0);
  acc += 2.0 * textureSampleLevel(srcTex, samp, uv + vec2f( p.x,  p.y), 0.0);
  textureStore(dstTex, gid.xy, acc / 12.0);
}
```

JS chain: 4 down passes (each halves resolution), 4 up passes (each doubles).
Eight texture pyramid mips total. Cite: Bjørge 2015, pmndrs/postprocessing.

---

## 5. Bloom (HDR threshold + Kawase + composite)

HDR scene render → threshold pass keeps pixels above luminance cutoff →
dual-Kawase blur chain (recipe 4) on the threshold result → additive composite
back at full res → tone-map at the very end. **Tone map AFTER bloom** so the
bloom blends in HDR space; tone-mapping first kills the highlights you wanted
to spread.

Threshold + blur seed:

```wgsl
@compute @workgroup_size(8, 8)
fn threshold(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(dst);
  if (any(gid.xy >= dim)) { return; }
  let c = textureLoad(src, gid.xy, 0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let knee = max(0.0, l - 1.0);                           // soft knee
  let k    = knee * knee / (knee + 0.5);
  textureStore(dst, gid.xy, vec4f(c * k / max(l, 1e-4), 1.0));
}
```

Composite (full-res HDR + upsampled bloom):

```wgsl
@compute @workgroup_size(8, 8)
fn composite(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(scene);
  if (any(gid.xy >= dim)) { return; }
  let s = textureLoad(scene, gid.xy, 0).rgb;
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dim);
  let b = textureSampleLevel(bloomBlurred, samp, uv, 0.0).rgb;
  textureStore(outHDR, gid.xy, vec4f(s + b * uIntensity, 1.0));
}
```

Tone-map runs after this (recipe 17). Reference impl: Unreal Engine's
`MobileBloom`, Three.js's `UnrealBloomPass`. The Kawase + soft-knee combination
is what most shipped renderers converge on.

---

## 6. Depth of field (bokeh) via tile-based scatter/gather

CoC = circle of confusion = how blurry a pixel becomes given its depth and the
camera focus model. Per-pixel CoC is `|focal² · (z − focus) / ((focus − focal) · z · aperture)|`
in metres, then converted to pixel radius. Naïve gather (sample `r²` taps per
pixel) collapses past r ≈ 8. Tile-based gather classifies each pixel:

- `coc < 0.5px`: sharp — copy through.
- `coc < 8px`: small — gather with fixed 8 taps in a disc.
- `coc ≥ 8px`: large — gather from a downsampled half- or quarter-res buffer
  with 16+ taps along a Vogel disc (golden-angle sequence).

```wgsl
fn vogel(i: u32, n: u32, r: f32) -> vec2f {
  let goldenAngle: f32 = 2.39996323;
  let theta = f32(i) * goldenAngle;
  let radius = r * sqrt(f32(i) / f32(n));
  return vec2f(cos(theta), sin(theta)) * radius;
}

@compute @workgroup_size(8, 8)
fn dof(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(scene);
  if (any(gid.xy >= dim)) { return; }
  let z = textureLoad(depth, gid.xy, 0).r;
  let coc = compute_coc_pixels(z);
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dim);
  if (coc < 0.5) {
    textureStore(dst, gid.xy, textureLoad(scene, gid.xy, 0));
    return;
  }
  var acc = vec4f(0.0);
  let N: u32 = select(16u, 8u, coc < 8.0);
  let srcTex = select(sceneHalf, scene, coc < 8.0);  // pseudocode — bind both, branch
  for (var i: u32 = 0u; i < N; i++) {
    let off = vogel(i, N, coc) / vec2f(dim);
    acc += textureSampleLevel(srcTex, samp, uv + off, 0.0);
  }
  textureStore(dst, gid.xy, acc / f32(N));
}
```

Reference: PlayDead's *INSIDE* DoF, Frostbite's circular bokeh, Sebastian
Aaltonen's GPU-driven DoF talk (SIGGRAPH 2016).

---

## 7. Screen-space ambient occlusion (SSAO)

SSAO approximates how much of a hemisphere around each pixel is occluded by
nearby geometry — the contact-shadow effect that makes corners darker. For
each pixel: take 16 random samples in a hemisphere oriented along the surface
normal, project each sample to screen space, compare its expected depth against
the depth buffer at that screen position; if buffer is nearer, occlusion +=
weight by distance. Average → AO factor.

Crank-Robert SSAO with normal-oriented hemisphere:

```wgsl
@group(0) @binding(0) var depth: texture_depth_2d;
@group(0) @binding(1) var normal: texture_2d<f32>;
@group(0) @binding(2) var noise: texture_2d<f32>;       // 4x4 random rotations
@group(0) @binding(3) var<uniform> u: AoUniforms;        // proj, invProj, samples[16]
@group(0) @binding(4) var<storage, read_write> ao: array<f32>;

fn view_pos(uv: vec2f) -> vec3f {
  let z = textureSampleLevel(depth, samp, uv, 0.0);
  let ndc = vec4f(uv * 2.0 - 1.0, z, 1.0);
  let v   = u.invProj * ndc;
  return v.xyz / v.w;
}

@compute @workgroup_size(8, 8)
fn ssao(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(depth);
  if (any(gid.xy >= dim)) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dim);
  let p = view_pos(uv);
  let n = normalize(textureLoad(normal, gid.xy, 0).rgb * 2.0 - 1.0);
  let r = textureLoad(noise, gid.xy & vec2u(3u), 0).rgb * 2.0 - 1.0;
  let t = normalize(r - n * dot(r, n));                 // Gram-Schmidt tangent
  let b = cross(n, t);
  let TBN = mat3x3f(t, b, n);
  var occ: f32 = 0.0;
  for (var i: u32 = 0u; i < 16u; i++) {
    let s = TBN * u.samples[i].xyz;                     // hemisphere sample in view
    let sp = p + s * RADIUS;
    let proj = u.proj * vec4f(sp, 1.0);
    let sUV = (proj.xy / proj.w) * 0.5 + 0.5;
    let dz  = view_pos(sUV).z;
    let range = smoothstep(0.0, 1.0, RADIUS / abs(p.z - dz));
    occ += select(0.0, range, dz >= sp.z + 0.025);
  }
  ao[gid.x + gid.y * dim.x] = 1.0 - occ / 16.0;
}
```

Follow up with a **bilateral blur** (recipe 18) using depth as the range
guide to denoise without softening edges. References: Crytek Crysis SSAO,
McGuire et al's *Saturated Ambient Occlusion*.

---

## 9. Cascaded shadow maps (with reverse-Z)

One sun, many distances. A single shadow map can't cover a 1km vista at 1cm
resolution. Cascades partition view-frustum depth into 4 ranges; each gets its
own light-projection matrix sized to that range; lighting selects which cascade
to sample by view-space depth. **Reverse-Z** (`depthCompare: 'greater'`,
near=1, far=0) wins ~24 bits of precision on a 24-bit depth buffer because
floating-point density is higher near 0.

Shadow-pass vertex shader (depth-only, one cascade per pass):

```wgsl
@group(0) @binding(0) var<uniform> light: mat4x4f;       // cascade VP
@vertex fn vs(@location(0) p: vec3f) -> @builtin(position) vec4f {
  return light * vec4f(p, 1.0);
}
```

Lighting-pass fragment (cascade selection + PCF sampling):

```wgsl
@group(0) @binding(1) var shadowMaps: texture_depth_2d_array;
@group(0) @binding(2) var shadowSamp: sampler_comparison;
@group(0) @binding(3) var<uniform> cascades: array<CascadeData, 4>;

fn pick_cascade(viewZ: f32) -> u32 {
  for (var i: u32 = 0u; i < 4u; i++) {
    if (viewZ < cascades[i].splitDistance) { return i; }
  }
  return 3u;
}

fn shadow(worldPos: vec3f, viewZ: f32, normal: vec3f) -> f32 {
  let c = pick_cascade(viewZ);
  let lp = cascades[c].viewProj * vec4f(worldPos, 1.0);
  let uv = lp.xy / lp.w * vec2f(0.5, -0.5) + 0.5;
  let z  = lp.z / lp.w;
  let bias = max(0.005 * (1.0 - dot(normal, sunDir)), 0.0005);
  // 3x3 PCF
  var v: f32 = 0.0;
  let ts = 1.0 / f32(cascades[c].size);
  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      v += textureSampleCompareLevel(shadowMaps, shadowSamp,
              uv + vec2f(f32(x), f32(y)) * ts, c, z + bias);
    }
  }
  return v / 9.0;                                   // reverse-Z: textureSampleCompare returns 1 if depth > shadowMap
}
```

Reverse-Z setup in JS: `depthClearValue: 0.0`, `depthCompare: 'greater'`,
projection matrix swaps near/far. The `webgpu-samples/shadowMapping` and
`webgpu-samples/reversedZ` samples are direct references; PCF filter from
the same fragment shader.

---

## 10. Volumetric clouds (3D texture + ray march)

Two 3D noise textures: a low-frequency **base** (Perlin-Worley, large lobes)
plus a high-frequency **detail** (Worley) that erodes the base. Both authored
once at startup via a compute kernel writing to `texture_storage_3d`. Per
camera ray, march from cloud-layer entry to exit, sample density at each step,
accumulate transmittance and integrated lighting. Step size adapts: large
inside zero-density regions, small inside dense clouds. ~16 base steps + ~6
shadow steps per ray is enough for 60fps full-screen.

Per-pixel ray march:

```wgsl
@group(0) @binding(0) var baseTex   : texture_3d<f32>;
@group(0) @binding(1) var detailTex : texture_3d<f32>;
@group(0) @binding(2) var<uniform> u: CloudUniforms;

fn density(p: vec3f) -> f32 {
  let base = textureSampleLevel(baseTex, sampLin, p * u.baseScale, 0.0).r;
  let det  = textureSampleLevel(detailTex, sampLin, p * u.detailScale, 0.0).r;
  let d    = saturate(base - det * u.erode);
  return d * height_falloff(p.y);
}

fn march(ro: vec3f, rd: vec3f) -> vec4f {
  var t: f32 = layer_entry(ro, rd);
  let tEnd = layer_exit(ro, rd);
  var transmittance: f32 = 1.0;
  var scattering: vec3f = vec3f(0.0);
  for (var i: i32 = 0; i < 64; i++) {
    if (t > tEnd || transmittance < 0.01) { break; }
    let p = ro + rd * t;
    let d = density(p);
    if (d > 0.0) {
      // shadow ray toward sun
      var st: f32 = 0.0;
      var shadow: f32 = 0.0;
      for (var s: i32 = 0; s < 6; s++) {
        shadow += density(p + sunDir * st) * u.shadowStep;
        st += u.shadowStep;
      }
      let absorb = exp(-d * u.absorption);
      let inscatter = exp(-shadow * u.absorption) * d * u.scatter;
      scattering += transmittance * inscatter * sunColor;
      transmittance *= absorb;
    }
    t += select(u.bigStep, u.smallStep, d > 0.001);
  }
  return vec4f(scattering, 1.0 - transmittance);
}
```

References: Andrew Schneider's "Real-Time Volumetric Cloudscapes" (Horizon
Zero Dawn, GPU Pro 7), Sebastian Hillaire's bullshit-free volumetric talks.

---

## 17. Tone mapping (AgX + sRGB encode)

Tone mapping compresses linear HDR luminance into the [0,1] LDR range. AgX
(Troy Sobotka) is the 2024 successor to ACES/Reinhard/Filmic; it preserves hue
under extreme luminance shifts because it operates on **scene-referred** values
through a 3D LUT and an output-referred curve, rather than a per-channel
saturating curve that twists hue on bright reds and blues. Run the pass AFTER
bloom/DoF/SSAO and BEFORE writing to the swap-chain.

```wgsl
@group(0) @binding(0) var hdr: texture_2d<f32>;
@group(0) @binding(1) var ldr: texture_storage_2d<bgra8unorm, write>;

fn agx_default_contrast_approx(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return + 15.5     * x4 * x2
         - 40.14    * x4 * x
         + 31.96    * x4
         - 6.868    * x2 * x
         + 0.4298   * x2
         + 0.1191   * x
         - 0.00232;
}
const AGX_MAT = mat3x3f(
  vec3f(0.84247906, 0.0784336, 0.07922458),
  vec3f(0.04232824, 0.87846864, 0.07916613),
  vec3f(0.04237565, 0.0784336,  0.87914297));

@compute @workgroup_size(8, 8)
fn tonemap(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(ldr);
  if (any(gid.xy >= dim)) { return; }
  var rgb = textureLoad(hdr, gid.xy, 0).rgb;
  rgb = max(rgb, vec3f(0.0));
  rgb = AGX_MAT * rgb;
  let logRGB = clamp(log2(max(rgb, vec3f(1e-10))), vec3f(-12.47393), vec3f(4.026069));
  let t = (logRGB + 12.47393) / (4.026069 + 12.47393);
  let mapped = agx_default_contrast_approx(t);
  // sRGB encode (canvas is bgra8unorm-srgb if you bound an sRGB-view; otherwise encode here)
  let enc = pow(mapped, vec3f(1.0 / 2.2));
  textureStore(ldr, gid.xy, vec4f(enc, 1.0));
}
```

When the render target is an sRGB-view (`bgra8unorm-srgb` or `rgba8unorm-srgb`),
**skip the manual `pow`** — hardware encodes for you. See
`texture-resources.md#3-the-srgb-view-trick`. SoleMD's orb glow uses AgX over
ACES (see `MEMORY.md/orb_tone_mapping`) precisely because of the hue stability
under emissive-particle extremes.

---

## 18. Bilateral filter (edge-preserving blur)

Plain Gaussian blurs across edges. Bilateral weights each tap by **both** spatial
distance *and* range distance (color or depth difference). Where range differs,
weight collapses to ~0 — blur stays on one side of the edge. Used to denoise
SSAO (recipe 7), denoise ML noise reduction passes, and finish stochastic
shading.

Separable approximation (mathematically wrong but visually close, 5× faster):

```wgsl
const RAD: i32 = 4;
@group(0) @binding(0) var src:  texture_2d<f32>;
@group(0) @binding(1) var dGuide: texture_depth_2d;
@group(0) @binding(2) var dst:  texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> dir: vec2i;     // (1,0) horiz / (0,1) vert

@compute @workgroup_size(8, 8)
fn bilateral(@builtin(global_invocation_id) gid: vec3u) {
  let dim = vec2i(textureDimensions(src));
  if (any(gid.xy >= vec2u(dim))) { return; }
  let p = vec2i(gid.xy);
  let cZ  = textureLoad(dGuide, p, 0);
  let cC  = textureLoad(src,    p, 0);
  let sigmaSpatial = f32(RAD) * 0.5;
  let sigmaRange   = 0.05;          // tune for depth scale
  var acc = vec4f(0.0);
  var wsum: f32 = 0.0;
  for (var k: i32 = -RAD; k <= RAD; k++) {
    let q  = clamp(p + dir * k, vec2i(0), dim - 1);
    let qZ = textureLoad(dGuide, q, 0);
    let qC = textureLoad(src,    q, 0);
    let ws = exp(-f32(k * k) / (2.0 * sigmaSpatial * sigmaSpatial));
    let dz = qZ - cZ;
    let wr = exp(-(dz * dz) / (2.0 * sigmaRange * sigmaRange));
    let w  = ws * wr;
    acc  += qC * w;
    wsum += w;
  }
  textureStore(dst, p, acc / max(wsum, 1e-4));
}
```

For the SSAO denoise specifically, the depth guide is the right range channel.
For noise reduction on a colour render target, use luminance. References:
`pmndrs/postprocessing` SSAO denoise pass, NVIDIA Gameworks bilateral guide.

---

## Cross-references

- HDR canvas configuration, color management: `api-fundamentals.md#7-canvas-configuration`
- Storage textures, sRGB views, MSAA: `texture-resources.md`
- Workgroup sizing, tile patterns: `compute-fundamentals.md`,
  `gpgpu-recipes.md`
- Render bundles + indirect draws (drives recipe 8 from compute side):
  `performance-and-profiling.md`, `recipes-compute.md#8-gpu-driven-culling-hiz--cluster-culling`
- Companion compute recipes (particles, FFT, GEMM, BVH): `recipes-compute.md`
