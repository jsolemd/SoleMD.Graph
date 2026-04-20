# Maze Shader Material Contract

Use this reference when a task touches point attributes, uniforms, shaders,
point sprite treatment, or scene preset values.

Source ground truth:

- shader code: `index.html:2119-2393`
- material factory: `scripts.pretty.js:42545-42595`
- default color pair: `scripts.pretty.js:42564-42569`
- stream material branch: `scripts.pretty.js:42577-42581`
- `?blending` URL param: `scripts.pretty.js:42580`

Current SoleMD implementation lives in
`apps/web/features/ambient-field/renderer/field-shaders.ts` and
`apps/web/features/ambient-field/scene/visual-presets.ts`. The old pulse-era
uniform family (`uPulseRate`, `uPulseStrength`, `uPulseThreshold`,
`uPulseSoftness`) and the later bucket-accent / burst-overlay experiment are
fully retired. The shipped SoleMD shader uses one vec3 base/noise pair
(`uColorBase` / `uColorNoise`) and does not read per-point `color`.

## Shared Material Family

Maze uses one shared particle material factory:

```text
geometry source
  ->
jo.addParams(...)
  ->
Fl.getMaterial("Shader", slug)
  ->
new THREE.Points(...)
```

Important implications:

- procedural, bitmap, and model-backed scenes all converge on the same shader
  family
- `stream` is the only slug with a material-time branch
- scene identity comes primarily from source coordinates plus preset values, not
  from bespoke per-scene materials

Default material behavior:

- `transparent = true`
- `depthTest = false`
- default blending is normal blending
- additive blending only appears behind the `?blending` debug switch

Do not assume "premium glow" means additive blending by default. SoleMD exposes
the same toggle via `?field-blending=additive` in `resolveFieldBlending()`.

## Shader-Active Attribute Family

The live particle shaders consume:

- `aAlpha`
- `aIndex`
- `aSelection`
- `aStreamFreq`
- `aFunnelNarrow`
- `aFunnelThickness`
- `aFunnelStartShift`
- `aFunnelEndShift`
- `aMove`
- `aSpeed`
- `aRandomness`
- `aBucket` (baked for hotspot/color bookkeeping only; shader-inactive today)

Geometry also carries:

- `color`

Important quirks:

- `color` is injected on the geometry, but the live particle shaders do not
  read it. Maze's 5-color palette bake
  (`scripts.pretty.js:42641-42664`: `#EFF0F0 5%`, `#02E8FF 30%`, `#42A4FE 30%`,
  `#8958FF 10%`, `#D409FE 10%`) is decorative.
- SoleMD keeps a small `color` buffer filled from a bucket-color fallback map
  (`paper=#42A4FE`, `entity=#8958FF`, `relation=#02E8FF`, `evidence=#D409FE`)
  only to keep the legacy `getPointColorCss` hotspot sampler working until
  Phase 7 retires it.
- `aBucket` is a float holding the bucket index (0..N-1) in
  `SOLEMD_DEFAULT_BUCKETS` order. It is currently preserved for CPU-side
  bucket semantics and future extensions, not for live shader branching.

For parity work, treat `color` as present-but-inactive unless the shader family
is intentionally rewritten.

## Uniform Family

Shared uniforms (Maze):

- `uPixelRatio`
- `uIsMobile`
- `uScreen`
- `uAlpha`
- `uTime`
- `uScale`
- `uSize`
- `uSpeed`
- `pointTexture`
- `uDepth`
- `uAmplitude`
- `uFrequency`
- `uRcolor` / `uGcolor` / `uBcolor` / `uRnoise` / `uGnoise` / `uBnoise`
  (Maze shape; SoleMD has diverged — see below)
- `uStream`
- `uSelection`

Color uniforms in Maze are six scalars
(`scripts.pretty.js:42564-42569`: `uRcolor=40, uGcolor=197, uBcolor=234`
cyan base; `uRnoise=202, uGnoise=50, uBnoise=223` magenta noise). SoleMD
replaces that family with the shipped pair `uColorBase: vec3` and
`uColorNoise: vec3`. `BlobController` drives rainbow motion by tweening the
live `uColorNoise` value through `LANDING_RAINBOW_RGB`; stream and pcb keep the
Maze-faithful cyan→magenta pair static. Do not collapse SoleMD's shape back
into the six scalars.

Stream-only uniforms:

- `uWidth`
- `uHeight`
- `uFunnelStart`
- `uFunnelEnd`
- `uFunnelThick`
- `uFunnelNarrow`
- `uFunnelStartShift`
- `uFunnelEndShift`
- `uFunnelDistortion`

Important quirk:

- `uScreen` is provisioned on the material but unused by the inline particle
  shaders

## Exact Transform Order

The shared vertex path is:

```text
position
  ->
vNoise = fbm(position * (uFrequency + aStreamFreq * uStream))
  ->
vColor from uColorBase + clamp(vNoise, 0, 1) * 4.0 * (uColorNoise - uColorBase)
  ->
displaced = position
  ->
displaced *= (1.0 + uAmplitude * vNoise)
  ->
displaced += uScale * uDepth * aMove * aSpeed * snoise_1_2(aIndex, uTime * uSpeed)
  ->
if uStream > 0:
  conveyor motion
  wrap x into stream width
  funnel thickness and y shift
  z cosine warp
  90 degree non-desktop rotation
  ->
modelView / projection
  ->
distance-based point size
  ->
distance-based alpha and selection cut
```

The amplitude multiply is global, not blob-only. Blob scenes just reveal it
more clearly because their source geometry is spherical.

## Point Size And Alpha

Perspective importance is a core part of the look:

- `gl_PointSize = uSize * 100.0 / vDistance * uPixelRatio`
- `vAlpha = uAlpha * aAlpha * (300.0 / vDistance)`
- points with `aSelection > uSelection` are hidden by zeroing alpha

Important quirk:

- Maze's shader calls `clamp(gl_PointSize, 1.0, 100.0);` but discards the
  return value. SoleMD does not emit that dead statement; the behavior is
  unchanged.

If SoleMD fixes that in a parity rebuild, document it as an intentional
divergence.

## Fragment Shader Contract

The fragment path is minimal:

```glsl
gl_FragColor = vec4(vColor, vAlpha);
gl_FragColor *= texture2D(pointTexture, gl_PointCoord);
```

SoleMD divergence: after multiplying in the sprite, the fragment shader
discards samples with `color.a <= 0.01` to cut fill-rate on feathered sprite
edges. This is a pure performance win and does not change the visual result
under normal or additive blending.

There is no extra lighting model in the fragment shader. The look comes from:

- source coordinates
- noise/deformation
- point sprite texture
- distance-scaled size/alpha
- `BlobController`-driven `uColorNoise` motion on the blob layer

## Stream Branch Constants

Material defaults for `stream`:

- `uStream = 1`
- `uWidth = 2`
- `uHeight = 0.4`
- `uFunnelStart = -0.18`
- `uFunnelEnd = 0.3`
- `uFunnelThick = 0`
- `uFunnelNarrow = 0`
- `uFunnelStartShift = 0`
- `uFunnelEndShift = 0`
- `uFunnelDistortion = 1`

Preset-level stream values:

- `uDepth = 0.69`
- `uAmplitude = 0.05`
- `uFrequency = 1.7`
- `uSize = 10`

The mobile rotation branch is:

- 90 degree XY rotation whenever `uIsMobile` is true
- `uIsMobile` means every non-desktop width below `1024px`

## Shared Preset Constants Worth Preserving

- `NUM_OCTAVES = 5`
- runtime increments `uTime += 0.002` (foreground) via `FieldLoopClock`
  singleton at `renderer/field-loop-clock.ts`
- default `uSize = 8`
- blob preset (`scripts.pretty.js:42427-42433`):
  - `uDepth = 0.3`
  - `uAmplitude = 0.05`
  - `uFrequency = 0.5`
  - Adjacent `sphere` preset at `:42451` uses `0.5 / 0.4 / 0.7` —
    pre-Round-14 docs conflated the two.
- pcb preset:
  - `uDepth = 0.3`
  - `uAmplitude = 0.05`
  - `uFrequency = 0.1`
  - `uSize = 6`

## Parity-Sensitive Quirks

These are strange enough that agents may "fix" them by accident:

- SoleMD diverges from Maze's six-scalar `uR/G/B color/noise` color lerp by
  collapsing it to `uColorBase: vec3` and `uColorNoise: vec3`. This preserves
  the binary-lerp visual grammar while removing Maze's blue-channel typo by
  construction.
- `uScreen` exists but is inactive
- geometry `color` exists but is inactive for the live shader (SoleMD still
  writes it for the legacy hotspot color sampler; see Attribute Family note
  above)
- point-size `clamp(...)` is a no-op in Maze; SoleMD omits the dead statement
- Raw `scrollTop` is low-passed through `UniformScrubber` at the scroll
  driver's input stage to emulate Maze's single-timeline `scrub: 1`.
  Downstream shader scrubbers still apply their own 1 s half-life for
  uniform-specific polish.

If SoleMD changes any of these, do it deliberately and record the divergence.

## Implementation Rules For SoleMD

- keep one shared particle material family across scene slugs
- change source coordinates first, uniforms second, and material branching last
- keep stream as a source-plus-uniform specialization, not a separate renderer
- do not reintroduce mesh rendering for scenes that should stay point-based
- do not replace point sprites with flat circles unless the visual target also
  changes
- do not reintroduce retired pulse-era or burst-overlay uniform families; the
  shipped `uColorBase` / `uColorNoise` pair is the live contract

## Retired (Round 14)

Older SoleMD notes described a temporary experiment with:

- `uBaseColor: vec3`
- `uBucketAccents: vec3[4]`
- `uBurstType`
- `uBurstStrength`
- `uBurstColor`
- `uBurstRegionScale`
- `uBurstSoftness`

That family is not part of the shipped shader contract. Keep it documented only
as historical context; do not build new surface work against it.
